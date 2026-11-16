package app.outage.insights

import app.outage.map.DemoCity
import app.outage.map.DemoCityArea
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

/** ADR 0053: Insights over the simulated history, laid on the calendar with weekdays kept, every number checked. */
class AreaHistoryTest {
    private val todays = (0L until 7L).map { LocalDate.of(2026, 11, 16).plusDays(it) } // every weekday as "today"

    @Test
    fun generatedDaysLandOnTheirOwnWeekdayAndYesterdayIsTheLastOne() {
        for (today in todays) {
            val last = AreaHistory.lastIndex(today)
            assertEquals(today.minusDays(1), AreaHistory.dateOf(last, today))
            assertTrue(last - (AreaHistory.RANGE_DAYS - 1) >= 0)
            for (i in 0..last) assertEquals(i % 7, AreaHistory.weekday(AreaHistory.dateOf(i, today)))
        }
    }

    @Test
    fun thirtyDaysEndingYesterdayAndMinutesAddUp() {
        for (today in todays) for (a in DemoCity.areas) {
            val r = AreaHistory.compute(a, today)
            assertEquals(30, r.days.size)
            assertEquals(today.minusDays(1), r.days.last().date)
            assertTrue(r.days.all { it.powerHours in 0.0..24.0 })
            // The heatmap holds exactly the minutes the days hold.
            assertEquals(r.days.sumOf { it.outageMinutes }, r.heat.sum())
            assertEquals(r.days.sumOf { it.outageMinutes } / 60.0, r.hoursWithout, 1e-9)
            // The newest weekly block is the last seven days.
            assertEquals(r.days.takeLast(7).sumOf { it.outageMinutes } / 60.0, r.weekly.last(), 1e-9)
            assertEquals(r.days.count { it.powerHours < r.bandHours }, r.daysBelowBand)
            assertTrue(r.cuts.zipWithNext().all { (x, y) -> !x.start.isBefore(y.start) })
            assertEquals(r.cuts.maxOfOrNull { it.minutes }, r.longest?.minutes)
            assertTrue(r.heatShare.all { it in 0.0..1.0 })
        }
    }

    @Test
    fun medianIsTheMiddleCutLength() {
        // Monday 2026-11-16 as today: yesterday is a Sunday, generated day 41.
        val a = DemoCityArea("t", "T", "sim-x", 6.5, 3.4, "A", intArrayOf(40, 60, 30, 39, 600, 90, 38, 1200, 60))
        val r = AreaHistory.compute(a, LocalDate.of(2026, 11, 16))
        assertEquals(3, r.cutCount)
        assertEquals(60, r.medianMinutes)
        assertEquals(90, r.longest?.minutes)
        assertEquals(LocalDate.of(2026, 11, 14), r.cuts.first().start.toLocalDate())
        // Day 40 is a Saturday: 30 minutes from 01:00.
        assertEquals(30, r.heat[5 * 24 + 1])
    }

    @Test
    fun aCutPastMidnightCountsOnBothDays() {
        val a = DemoCityArea("t", "T", "sim-x", 6.5, 3.4, "A", intArrayOf(39, 23 * 60, 120))
        val r = AreaHistory.compute(a, LocalDate.of(2026, 11, 16))
        // Day 39 is Friday 13 November: 23:00 to 01:00 Saturday.
        assertEquals(60, r.days[r.days.size - 3].outageMinutes)
        assertEquals(60, r.days[r.days.size - 2].outageMinutes)
        assertEquals(0, r.days.last().outageMinutes)
    }

    @Test
    fun rankingCoversEveryAreaBestFirst() {
        val rank = AreaHistory.ranking(DemoCity.areas, LocalDate.of(2026, 11, 16))
        assertEquals(DemoCity.areas.size, rank.size)
        assertTrue(rank.zipWithNext().all { (x, y) -> x.week >= y.week })
        assertTrue(rank.all { it.week in 0.0..24.0 && it.month in 0.0..24.0 })
    }
}
