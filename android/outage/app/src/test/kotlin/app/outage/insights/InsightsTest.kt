package app.outage.insights

import app.outage.log.Band
import java.time.ZoneId
import java.time.ZonedDateTime
import java.util.Random
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** spec app-map-insights properties IN1 to IN6 with hand-checked numbers (R7 to R10). */
class InsightsTest {
    private val utc = ZoneId.of("UTC")
    private val h = 3_600_000L
    private fun at(y: Int, mo: Int, d: Int, hr: Int = 0, mi: Int = 0, zone: ZoneId = utc) =
        ZonedDateTime.of(y, mo, d, hr, mi, 0, 0, zone).toInstant().toEpochMilli()

    private val bandA = Band("A", "Band A", 20, true, "https://nerc.gov.ng/x", emptyList(), "2026-01-01", "n")
    private val bandD = Band("D", "Band D", 8, false, null, listOf("https://example.org"), "2026-01-01", "n")

    // Sunday 2026-03-15 12:00 UTC is "now". Observation began Monday 2026-03-02 00:00 (14 full days before Sunday noon).
    private val now = at(2026, 3, 15, 12)
    private val from = at(2026, 3, 2)

    @Test
    fun count_hours_and_average_hand_checked() {
        // 2 h on Mon 9th, 3 h on Tue 10th.
        val o = listOf(Outage(at(2026, 3, 9, 18), at(2026, 3, 9, 20)), Outage(at(2026, 3, 10, 1), at(2026, 3, 10, 4)))
        val r = InsightsCalc.compute(InsightsInput(o, from, false), now, utc, 7, null)
        assertEquals(2, r.outageCount)
        assertEquals(5.0, r.outageHours, 1e-9)
        // Range is Mar 9..15. Today (Mar 15) has 12 of 24 h observed = coverage 0.5, so it counts (12 h of power).
        assertEquals(7, r.days.size)
        assertEquals(7, r.daysWithData)
        // Power hours: Mon 22, Tue 21, Wed..Sat 24 x4, Sun 12 = 22+21+96+12 = 151 over 7 days.
        assertEquals(151.0 / 7, r.avgPowerHoursPerDay!!, 1e-9)
        assertEquals(3L * h, r.longest[0].durationMs)
        assertEquals(2L * h, r.longest[1].durationMs)
    }

    @Test
    fun in1_power_plus_outage_equals_observed_for_any_order_of_intervals() {
        val rnd = Random(11)
        repeat(60) {
            val list = ArrayList<Outage>()
            repeat(rnd.nextInt(25)) {
                val s = from + (rnd.nextDouble() * (now - from)).toLong()
                list += Outage(s, if (rnd.nextInt(8) == 0) null else s + rnd.nextInt(10 * 3_600_000))
            }
            val a = InsightsCalc.compute(InsightsInput(list, from, false), now, utc, 14, null)
            val b = InsightsCalc.compute(InsightsInput(list.shuffled(rnd), from, false), now, utc, 14, null)
            assertEquals(a.days, b.days)
            assertEquals(a.outageHours, b.outageHours, 1e-9)
            for (d in a.days) {
                assertTrue(d.outageHours <= d.observedHours + 1e-9)
                if (d.powerHours != null) assertEquals(d.observedHours, d.powerHours + d.outageHours, 1e-9)
            }
        }
    }

    @Test
    fun overlapping_outages_do_not_count_twice() {
        val o = listOf(Outage(at(2026, 3, 10, 1), at(2026, 3, 10, 5)), Outage(at(2026, 3, 10, 3), at(2026, 3, 10, 6)))
        val r = InsightsCalc.compute(InsightsInput(o, from, false), now, utc, 7, null)
        assertEquals(5.0, r.outageHours, 1e-9)
        assertEquals(1, r.outageCount)
    }

    @Test
    fun in4_days_without_enough_coverage_are_null_not_zero() {
        // Observation began Sun 15th at 06:00, so today has 6 of 24 h observed.
        val r = InsightsCalc.compute(InsightsInput(emptyList(), at(2026, 3, 15, 6), false), now, utc, 7, null)
        assertEquals(0, r.daysWithData)
        assertTrue(r.days.all { it.powerHours == null })
        assertNull(r.avgPowerHoursPerDay)
        assertTrue(r.underSevenDays)
        // 12 of 24 hours observed is exactly 50% and counts.
        val r2 = InsightsCalc.compute(InsightsInput(emptyList(), at(2026, 3, 15, 0), false), now, utc, 7, null)
        assertEquals(12.0, r2.days.last().powerHours!!, 1e-9)
    }

    @Test
    fun empty_and_under_seven_days() {
        val r = InsightsCalc.compute(InsightsInput(emptyList(), now, false), now, utc, 30, null)
        assertEquals(0, r.outageCount)
        assertEquals(0.0, r.outageHours, 1e-9)
        assertEquals(0, r.daysWithData)
        assertTrue(r.underSevenDays)
        assertTrue(r.longest.isEmpty())
        assertNull(r.meanGapMs)
        assertNull(r.worstSlot)
        assertNull(r.promise)
        assertTrue(r.heatmap.all { it.share == null })
        val r3 = InsightsCalc.compute(InsightsInput(emptyList(), at(2026, 3, 11), false), now, utc, 30, null)
        assertTrue(r3.underSevenDays)
        assertEquals(5, r3.daysWithData)
    }

    @Test
    fun in2_heatmap_shares_are_in_range_and_rare_slots_are_null() {
        val rnd = Random(5)
        val list = (0 until 40).map { val s = from + (rnd.nextDouble() * (now - from)).toLong(); Outage(s, s + rnd.nextInt(5 * 3_600_000)) }
        val r = InsightsCalc.compute(InsightsInput(list, from, false), now, utc, 14, null)
        assertEquals(7 * 24, r.heatmap.size)
        for (c in r.heatmap) {
            if (c.seen < InsightsCalc.MIN_SLOT_SEEN) assertNull(c.share) else assertTrue(c.share!! in 0.0..1.0)
        }
        // 14 days gives every slot 2 weekly repeats only for part of the week; a 30 day window gives 4 or 5.
        val r30 = InsightsCalc.compute(InsightsInput(list, from - 20 * 24 * h, false), now, utc, 30, null)
        assertTrue(r30.heatmap.all { it.share != null })
    }

    @Test
    fun heatmap_share_and_worst_slot_hand_checked() {
        // Observation: 5 weeks to Sun 2026-03-15 12:00 (now). Every Tuesday 18:00 to 19:00 and 18:30 only half: full hour out.
        val start = at(2026, 2, 8)
        val tues = listOf(at(2026, 2, 10), at(2026, 2, 17), at(2026, 2, 24), at(2026, 3, 3), at(2026, 3, 10))
        val outs = tues.map { Outage(it + 18 * h, it + 19 * h) } + Outage(tues[0] + 7 * h, tues[0] + 7 * h + h / 2)
        val r = InsightsCalc.compute(InsightsInput(outs, start, false), now, utc, 40, null)
        val tue18 = r.heatmap.first { it.weekday == 1 && it.hour == 18 }
        assertEquals(5, tue18.seen)
        assertEquals(1.0, tue18.share!!, 1e-9)
        val tue7 = r.heatmap.first { it.weekday == 1 && it.hour == 7 }
        assertEquals(0.5 / 5, tue7.share!!, 1e-9)
        assertTrue(r.daysWithData >= 14)
        assertEquals(WorstSlot(1, 18, 1.0), r.worstSlot)
    }

    @Test
    fun worst_slot_needs_fourteen_days() {
        val o = listOf(Outage(at(2026, 3, 10, 18), at(2026, 3, 10, 19)))
        // Observed from Mar 3: 12 full days plus the half day today = 13.
        val r = InsightsCalc.compute(InsightsInput(o, at(2026, 3, 3), false), now, utc, 30, null)
        assertEquals(13, r.daysWithData)
        assertNull(r.worstSlot)
    }

    @Test
    fun longest_is_top_five_sorted_and_mean_gap_needs_three() {
        val o = (1..7).map { Outage(at(2026, 3, 2 + it, 2), at(2026, 3, 2 + it, 2) + it * h / 2) }
        val r = InsightsCalc.compute(InsightsInput(o, from, false), now, utc, 14, null)
        assertEquals(7, r.outageCount)
        assertEquals(5, r.longest.size)
        assertEquals(listOf(7, 6, 5, 4, 3).map { it * h / 2 }, r.longest.map { it.durationMs })
        assertEquals(24 * h, r.meanGapMs)
        val two = InsightsCalc.compute(InsightsInput(o.take(2), from, false), now, utc, 14, null)
        assertNull(two.meanGapMs)
    }

    @Test
    fun ongoing_outage_runs_to_now() {
        val r = InsightsCalc.compute(InsightsInput(listOf(Outage(at(2026, 3, 15, 9), null)), from, false), now, utc, 7, null)
        assertEquals(3L * h, r.longest[0].durationMs)
        assertTrue(r.longest[0].ongoing)
        assertEquals(3.0, r.outageHours, 1e-9)
    }

    @Test
    fun in3_weekly_trend_has_twelve_entries_in_order_with_null_for_no_data() {
        val r = InsightsCalc.compute(InsightsInput(emptyList(), from, false), now, utc, 7, null)
        assertEquals(12, r.weeklyTrend.size)
        // Observation covers this week (Mar 9) and last week (Mar 2) only: the last two entries have data.
        assertTrue(r.weeklyTrend.take(10).all { it == null })
        assertEquals(24.0, r.weeklyTrend[10]!!, 1e-9)
        // This week: Mon..Sat 24 h and Sunday 12 h (50% coverage), average 156 / 7.
        assertEquals((6 * 24 + 12) / 7.0, r.weeklyTrend[11]!!, 1e-9)
    }

    @Test
    fun promise_check_hand_checked_and_unverified_is_marked() {
        val r = InsightsCalc.compute(InsightsInput(listOf(Outage(at(2026, 3, 10, 0), at(2026, 3, 10, 12))), from, false), now, utc, 7, bandA)
        val p = r.promise!!
        // Mar 9..15: Mon 24, Tue 12, Wed to Sat 4 x 24 = 96, Sun 12 (half observed) = 144.
        assertEquals(144.0 / 7, p.avgPowerHours, 1e-9)
        assertEquals(144.0 / 7 - 20, p.diffHours, 1e-9)
        assertEquals(2, p.daysBelow) // Tue and Sun (12 h each) are under 20
        assertEquals(7, p.daysWithData)
        assertTrue(p.verified)
        val u = InsightsCalc.compute(InsightsInput(emptyList(), from, false), now, utc, 7, bandD).promise!!
        assertFalse(u.verified)
        assertTrue(PromiseText.line(u).contains("unconfirmed"))
        assertFalse(PromiseText.line(p).contains("unconfirmed"))
    }

    @Test
    fun in6_promise_text_never_uses_forbidden_words_and_says_estimate() {
        for (verified in listOf(true, false)) for (diff in listOf(-5.0, 0.0, 3.5)) {
            val t = PromiseText.line(PromiseCheck("A", 20, verified, 20 + diff, diff, 1, 7)).lowercase()
            assertTrue(t.startsWith("estimate"))
            for (w in PromiseText.FORBIDDEN) assertFalse(t.contains(w))
        }
    }

    @Test
    fun in5_day_edges_follow_the_time_zone_across_a_dst_change() {
        val ny = ZoneId.of("America/New_York")
        // US clocks went forward on 2026-03-08: that local day has 23 hours.
        val nowNy = at(2026, 3, 9, 12, zone = ny)
        val r = InsightsCalc.compute(InsightsInput(emptyList(), at(2026, 3, 1, zone = ny), false), nowNy, ny, 3, null)
        assertEquals(listOf(24.0, 23.0, 12.0), r.days.map { it.observedHours })
        assertEquals(at(2026, 3, 8, zone = ny), r.days[1].dayStartMs)
        // Heatmap weekdays are local: Sunday 8th is weekday index 6.
        val sunHours = r.heatmap.filter { it.weekday == 6 }.sumOf { it.seen }
        assertEquals(23, sunHours)
        // An outage at 23:30 New York on Saturday belongs to Saturday's local day, not Sunday's UTC day.
        val o = listOf(Outage(at(2026, 3, 7, 23, 30, ny), at(2026, 3, 8, 0, 30, ny)))
        val r2 = InsightsCalc.compute(InsightsInput(o, at(2026, 3, 1, zone = ny), false), nowNy, ny, 3, null)
        assertEquals(0.5, r2.days[0].outageHours, 1e-9)
        assertEquals(0.5, r2.days[1].outageHours, 1e-9)
    }

    @Test
    fun demo_outages_are_deterministic_simulated_and_twelve_weeks() {
        val a = DemoOutages.build(now, utc)
        val b = DemoOutages.build(now, utc)
        assertEquals(a, b)
        assertTrue(a.simulated)
        assertTrue(a.outages.isNotEmpty() && a.outages.all { it.simulated })
        assertEquals(84L, (now - a.observedFromMs) / (24 * h) - 0L)
        assertTrue(a.outages.size in 40..140)
        assertTrue(a.outages.all { it.endMs != null && it.endMs!! > it.startMs && it.endMs!! <= now })
        assertFalse(a == DemoOutages.build(now, utc, seed = 1L))
        val r = InsightsCalc.compute(a, now, utc, 90, bandA)
        assertTrue(r.simulated)
        assertNotNull(r.worstSlot)
        assertNotNull(r.meanGapMs)
        assertTrue(r.daysWithData >= 55)
    }
}

/** R5, R10: with a Worker address set the Insights source is real, so it never carries simulated data. */
class InsightsSourceChoiceTest {
    private val zone = ZoneId.of("UTC")

    @Test
    fun a_set_api_base_gives_the_real_source_with_an_empty_state() {
        val source = InsightsSources.choose("https://example.workers.dev", null)
        assertTrue(source is PowerLogInsightsSource)
        val input = source.input(1_800_000_000_000L, zone)
        assertFalse(input.simulated)
        assertTrue(input.outages.isEmpty())
        val r = InsightsCalc.compute(input, 1_800_000_000_000L, zone, 30, null)
        assertFalse(r.simulated)
        assertEquals(0, r.outageCount)
        assertEquals(0, r.daysWithData)
    }

    @Test
    fun a_blank_api_base_keeps_the_labelled_demo() {
        val source = InsightsSources.choose("", null)
        assertTrue(source is DemoInsightsSource)
        assertTrue(source.input(1_800_000_000_000L, zone).simulated)
    }
}
