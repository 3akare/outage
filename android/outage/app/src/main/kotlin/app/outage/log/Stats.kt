package app.outage.log

import java.time.Instant
import java.time.LocalDate
import java.time.YearMonth
import java.time.ZoneId
import java.util.Locale
import kotlin.math.roundToInt

/**
 * One local day (R3, design section 5). [powerHours] is the time watched (ON or OUT) minus outage time; time off the
 * charger or not watched never counts as power. Null when coverage is below 50% (R3.2). An estimate (R3.4).
 */
data class LogDayStat(
    val day: LocalDate,
    val dayLengthMs: Long,
    val outageMs: Long,
    val outageCount: Int,
    val longestMs: Long,
    val coverage: Double,
    val powerHours: Double?,
    /** Time watched (ON or OUT) in the day. */
    val watchedMs: Long = 0L,
)

/** A month's Light Score (R4). [score] is null with fewer than 7 qualifying days: "Day N of 7" (R4.3). */
data class LightScore(val month: YearMonth, val qualifyingDays: Int, val score: Int?)

/** One qualifying day for [Stats.scoreOf]: hours watched (ON or OUT) and, of those, hours with power. */
data class ScoreDay(val watchedHours: Double, val powerHours: Double)

/**
 * Daily statistics, Light Score, computed from the timeline only (R3.6). Pure: the clock and
 * the time zone are inputs. Day boundaries are local midnight, so a day can be 23 or 25 hours long (R3.5).
 */
object Stats {
    const val MIN_COVERAGE = 0.5
    const val MIN_SCORE_DAYS = 7
    private const val HOUR_MS = 3_600_000.0

    fun day(intervals: List<LogInterval>, day: LocalDate, zone: ZoneId, nowMs: Long): LogDayStat {
        val ds = day.atStartOfDay(zone).toInstant().toEpochMilli()
        val de = day.plusDays(1).atStartOfDay(zone).toInstant().toEpochMilli()
        val len = de - ds
        var outage = 0L
        var known = 0L
        var longest = 0L
        var count = 0
        for (i in intervals) {
            val o = overlap(i, ds, de, nowMs)
            if (i.state == LogState.OUT) {
                outage += o
                longest = maxOf(longest, o)
                if (i.startMs in ds until de) count++
            }
            if (i.state == LogState.OUT || i.state == LogState.ON) known += o
        }
        val coverage = known.toDouble() / len
        val power = if (coverage >= MIN_COVERAGE) (known - outage) / HOUR_MS else null
        return LogDayStat(day, len, outage, count, longest, coverage, power, known)
    }

    /** Hours with power actually seen in the day (watched minus outage), whatever the coverage. Null if nothing was watched. */
    fun watchedPowerHours(d: LogDayStat): Double? =
        if (d.watchedMs <= 0L) null else (d.watchedMs - d.outageMs).coerceAtLeast(0L) / HOUR_MS

    /** Every day of [month] up to today. */
    fun month(intervals: List<LogInterval>, month: YearMonth, zone: ZoneId, nowMs: Long): List<LogDayStat> {
        val today = Instant.ofEpochMilli(nowMs).atZone(zone).toLocalDate()
        return (1..month.lengthOfMonth()).map { month.atDay(it) }.filter { !it.isAfter(today) }
            .map { day(intervals, it, zone, nowMs) }
    }

    fun lightScore(days: List<LogDayStat>, month: YearMonth): LightScore {
        val q = days.filter { YearMonth.from(it.day) == month && it.powerHours != null }
            .map { ScoreDay(watchedHours = it.watchedMs / HOUR_MS, powerHours = it.powerHours!!) }
        return LightScore(month, q.size, scoreOf(q))
    }

    /**
     * The one Light Score rule, used by the Power Log: over the qualifying days (at least 50% watched, R3.2),
     * the share of watched time that had power, as a whole percent. Null below [MIN_SCORE_DAYS] qualifying days (R4.3).
     */
    fun scoreOf(days: List<ScoreDay>): Int? {
        if (days.size < MIN_SCORE_DAYS) return null
        val watched = days.sumOf { it.watchedHours }
        if (watched <= 0.0) return null
        return (100 * days.sumOf { it.powerHours } / watched).roundToInt().coerceIn(0, 100)
    }

    /** "Day N of 7" while the score waits for days: the day being collected now, never past 7. */
    fun scoreDayNumber(qualifyingDays: Int): Int = (qualifyingDays + 1).coerceAtMost(MIN_SCORE_DAYS)

    private fun overlap(i: LogInterval, ds: Long, de: Long, nowMs: Long): Long =
        maxOf(0L, minOf(i.endMs ?: nowMs, de, nowMs) - maxOf(i.startMs, ds))
}
