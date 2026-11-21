package app.outage.log

import java.time.Instant
import java.time.YearMonth
import java.time.ZoneId

/** What the log says about right now (R10.1). */
enum class NowKind { ON, OUT, OFF_CHARGER, UNKNOWN, NONE }

/** One outage in the list. [unsure] marks an end that is only a late `REPLUG` or a sensor stop (R2.6). */
data class OutageRow(val startMs: Long, val endMs: Long?, val source: LogSource, val unsure: Boolean)

/** The facts a share card carries (R8). Numbers only: no location, area name, install ID or name (R8.2, PL9). */
data class ShareFacts(
    val month: YearMonth,
    val score: Int?,
    val powerHours: Double,
    val outageCount: Int,
    /** Days with enough data in the month (R8.3). */
    val daysCovered: Int,
)

/** Everything the Power Log screen shows, computed from the raw inputs (R10). */
data class PowerLogView(
    val nowMs: Long,
    val now: NowKind,
    val sinceMs: Long?,
    val today: LogDayStat,
    val last30: List<LogDayStat>,
    val outages: List<OutageRow>,
    val month: YearMonth,
    val score: LightScore,
    val promise: PromiseComparison?,
    val promiseText: String?,
    val share: ShareFacts,
    val hasData: Boolean,
) {
    /** Hours with power seen today so far (time watched, ON or OUT, minus outage). Null with nothing watched today. */
    val todayWatchedPowerHours: Double?
        get() = Stats.watchedPowerHours(today)

    /** The open `OUT` interval (R10.1). */
    val openOut: OutageRow? get() = outages.firstOrNull { it.endMs == null }
}

/** Pure view builder over [TimelineBuilder] and [Stats]. The clock and zone are inputs. */
object PowerLogModel {
    const val LIST_DAYS = 30
    const val MAX_ROWS = 50

    fun build(inputs: List<LogInput>, nowMs: Long, zone: ZoneId, band: Band?): PowerLogView {
        val intervals = TimelineBuilder.build(inputs, nowMs)
        val today = Instant.ofEpochMilli(nowMs).atZone(zone).toLocalDate()
        val month = YearMonth.from(today)
        val last30 = (LIST_DAYS - 1 downTo 0).map { Stats.day(intervals, today.minusDays(it.toLong()), zone, nowMs) }
        val monthDays = Stats.month(intervals, month, zone, nowMs)
        val score = Stats.lightScore(monthDays, month)
        val promise = Stats.promise(last30, band)

        val from = nowMs - LIST_DAYS * 86_400_000L
        val outages = intervals.filter { it.state == LogState.OUT && (it.endMs ?: nowMs) > from }
            .map { OutageRow(it.startMs, it.endMs, it.source, it.unsure) }
            .sortedByDescending { it.startMs }.take(MAX_ROWS)

        val last = intervals.lastOrNull()
        val now = when (last?.state) {
            LogState.ON -> NowKind.ON
            LogState.OUT -> NowKind.OUT
            LogState.OFF_CHARGER -> NowKind.OFF_CHARGER
            LogState.UNKNOWN -> NowKind.UNKNOWN
            null -> NowKind.NONE
        }
        val withData = monthDays.filter { it.powerHours != null }
        val monthOutages = intervals.count { it.state == LogState.OUT && Instant.ofEpochMilli(it.startMs).atZone(zone).let { z -> YearMonth.from(z) == month } }
        return PowerLogView(
            nowMs = nowMs,
            now = now,
            sinceMs = last?.startMs,
            today = Stats.day(intervals, today, zone, nowMs),
            last30 = last30,
            outages = outages,
            month = month,
            score = score,
            promise = promise,
            promiseText = promise?.let(Stats::promiseText),
            share = ShareFacts(month, score.score, withData.sumOf { it.powerHours ?: 0.0 }, monthOutages, withData.size),
            hasData = intervals.any { it.state == LogState.ON || it.state == LogState.OUT },
        )
    }
}

/** The tariff band choice is stored with the log's settings (R5.1). Null means none chosen (R5.6). */
class BandChoice(private val store: LogStore, private val config: BandConfig?) {
    val bands: List<Band> get() = config?.bands.orEmpty()

    fun chosen(): Band? = store.getSetting(KEY)?.let { id -> config?.band(id) }

    fun choose(id: String?) = store.putSetting(KEY, id?.takeIf { config?.band(it) != null })

    private companion object {
        const val KEY = "band"
    }
}
