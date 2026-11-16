package app.outage.insights

import app.outage.map.DemoCity
import app.outage.map.DemoCityArea
import java.time.LocalDate
import java.time.ZoneId

/** One outage in an area: local start and length. */
data class AreaCut(val start: java.time.LocalDateTime, val minutes: Int) {
    val end: java.time.LocalDateTime get() = start.plusMinutes(minutes.toLong())
}

/** One local day: hours with power, minutes without, cuts that started that day, and whether it fell short of the band. */
data class AreaDay(val date: LocalDate, val powerHours: Double, val outageMinutes: Int, val cuts: Int, val belowBand: Boolean)

/** One area in the comparison: average hours of power a day and cuts, over the last 7 and the last 30 days. */
data class AreaRank(val slug: String, val name: String, val band: String, val week: Double, val month: Double, val weekCuts: Int, val monthCuts: Int)

/** Everything Insights shows for one area. Every number is derived here; Compose only draws them. */
data class AreaInsights(
    val slug: String,
    val name: String,
    val band: String,
    val bandHours: Int,
    /** The 30 days ending yesterday, oldest first. */
    val days: List<AreaDay>,
    val avgPowerHours: Double,
    val daysBelowBand: Int,
    val cutCount: Int,
    val hoursWithout: Double,
    /** Newest first. */
    val cuts: List<AreaCut>,
    val longest: AreaCut?,
    /** Typical time until power returns: the median length of a cut, in minutes. */
    val medianMinutes: Int?,
    /** Minutes without power by weekday (Monday = 0) and hour, [weekday * 24 + hour]. */
    val heat: IntArray,
    /** Share of each weekday-hour slot without power, 0 to 1, same index. */
    val heatShare: DoubleArray,
    /** The worst slot: weekday and hour with the most time without power. */
    val worstWeekday: Int,
    val worstHour: Int,
    /** Hours without power in each of the last six 7-day blocks ending yesterday, oldest first. */
    val weekly: List<Double>,
)

/**
 * Insights over the simulated city's history (ADR 0053). [DemoCity] holds six weeks of made-up cuts per area, day 0 a
 * Monday. They are laid on the calendar so the generated day for yesterday falls on yesterday's weekday: yesterday is
 * generated day `35 + weekday(yesterday)`, so weekday patterns stay true. Pure: a function of the history and `today`.
 */
object AreaHistory {
    const val RANGE_DAYS = 30
    const val WEEK_BLOCKS = 6

    /** Monday = 0. */
    fun weekday(d: LocalDate): Int = d.dayOfWeek.value - 1

    /** The generated day index that is yesterday. */
    fun lastIndex(today: LocalDate): Int = (DemoCity.HISTORY_WEEKS - 1) * 7 + weekday(today.minusDays(1))

    /** The calendar date of generated day [index]. */
    fun dateOf(index: Int, today: LocalDate): LocalDate = today.minusDays(1).minusDays((lastIndex(today) - index).toLong())

    /** Every cut that started on or before yesterday, on the calendar. Cuts are clipped at the end of yesterday. */
    fun cuts(area: DemoCityArea, today: LocalDate): List<AreaCut> {
        val last = lastIndex(today)
        val endOfYesterday = today.atStartOfDay()
        val out = ArrayList<AreaCut>()
        val o = area.outages
        var i = 0
        while (i + 2 < o.size) {
            val day = o[i]
            if (day <= last) {
                val start = dateOf(day, today).atStartOfDay().plusMinutes(o[i + 1].toLong())
                val mins = minOf(o[i + 2].toLong(), java.time.Duration.between(start, endOfYesterday).toMinutes()).toInt()
                if (mins > 0) out += AreaCut(start, mins)
            }
            i += 3
        }
        return out.sortedBy { it.start }
    }

    /** Minutes of [cut] that fall on [date]. */
    private fun minutesOn(cut: AreaCut, date: LocalDate): Int {
        val ds = date.atStartOfDay()
        val de = ds.plusDays(1)
        val s = maxOf(cut.start, ds)
        val e = minOf(cut.end, de)
        return if (e.isAfter(s)) java.time.Duration.between(s, e).toMinutes().toInt() else 0
    }

    fun days(cuts: List<AreaCut>, today: LocalDate, count: Int, bandHours: Int): List<AreaDay> =
        (count downTo 1).map { back ->
            val d = today.minusDays(back.toLong())
            val off = cuts.sumOf { minutesOn(it, d) }.coerceAtMost(1440)
            val hours = (1440 - off) / 60.0
            AreaDay(d, hours, off, cuts.count { it.start.toLocalDate() == d }, hours < bandHours)
        }

    fun compute(area: DemoCityArea, today: LocalDate): AreaInsights {
        val bandHours = DemoCity.bands[area.band] ?: 0
        val all = cuts(area, today)
        val from = today.minusDays(RANGE_DAYS.toLong()).atStartOfDay()
        val days = days(all, today, RANGE_DAYS, bandHours)
        val inRange = all.filter { it.end.isAfter(from) }
        val heat = IntArray(7 * 24)
        for (c in inRange) {
            // Walk the cut minute by minute in hour steps, so a cut across two hours counts in both.
            var t = maxOf(c.start, from)
            while (t.isBefore(c.end)) {
                val next = minOf(t.withMinute(0).withSecond(0).plusHours(1), c.end)
                heat[weekday(t.toLocalDate()) * 24 + t.hour] += java.time.Duration.between(t, next).toMinutes().toInt()
                t = next
            }
        }
        // Each weekday appears 4 or 5 times in 30 days; share is minutes out over minutes seen.
        val seen = IntArray(7)
        for (d in days) seen[weekday(d.date)]++
        val share = DoubleArray(7 * 24) { i -> if (seen[i / 24] == 0) 0.0 else heat[i] / (seen[i / 24] * 60.0) }
        val worst = share.indices.maxByOrNull { share[it] } ?: 0
        val lengths = inRange.map { it.minutes }.sorted()
        val median = if (lengths.isEmpty()) null else if (lengths.size % 2 == 1) lengths[lengths.size / 2] else (lengths[lengths.size / 2 - 1] + lengths[lengths.size / 2]) / 2
        val weekly = (WEEK_BLOCKS - 1 downTo 0).map { k ->
            val block = days(all, today.minusDays(7L * k), 7, bandHours)
            block.sumOf { it.outageMinutes } / 60.0
        }
        return AreaInsights(
            slug = area.slug,
            name = area.name,
            band = area.band,
            bandHours = bandHours,
            days = days,
            avgPowerHours = days.sumOf { it.powerHours } / days.size,
            daysBelowBand = days.count { it.belowBand },
            cutCount = inRange.count { !it.start.isBefore(from) },
            hoursWithout = days.sumOf { it.outageMinutes } / 60.0,
            cuts = inRange.filter { !it.start.isBefore(from) }.sortedByDescending { it.start },
            longest = inRange.filter { !it.start.isBefore(from) }.maxByOrNull { it.minutes },
            medianMinutes = median,
            heat = heat,
            heatShare = share,
            worstWeekday = worst / 24,
            worstHour = worst % 24,
            weekly = weekly,
        )
    }

    /** Areas ranked by average hours of power a day over the last 7 days (best first), with the 30-day figures beside. */
    fun ranking(areas: List<DemoCityArea>, today: LocalDate): List<AreaRank> = areas.map { a ->
        val bandHours = DemoCity.bands[a.band] ?: 0
        val cuts = cuts(a, today)
        val week = days(cuts, today, 7, bandHours)
        val month = days(cuts, today, RANGE_DAYS, bandHours)
        AreaRank(
            a.slug, a.name, a.band,
            week = week.sumOf { it.powerHours } / 7,
            month = month.sumOf { it.powerHours } / RANGE_DAYS,
            weekCuts = week.sumOf { it.cuts },
            monthCuts = month.sumOf { it.cuts },
        )
    }.sortedByDescending { it.week }

    /** The simulated history is laid out in Lagos time. */
    val ZONE: ZoneId = ZoneId.of("Africa/Lagos")
}
