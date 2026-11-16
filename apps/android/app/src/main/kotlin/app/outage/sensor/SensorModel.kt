package app.outage.sensor

/**
 * Pure sensor model (sensor-android design sections 6 and 7). Mirrors `packages/shared/src/sensor.ts`; the contract test
 * reads `packages/shared/fixtures/sensor/sensor-events.json`. No Android types, no clock, no location (R9.6, R12).
 */

/** `BatteryManager.EXTRA_PLUGGED` values: AC=1, USB=2, WIRELESS=4, DOCK=8, 0 = on battery.
 *  https://developer.android.com/reference/android/os/BatteryManager#EXTRA_PLUGGED */
enum class Plug {
    AC, USB, WIRELESS, DOCK, NONE;

    /** Only wall power counts as a grid sensor. USB (a computer or a power bank) and wireless do not (R6). */
    val detection: Boolean get() = this == AC || this == DOCK

    companion object {
        fun fromExtra(plugged: Int): Plug = when {
            plugged == 0 -> NONE
            plugged and 1 != 0 -> AC
            plugged and 8 != 0 -> DOCK
            plugged and 2 != 0 -> USB
            plugged and 4 != 0 -> WIRELESS
            else -> NONE
        }
    }
}

enum class Confidence { HIGH, LOW }

enum class EventType { ARMED, UNPLUG, BATTERY_FULL, REPLUG, DISARMED, LABEL }

/** station-mode R3.4: which driver saw the event. */
enum class Source { RECEIVER, JOB }

enum class TimeQuality { OK, LOST }

/** A snapshot of phone power, read when an input arrives. */
data class Facts(val plug: Plug, val batteryPct: Int)

/** An event before the store gives it a sequence number. */
data class EventDraft(
    val type: EventType,
    val recordedElapsedMs: Long,
    val confidence: Confidence,
    val batteryPct: Int,
    val plug: Plug,
    val source: Source,
    val stopReason: String? = null,
    val reason: String? = null,
    val schedulingDelayMs: Long? = null,
    /** LABEL only (alerts-and-light-alarm R2.5): the sequence number of the UNPLUG the user answered about. */
    val refSeq: Long? = null,
    /** LABEL only: `YES` or `NO`. */
    val answer: String? = null,
)

/** Disarm reasons. Short identifiers so they pass the ingest `SHORT_ID` rule. */
object Reason {
    const val NON_DETECTION_PLUG = "NON_DETECTION_PLUG"
    const val STOP_REASON_MISMATCH = "STOP_REASON_MISMATCH"
    const val UNKNOWN_CAUSE = "UNKNOWN_CAUSE"
    const val USER_STOPPED = "USER_STOPPED"
    const val REBOOT = "REBOOT"
    const val PROCESS_DEATH = "PROCESS_DEATH"
    /** home-watch R3: proof of life while the station is on battery. Changes no armed interval (the phone is already unarmed after UNPLUG). */
    const val HEARTBEAT_ON_BATTERY = "HEARTBEAT_ON_BATTERY"
}

/** Battery level at or above which a charging stop means "full", not "unplugged" (design section 6). */
const val FULL_BATTERY_PCT = 95

/**
 * `JobParameters.STOP_REASON_*` constants, API 31+. Copied as numbers so the pure core needs no Android class.
 * https://developer.android.com/reference/android/app/job/JobParameters#STOP_REASON_CONSTRAINT_CHARGING
 */
object StopReasons {
    const val CONSTRAINT_CHARGING = 6

    private val NAMES = mapOf(
        0 to "UNDEFINED", 1 to "CANCELLED_BY_APP", 2 to "PREEMPT", 3 to "TIMEOUT", 4 to "DEVICE_STATE",
        5 to "CONSTRAINT_BATTERY_NOT_LOW", 6 to "CONSTRAINT_CHARGING", 7 to "CONSTRAINT_CONNECTIVITY",
        8 to "CONSTRAINT_DEVICE_IDLE", 9 to "CONSTRAINT_STORAGE_NOT_LOW", 10 to "QUOTA", 11 to "BACKGROUND_RESTRICTION",
        12 to "APP_STANDBY", 13 to "USER", 14 to "SYSTEM_PROCESSING", 15 to "ESTIMATED_APP_LAUNCH_TIME_CHANGED",
    )

    fun name(reason: Int?): String? = if (reason == null) null else NAMES[reason] ?: "OTHER_$reason"
}

/** What a job stop becomes (design section 6). `reason` is set only for DISARMED. */
data class StopDecision(val type: EventType, val confidence: Confidence, val reason: String? = null)

/** The decision table, as a pure function. `stopReason` is null below Android 12 (LOW confidence). */
fun decideStop(stopReason: Int?, facts: Facts): StopDecision {
    val conf = if (stopReason == null) Confidence.LOW else Confidence.HIGH
    if (stopReason != null && stopReason != StopReasons.CONSTRAINT_CHARGING) {
        return StopDecision(EventType.DISARMED, conf, StopReasons.name(stopReason))
    }
    return when {
        facts.plug == Plug.NONE && facts.batteryPct >= FULL_BATTERY_PCT -> StopDecision(EventType.BATTERY_FULL, conf)
        facts.plug == Plug.NONE -> StopDecision(EventType.UNPLUG, conf)
        !facts.plug.detection -> StopDecision(EventType.DISARMED, conf, Reason.NON_DETECTION_PLUG)
        stopReason == null -> StopDecision(EventType.DISARMED, conf, Reason.UNKNOWN_CAUSE)
        else -> StopDecision(EventType.DISARMED, conf, Reason.STOP_REASON_MISMATCH)
    }
}
