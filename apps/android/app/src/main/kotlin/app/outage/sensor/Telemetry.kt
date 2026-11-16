package app.outage.sensor

data class Gap(val reason: String, val startElapsedMs: Long, val lengthMs: Long?)

/** Field-test telemetry for one period (R10). Mirrors `SensorTelemetry` in `packages/shared/src/sensor.ts`. */
data class Telemetry(
    val periodMs: Long,
    val chargingMs: Long,
    val armedMs: Long,
    val armedRatio: Double?,
    val replugDelaysMs: List<Long>,
    val gaps: List<Gap>,
)

/**
 * Telemetry computed from the event log, so there is one source of truth instead of separate session tables (ADR 0033).
 * Only events of the current boot count: elapsed time does not cross a reboot (R9.4). Pure.
 *
 * - Charging runs from ARMED or REPLUG (or a gap's DISARMED) to UNPLUG, or to DISARMED for a non-detection plug or a user
 *   stop.
 * - Armed is charging minus gaps. BATTERY_FULL keeps the sensor armed: the receiver still sees an unplug at 100%
 *   (station-mode R3.2).
 */
object TelemetryCalc {
    private val NOT_CHARGING_REASONS = setOf(Reason.NON_DETECTION_PLUG, Reason.USER_STOPPED)

    fun compute(events: List<SensorEvent>, nowElapsedMs: Long, periodMs: Long): Telemetry {
        val from = nowElapsedMs - periodMs
        var chargingSince: Long? = null
        var armedSince: Long? = null
        var gap: Pair<String, Long>? = null
        var chargingMs = 0L
        var armedMs = 0L
        val gaps = mutableListOf<Gap>()
        val delays = mutableListOf<Long>()

        fun clip(start: Long, end: Long) = (end - maxOf(start, from)).coerceAtLeast(0)
        fun endArmed(at: Long) { armedSince?.let { armedMs += clip(it, at) }; armedSince = null }
        fun endCharging(at: Long) { chargingSince?.let { chargingMs += clip(it, at) }; chargingSince = null }
        fun endGap(at: Long) { gap?.let { (r, s) -> if (at >= from) gaps += Gap(r, s, at - s) }; gap = null }

        for (e in events.filter { it.timeQuality == TimeQuality.OK }.sortedBy { it.seq }) {
            val t = e.recordedElapsedMs
            when (e.type) {
                EventType.ARMED, EventType.REPLUG -> {
                    endGap(t)
                    if (chargingSince == null) chargingSince = t
                    if (armedSince == null) armedSince = t
                    if (e.type == EventType.REPLUG && t >= from) e.schedulingDelayMs?.let { delays += it }
                }
                EventType.UNPLUG -> { endArmed(t); endCharging(t); endGap(t) }
                EventType.DISARMED -> {
                    endArmed(t)
                    if (e.reason in NOT_CHARGING_REASONS) { endCharging(t); endGap(t) } else {
                        if (chargingSince == null) chargingSince = t
                        if (gap == null) gap = (e.reason ?: e.stopReason ?: Reason.UNKNOWN_CAUSE) to t
                    }
                }
                EventType.BATTERY_FULL, EventType.LABEL, EventType.REPORT -> Unit
            }
        }
        endArmed(nowElapsedMs)
        endCharging(nowElapsedMs)
        gap?.let { (r, s) -> gaps += Gap(r, s, null) }
        val ratio = if (chargingMs > 0) (armedMs.toDouble() / chargingMs).coerceIn(0.0, 1.0) else null
        return Telemetry(periodMs, chargingMs, armedMs, ratio, delays, gaps)
    }
}
