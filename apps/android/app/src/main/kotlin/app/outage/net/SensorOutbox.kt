package app.outage.net

import app.outage.sensor.SensorController
import app.outage.sensor.SensorEvent

/**
 * event-ingest task 10: the Uploader's Outbox over the real sensor. The cell is added here, outside the sensor package,
 * so the sensor never holds location (sensor-android R9.6). With no cell chosen yet nothing is offered, and the events
 * wait in the sensor (up to the 7-day retention) instead of being sent without an area. Pure.
 */
class SensorOutbox(private val sensor: SensorController, private val cell: () -> String?) : OutboxPort {
    override fun getPending(limit: Int): List<PendingEvent> {
        val c = cell() ?: return emptyList()
        return sensor.getPendingEvents(limit).map { toPending(it, c) }
    }

    override fun ack(upToSeq: Long) = sensor.ackEvents(upToSeq)

    companion object {
        fun toPending(e: SensorEvent, cell: String) = PendingEvent(
            seq = e.seq,
            type = e.type.name,
            recordedElapsedMs = e.recordedElapsedMs,
            cell = cell,
            confidence = e.confidence.name,
            timeQuality = e.timeQuality.name,
            stopReason = e.stopReason,
            reason = e.reason,
            schedulingDelayMs = e.schedulingDelayMs,
            batteryPct = e.batteryPct,
            plugType = e.plugType.name,
        )
    }
}
