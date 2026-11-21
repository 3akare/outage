package app.outage.insights

import app.outage.log.Band
import app.outage.log.LightScore
import app.outage.log.ScoreDay
import app.outage.log.Stats
import java.time.DayOfWeek
import java.time.Instant
import java.time.YearMonth
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.temporal.ChronoUnit

/** One outage on the phone's own spot. [endMs] null means it is still going. Pure data, no clock. */
data class Outage(val startMs: Long, val endMs: Long?, val simulated: Boolean = false)

/** A stretch of time the phone was watching (ON or OUT in the Power Log). [endMs] null means it is still going. */
data class Watched(val startMs: Long, val endMs: Long?)

/**
 * The Power Log timeline as insights see it: the outages and when observation began (first armed time). [watched] is the
 * time actually watched; null means every moment since [observedFromMs] was watched (the demo history and tests). Time
 * off the charger or not watched is not observed time, so it never counts as power.
 */
data class InsightsInput(val outages: List<Outage>, val observedFromMs: Long, val simulated: Boolean, val watched: List<Watched>? = null)

/** One local day. [powerHours] is null when coverage is under 50% (power-log R3.2), never 0 (IN4). */
data class DayStat(
    val dayStartMs: Long,
    val observedHours: Double,
    val outageHours: Double,
    val coverage: Double,
    val powerHours: Double?,
    val outageCount: Int,
)

/** A weekday (Monday = 0) by hour slot. [share] is outage time over observed time, null when seen under 3 times (IN2). */
data class HeatCell(val weekday: Int, val hour: Int, val seen: Int, val share: Double?)

data class LongOutage(val startMs: Long, val durationMs: Long, val ongoing: Boolean)

/** Average power per day against the band (R9). [verified] false must be shown as unconfirmed. */
data class PromiseCheck(
    val bandId: String,
    val promisedHours: Int,
    val verified: Boolean,
    val avgPowerHours: Double,
    val diffHours: Double,
    val daysBelow: Int,
    val daysWithData: Int,
)

data class WorstSlot(val weekday: Int, val hour: Int, val share: Double)

data class InsightsResult(
    val rangeDays: Int,
    val days: List<DayStat>,
    val daysWithData: Int,
    val underSevenDays: Boolean,
    val outageCount: Int,
    val outageHours: Double,
    val avgPowerHoursPerDay: Double?,
    val longest: List<LongOutage>,
    val heatmap: List<HeatCell>,
    val worstSlot: WorstSlot?,
    val weeklyTrend: List<Double?>,
    val meanGapMs: Long?,
    val promise: PromiseCheck?,
    val simulated: Boolean,
)

/**
 * Every number on the Insights screen (spec app-map-insights R7 to R10, ADR 0023). A pure function of the
 * outages, the observation start, the band, the time zone and `nowMs`, so it can be recomputed and tested (power-log R3.6).
 * Compose draws these numbers and never decides them.
 */
object InsightsCalc {
    const val MIN_DAY_COVERAGE = 0.5
    const val MIN_SLOT_SEEN = 3
    const val MIN_DAYS_FOR_PATTERNS = 7
    const val MIN_DAYS_FOR_SENTENCE = 14
    const val MIN_OUTAGES_FOR_GAP = 3
    const val TREND_WEEKS = 12
    const val LONGEST_COUNT = 5
    private const val HOUR_MS = 3_600_000.0

    private data class Span(val s: Long, val e: Long)

    fun compute(input: InsightsInput, nowMs: Long, zone: ZoneId, rangeDays: Int, band: Band?): InsightsResult {
        require(rangeDays > 0) { "rangeDays" }
        val observedFrom = minOf(input.observedFromMs, nowMs)
        val merged = merge(input.outages, observedFrom, nowMs)
        // Outage time is watched time too, so it joins the watched spans.
        val watched = input.watched?.let { w -> union(w.map { Span(it.startMs, minOf(it.endMs ?: nowMs, nowMs)) } + merged, observedFrom) }
            ?: listOf(Span(observedFrom, nowMs))

        // Day stats cover the longer of the range and the 12-week trend window.
        val today = Instant.ofEpochMilli(nowMs).atZone(zone).toLocalDate()
        val trendStart = today.with(DayOfWeek.MONDAY).minusWeeks((TREND_WEEKS - 1).toLong())
        val rangeStart = today.minusDays((rangeDays - 1).toLong())
        val first = if (trendStart.isBefore(rangeStart)) trendStart else rangeStart
        val all = generateSequence(first) { it.plusDays(1) }.takeWhile { !it.isAfter(today) }.map { d ->
            val ds = d.atStartOfDay(zone).toInstant().toEpochMilli()
            val de = d.plusDays(1).atStartOfDay(zone).toInstant().toEpochMilli()
            d to dayStat(ds, de, observedFrom, nowMs, merged, watched)
        }.toList()

        val days = all.filter { !it.first.isBefore(rangeStart) }.map { it.second }
        val withData = days.filter { it.powerHours != null }
        val avg = if (withData.isEmpty()) null else withData.sumOf { it.powerHours!! } / withData.size

        val windowStart = maxOf(rangeStart.atStartOfDay(zone).toInstant().toEpochMilli(), observedFrom)
        val inRange = merged.filter { it.e > windowStart && it.s < nowMs }
        val clipped = inRange.map { Span(maxOf(it.s, windowStart), minOf(it.e, nowMs)) }
        val longest = inRange.sortedWith(compareByDescending<Span> { it.e - it.s }.thenBy { it.s }).take(LONGEST_COUNT)
            .map { LongOutage(it.s, it.e - it.s, it.e >= nowMs && input.outages.any { o -> o.endMs == null }) }
        val gap = if (inRange.size >= MIN_OUTAGES_FOR_GAP) {
            (inRange.last().s - inRange.first().s) / (inRange.size - 1)
        } else null

        val heat = heatmap(merged, watched, windowStart, nowMs, zone)
        val worst = if (withData.size >= MIN_DAYS_FOR_SENTENCE) {
            heat.filter { it.share != null && it.share > 0.0 }
                .maxWithOrNull(compareBy<HeatCell> { it.share!! }.thenByDescending { it.weekday * 24 + it.hour })
                ?.let { WorstSlot(it.weekday, it.hour, it.share!!) }
        } else null

        val trend = (0 until TREND_WEEKS).map { w ->
            val ws = trendStart.plusWeeks(w.toLong())
            val ph = all.filter { !it.first.isBefore(ws) && it.first.isBefore(ws.plusWeeks(1)) }.mapNotNull { it.second.powerHours }
            if (ph.isEmpty()) null else ph.average()
        }

        val promise = if (band != null && avg != null) PromiseCheck(
            bandId = band.id,
            promisedHours = band.promisedMinHoursPerDay,
            verified = band.verified,
            avgPowerHours = avg,
            diffHours = avg - band.promisedMinHoursPerDay,
            daysBelow = withData.count { it.powerHours!! < band.promisedMinHoursPerDay },
            daysWithData = withData.size,
        ) else null

        return InsightsResult(
            rangeDays = rangeDays,
            days = days,
            daysWithData = withData.size,
            underSevenDays = withData.size < MIN_DAYS_FOR_PATTERNS,
            outageCount = inRange.size,
            outageHours = clipped.sumOf { it.e - it.s } / HOUR_MS,
            avgPowerHoursPerDay = avg,
            longest = longest,
            heatmap = heat,
            worstSlot = worst,
            weeklyTrend = trend,
            meanGapMs = gap,
            promise = promise,
            simulated = input.simulated,
        )
    }

    /**
     * The Light Score of [days] by the one rule the Power Log uses too ([Stats.scoreOf]): the share of watched time with
     * power over the days at least half watched, null below 7 such days.
     */
    fun lightScore(days: List<DayStat>, month: YearMonth): LightScore {
        val q = days.filter { it.powerHours != null }.map { ScoreDay(watchedHours = it.observedHours, powerHours = it.powerHours!!) }
        return LightScore(month, q.size, Stats.scoreOf(q))
    }

    /** Clips to the observed window, drops empty spans, sorts and merges overlaps so no time counts twice (IN1). */
    private fun merge(outages: List<Outage>, from: Long, now: Long): List<Span> =
        union(outages.map { Span(it.startMs, minOf(it.endMs ?: now, now)) }, from)

    private fun union(list: List<Span>, from: Long): List<Span> {
        val spans = list.filter { it.e > it.s && it.e > from }.sortedBy { it.s }
        val out = ArrayList<Span>()
        for (sp in spans) {
            val last = out.lastOrNull()
            if (last != null && sp.s <= last.e) out[out.size - 1] = Span(last.s, maxOf(last.e, sp.e)) else out += sp
        }
        return out
    }

    private fun overlap(aS: Long, aE: Long, bS: Long, bE: Long): Long = maxOf(0L, minOf(aE, bE) - maxOf(aS, bS))

    private fun dayStat(ds: Long, de: Long, observedFrom: Long, now: Long, merged: List<Span>, watched: List<Span>): DayStat {
        val len = (de - ds).toDouble()
        val obsS = maxOf(ds, observedFrom)
        val obsE = minOf(de, now)
        val observed = if (obsE <= obsS) 0L else watched.sumOf { overlap(it.s, it.e, obsS, obsE) }
        val outage = if (observed == 0L) 0L else merged.sumOf { overlap(it.s, it.e, obsS, obsE) }
        val cov = observed / len
        val count = merged.count { overlap(it.s, it.e, obsS, obsE) > 0 && observed > 0 }
        return DayStat(
            dayStartMs = ds,
            observedHours = observed / HOUR_MS,
            outageHours = outage / HOUR_MS,
            coverage = cov,
            powerHours = if (cov >= MIN_DAY_COVERAGE) (observed - outage) / HOUR_MS else null,
            outageCount = count,
        )
    }

    private fun heatmap(merged: List<Span>, watched: List<Span>, from: Long, now: Long, zone: ZoneId): List<HeatCell> {
        val seen = IntArray(7 * 24)
        val obs = LongArray(7 * 24)
        val out = LongArray(7 * 24)
        var t: ZonedDateTime = Instant.ofEpochMilli(from).atZone(zone).truncatedTo(ChronoUnit.HOURS)
        while (t.toInstant().toEpochMilli() < now) {
            val s = t.toInstant().toEpochMilli()
            val e = t.plusHours(1).toInstant().toEpochMilli()
            val o = if (minOf(e, now) <= maxOf(s, from)) 0L else watched.sumOf { overlap(it.s, it.e, maxOf(s, from), minOf(e, now)) }
            if (o * 2 >= e - s) {
                val i = (t.dayOfWeek.value - 1) * 24 + t.hour
                seen[i]++
                obs[i] += o
                out[i] += merged.sumOf { overlap(it.s, it.e, maxOf(s, from), minOf(e, now)) }
            }
            t = t.plusHours(1)
        }
        return (0 until 7 * 24).map { i ->
            HeatCell(i / 24, i % 24, seen[i], if (seen[i] < MIN_SLOT_SEEN || obs[i] == 0L) null else out[i].toDouble() / obs[i])
        }
    }
}
