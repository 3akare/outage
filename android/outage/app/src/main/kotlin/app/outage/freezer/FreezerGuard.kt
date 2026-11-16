package app.outage.freezer

import app.outage.log.LogInterval
import app.outage.log.LogState
import app.outage.log.LogStore
import app.outage.log.TimelineBuilder

/** Freezer Guard settings (power-log R6). Stored in the log database's `setting` table, so delete-my-data clears them. */
data class FreezerSettings(
    val on: Boolean = false,
    /** Whole hours, 1 to 24 (R6.1). */
    val limitHours: Int = 4,
    /** "Freezer Guard may sound in quiet hours" (R6.7). Default off. */
    val soundInQuietHours: Boolean = false,
    /** Quiet window, minutes after local midnight. A window may cross midnight. */
    val quietStartMin: Int = 22 * 60,
    val quietEndMin: Int = 7 * 60,
    /** The user asked for an exact alarm (R6.6). Used only when the system also allows it. */
    val exactWanted: Boolean = false,
) {
    val limitMs: Long get() = limitHours * 3_600_000L
}

/** What the scheduler should do now. */
sealed interface FreezerPlan {
    data object Cancel : FreezerPlan

    /** Ring at wall-clock [dueMs] for the `OUT` interval that started at [outStartMs]. */
    data class Schedule(val outStartMs: Long, val dueMs: Long) : FreezerPlan
}

/**
 * The Freezer Guard rules without Android (power-log design section 6, property PL7). Pure: the clock is an input, so
 * JVM tests can drive it. An alert goes with an `OUT` interval only, never `OFF_CHARGER` or `UNKNOWN` (R6.8), and
 * once per interval (the fired marker is the interval's start).
 */
object FreezerRules {
    const val MIN_HOURS = 1
    const val MAX_HOURS = 24

    /** The open `OUT` interval, if the timeline ends in one. */
    fun openOut(intervals: List<LogInterval>): LogInterval? =
        intervals.lastOrNull()?.takeIf { it.state == LogState.OUT && it.endMs == null }

    /** R6.2 and R6.4: schedule for the open `OUT` interval, cancel when there is none or it already alerted. */
    fun plan(settings: FreezerSettings, intervals: List<LogInterval>, firedFor: Long?): FreezerPlan {
        if (!settings.on) return FreezerPlan.Cancel
        val open = openOut(intervals) ?: return FreezerPlan.Cancel
        if (firedFor == open.startMs) return FreezerPlan.Cancel
        return FreezerPlan.Schedule(open.startMs, open.startMs + settings.limitMs)
    }

    /**
     * R6.3: when the alarm fires, alert only if the same interval is still open, the limit has been reached and it has
     * not alerted yet. [slackMs] covers an alarm that arrives a little early.
     */
    fun shouldAlert(settings: FreezerSettings, intervals: List<LogInterval>, firedFor: Long?, nowMs: Long, slackMs: Long = 60_000L): Boolean {
        if (!settings.on) return false
        val open = openOut(intervals) ?: return false
        if (firedFor == open.startMs) return false
        return nowMs - open.startMs + slackMs >= settings.limitMs
    }

    /** Whole hours the power has been off, for the alert text. Never below the limit shown to the user. */
    fun hoursOff(open: LogInterval, nowMs: Long, settings: FreezerSettings): Int =
        maxOf(settings.limitHours.toLong(), (nowMs - open.startMs) / 3_600_000L).toInt()

    /** True when [minuteOfDay] is inside the quiet window. A window may cross midnight (R6.7). */
    fun inQuietHours(settings: FreezerSettings, minuteOfDay: Int): Boolean {
        val s = settings.quietStartMin
        val e = settings.quietEndMin
        return when {
            s == e -> false
            s < e -> minuteOfDay in s until e
            else -> minuteOfDay >= s || minuteOfDay < e
        }
    }

    /** R6.7: silent inside quiet hours unless the user allowed sound. */
    fun silent(settings: FreezerSettings, minuteOfDay: Int): Boolean =
        inQuietHours(settings, minuteOfDay) && !settings.soundInQuietHours

    fun clampHours(h: Int): Int = h.coerceIn(MIN_HOURS, MAX_HOURS)
}

/** Reads and writes [FreezerSettings] in a [LogStore]. */
class FreezerSettingsStore(private val store: LogStore) {
    fun read(): FreezerSettings {
        val d = FreezerSettings()
        return FreezerSettings(
            on = store.getSetting(ON) == "1",
            limitHours = store.getSetting(HOURS)?.toIntOrNull()?.let(FreezerRules::clampHours) ?: d.limitHours,
            soundInQuietHours = store.getSetting(QUIET_SOUND) == "1",
            quietStartMin = store.getSetting(QUIET_START)?.toIntOrNull()?.coerceIn(0, 1439) ?: d.quietStartMin,
            quietEndMin = store.getSetting(QUIET_END)?.toIntOrNull()?.coerceIn(0, 1439) ?: d.quietEndMin,
            exactWanted = store.getSetting(EXACT) == "1",
        )
    }

    fun write(s: FreezerSettings) {
        store.putSetting(ON, if (s.on) "1" else "0")
        store.putSetting(HOURS, FreezerRules.clampHours(s.limitHours).toString())
        store.putSetting(QUIET_SOUND, if (s.soundInQuietHours) "1" else "0")
        store.putSetting(QUIET_START, s.quietStartMin.toString())
        store.putSetting(QUIET_END, s.quietEndMin.toString())
        store.putSetting(EXACT, if (s.exactWanted) "1" else "0")
    }

    /** Start of the `OUT` interval that already alerted, so one interval alerts once (PL7). */
    fun firedFor(): Long? = store.getSetting(FIRED)?.toLongOrNull()
    fun markFired(outStartMs: Long) = store.putSetting(FIRED, outStartMs.toString())

    private companion object {
        const val ON = "freezer_on"
        const val HOURS = "freezer_hours"
        const val QUIET_SOUND = "freezer_quiet_sound"
        const val QUIET_START = "freezer_quiet_start"
        const val QUIET_END = "freezer_quiet_end"
        const val EXACT = "freezer_exact"
        const val FIRED = "freezer_fired_for"
    }
}

/** Where alarms go. [AndroidFreezerAlarms] on the phone, a fake in JVM tests. */
interface FreezerAlarms {
    /** Replaces any pending Freezer Guard alarm. [delayMs] counts from now on the monotonic clock. */
    fun schedule(delayMs: Long, exact: Boolean)
    fun cancel()

    /** True when the system lets this app set an exact alarm right now (R6.6). */
    fun canScheduleExact(): Boolean
}

/**
 * Keeps the one Freezer Guard alarm in step with the timeline. [sync] is called after anything that can change the
 * timeline: a sensor event, a tap, an area sync, a settings change, app start. The alarm lives in `AlarmManager`, so it
 * works with the app closed and offline (R6.9). After a reboot alarms are gone; the app start [sync] sets it again.
 */
class FreezerGuard(
    private val store: LogStore,
    private val alarms: FreezerAlarms,
    private val clock: () -> Long = System::currentTimeMillis,
) {
    private val settings = FreezerSettingsStore(store)

    fun settings(): FreezerSettings = settings.read()

    fun save(s: FreezerSettings) {
        settings.write(s)
        sync()
    }

    fun sync(): FreezerPlan {
        val now = clock()
        val s = settings.read()
        val plan = FreezerRules.plan(s, TimelineBuilder.build(store.all(), now), settings.firedFor())
        when (plan) {
            FreezerPlan.Cancel -> alarms.cancel()
            is FreezerPlan.Schedule ->
                alarms.schedule((plan.dueMs - now).coerceAtLeast(0), exact = s.exactWanted && alarms.canScheduleExact())
        }
        return plan
    }

    /** Called by the receiver. Returns the open interval to alert about, or null. Marks it so it alerts once. */
    fun takeAlert(): Pair<LogInterval, FreezerSettings>? {
        val now = clock()
        val s = settings.read()
        val intervals = TimelineBuilder.build(store.all(), now)
        if (!FreezerRules.shouldAlert(s, intervals, settings.firedFor(), now)) return null
        val open = FreezerRules.openOut(intervals) ?: return null
        settings.markFired(open.startMs)
        return open to s
    }
}
