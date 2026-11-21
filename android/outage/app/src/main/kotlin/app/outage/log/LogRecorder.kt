package app.outage.log

import app.outage.sensor.EventType
import app.outage.sensor.SensorEvent
import app.outage.sensor.TimeQuality

/** What a tap did. */
enum class TapResult {
    /** "Power is out": an `OUT` interval started and a report was queued. */
    OUT_STARTED,

    /** "Power is out" while charging on a detection plug: power is on, so no `OUT` interval; the report is still queued (R7.4). */
    OUT_QUEUED_ONLY,

    /** "Power is out" tapped again within 10 minutes (R7.6). */
    RATE_LIMITED,

    /** "Power is back": the open `OUT` interval ended (R7.2). */
    BACK_RECORDED,

    /** "Power is back" with no open `OUT` interval. Nothing is stored. */
    NOTHING_OPEN,
}

/**
 * Writes inputs into the log (power-log R1, R7). The clock, the detection plug check and
 * the upload queue are inputs, so the rules run on the JVM. `queueReport` is called only for "Power is out" and returns
 * whether the report was queued; "Power is back" is never uploaded (R7.3).
 */
class LogRecorder(
    private val store: LogStore,
    private val onChange: () -> Unit,
    private val onDetectionPlug: () -> Boolean,
    private val queueReport: () -> Boolean,
    private val clock: () -> Long = System::currentTimeMillis,
) {
    /** A sensor event heard in this process or read back from the Outbox. Only the log's five event types are kept. */
    fun onSensorEvent(e: SensorEvent) = onSensorEvents(listOf(e))

    /** Several events at once (the Outbox read at start): one write pass. */
    fun onSensorEvents(events: List<SensorEvent>) {
        val now = clock()
        var any = false
        for (e in events) {
            if (e.timeQuality != TimeQuality.OK) continue
            val type = when (e.type) {
                EventType.ARMED, EventType.UNPLUG, EventType.REPLUG, EventType.DISARMED, EventType.BATTERY_FULL -> e.type.name
                EventType.LABEL, EventType.REPORT -> continue
            }
            store.add(LogInput.Event(e.seq, type, now - e.elapsedMs))
            any = true
        }
        if (any) onChange()
    }

    /** The user's answer to the "did the power go out?" prompt, for the alerts feature to call (R2.1, R2.4). */
    fun recordAnswer(refSeq: Long, yes: Boolean) {
        store.add(LogInput.Answer(refSeq, yes, clock()))
        onChange()
    }

    /** Call after anything else changed the log (an area sync). */
    fun afterExternalChange() = onChange()

    /** "Power is out" (R7.1, R7.4, R7.6). */
    fun powerOut(): TapResult {
        val now = clock()
        val last = store.getSetting(LAST_REPORT)?.toLongOrNull()
        if (last != null && now - last in 0 until REPORT_GAP_MS) return TapResult.RATE_LIMITED
        store.putSetting(LAST_REPORT, now.toString())
        queueReport()
        if (onDetectionPlug()) return TapResult.OUT_QUEUED_ONLY
        store.add(LogInput.Report(now))
        onChange()
        return TapResult.OUT_STARTED
    }

    /** "Power is back" (R7.1, R7.2). */
    fun powerBack(): TapResult {
        val now = clock()
        if (OpenOut.openOut(store.all(), now) == null) return TapResult.NOTHING_OPEN
        store.add(LogInput.Back(now))
        onChange()
        return TapResult.BACK_RECORDED
    }

    /** Milliseconds until "Power is out" works again, or 0. */
    fun reportWaitMs(): Long {
        val last = store.getSetting(LAST_REPORT)?.toLongOrNull() ?: return 0
        return (REPORT_GAP_MS - (clock() - last)).coerceIn(0, REPORT_GAP_MS)
    }

    companion object {
        /** R7.6: one "Power is out" per 10 minutes. */
        const val REPORT_GAP_MS = 10 * 60_000L
        const val LAST_REPORT = "last_report_ms"
    }
}

/** The open `OUT` interval of a raw input list. */
object OpenOut {
    fun openOut(inputs: List<LogInput>, nowMs: Long): LogInterval? =
        TimelineBuilder.build(inputs, nowMs).lastOrNull()?.takeIf { it.state == LogState.OUT && it.endMs == null }
}
