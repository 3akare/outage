package app.outage.ui

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import app.outage.R
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale

/** Time and duration text for the Area and History screens. Uses the phone's zone and locale; words come from string resources. */
object Fmt {
    private fun zone(): ZoneId = ZoneId.systemDefault()

    fun time(ms: Long, locale: Locale = Locale.getDefault()): String =
        DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT).withLocale(locale).format(Instant.ofEpochMilli(ms).atZone(zone()))

    /** "2:14 p.m." for today, "12 Nov, 2:14 p.m." for another day. */
    fun since(ms: Long, nowMs: Long, locale: Locale = Locale.getDefault()): String {
        val at = Instant.ofEpochMilli(ms).atZone(zone())
        val today = Instant.ofEpochMilli(nowMs).atZone(zone()).toLocalDate()
        if (at.toLocalDate() == today) return time(ms, locale)
        return DateTimeFormatter.ofPattern("d MMM", locale).format(at) + ", " + time(ms, locale)
    }

    fun day(ms: Long, locale: Locale = Locale.getDefault()): String =
        DateTimeFormatter.ofPattern("d MMM", locale).format(Instant.ofEpochMilli(ms).atZone(zone()))

    fun weekdayShort(weekday: Int, locale: Locale = Locale.getDefault()): String =
        java.time.DayOfWeek.of(weekday + 1).getDisplayName(java.time.format.TextStyle.SHORT, locale)

    fun weekdayFull(weekday: Int, locale: Locale = Locale.getDefault()): String =
        java.time.DayOfWeek.of(weekday + 1).getDisplayName(java.time.format.TextStyle.FULL, locale)

    fun dayOfMonth(ms: Long): LocalDate = Instant.ofEpochMilli(ms).atZone(zone()).toLocalDate()

    fun hourOfDay(hour: Int, locale: Locale = Locale.getDefault()): String =
        DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT).withLocale(locale).format(java.time.LocalTime.of(hour, 0))

    fun ageMinutes(nowMs: Long, thenMs: Long): Long = ((nowMs - thenMs) / 60_000L).coerceAtLeast(0)
}

@Composable
fun durationText(ms: Long): String {
    val minutes = (ms / 60_000L).toInt().coerceAtLeast(0)
    return if (minutes < 60) stringResource(R.string.ins_dur_m, minutes) else stringResource(R.string.ins_dur_hm, minutes / 60, minutes % 60)
}
