package app.outage.log

import java.time.LocalDate
import java.time.YearMonth
import java.time.ZoneId
import java.time.ZonedDateTime
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** One Light Score rule for the History screen (ADR 0057): 7 qualifying days, watched time (ON or OUT) only (power-log R4). */
class LightScoreTest {
    private val utc = ZoneId.of("UTC")
    private val h = 3_600_000L
    private fun at(d: Int, hr: Int = 0) = ZonedDateTime.of(2026, 3, 1, 0, 0, 0, 0, utc).plusDays((d - 1).toLong()).plusHours(hr.toLong()).toInstant().toEpochMilli()
    private val march = YearMonth.of(2026, 3)
    private fun on(s: Long, e: Long?) = LogInterval(s, e, LogState.ON, LogSource.SENSOR)
    private fun out(s: Long, e: Long?) = LogInterval(s, e, LogState.OUT, LogSource.SENSOR)
    private fun off(s: Long, e: Long?) = LogInterval(s, e, LogState.OFF_CHARGER, LogSource.SENSOR)

    @Test
    fun no_score_below_seven_days_and_the_day_number_counts_up() {
        // Watched from Mar 1 00:00; now is Mar 7 00:00: six full days (today has nothing watched yet).
        val days = Stats.month(listOf(on(at(1), null)), march, utc, at(7))
        val s = Stats.lightScore(days, march)
        assertEquals(6, s.qualifyingDays)
        assertNull(s.score)
        assertEquals(7, Stats.scoreDayNumber(s.qualifyingDays))
        assertEquals(1, Stats.scoreDayNumber(0))
        assertEquals(7, Stats.scoreDayNumber(12))
        // At Mar 7 12:00 today is half watched and qualifies: 7 days, all with power.
        val s7 = Stats.lightScore(Stats.month(listOf(on(at(1), null)), march, utc, at(7, 12)), march)
        assertEquals(7, s7.qualifyingDays)
        assertEquals(100, s7.score)
    }

    @Test
    fun off_charger_time_is_not_power() {
        // Each day: 12 h watched (6 h on, 6 h out), then 12 h off the charger. Before, the off time counted as power (75%).
        val list = (1..7).flatMap { d -> listOf(on(at(d), at(d, 6)), out(at(d, 6), at(d, 12)), off(at(d, 12), at(d + 1))) }
        val days = Stats.month(list, march, utc, at(8))
        assertEquals(6.0, days[0].powerHours!!, 1e-9)
        assertEquals(12 * h, days[0].watchedMs)
        assertEquals(50, Stats.lightScore(days, march).score)
    }

    @Test
    fun the_one_score_function_hides_below_seven_days_and_shows_at_seven() {
        val day = ScoreDay(watchedHours = 10.0, powerHours = 8.0)
        assertNull(Stats.scoreOf(emptyList()))
        assertNull(Stats.scoreOf(List(6) { day }))
        assertEquals(80, Stats.scoreOf(List(7) { day }))
        assertEquals(80, Stats.scoreOf(List(20) { day }))
        // Nothing watched at all gives no score, never a division by zero.
        assertNull(Stats.scoreOf(List(7) { ScoreDay(0.0, 0.0) }))
    }

    @Test
    fun the_score_is_the_share_of_watched_time_with_power_over_the_month() {
        // Mar 1 to 9 watched all day; outages of 4 h, 2 h and 1 h; Mar 10 half watched. Watched 9 * 24 + 12 h, 7 h out.
        val log = listOf(
            on(at(1), at(2, 18)), out(at(2, 18), at(2, 22)), on(at(2, 22), at(5, 1)), out(at(5, 1), at(5, 3)),
            on(at(5, 3), at(9, 9)), out(at(9, 9), at(9, 10)), on(at(9, 10), null),
        )
        val s = Stats.lightScore(Stats.month(log, march, utc, at(10, 12)), march)
        assertEquals(10, s.qualifyingDays)
        val watchedH = 9 * 24.0 + 12
        assertEquals(Math.round(100 * (watchedH - 7) / watchedH).toInt(), s.score)
    }

    @Test
    fun watched_power_hours_today_ignore_coverage() {
        val d = Stats.day(listOf(on(at(1), at(1, 3)), out(at(1, 3), null)), LocalDate.of(2026, 3, 1), utc, at(1, 5))
        assertNull(d.powerHours)
        assertEquals(3.0, Stats.watchedPowerHours(d)!!, 1e-9)
        val none = Stats.day(emptyList(), LocalDate.of(2026, 3, 1), utc, at(1, 5))
        assertNull(Stats.watchedPowerHours(none))
    }
}
