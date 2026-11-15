package app.outage.net

/**
 * One event waiting in the Sensor Outbox, in the shape the Uploader needs. The real `SensorEvent`
 * (sensor-android design section 7) is adapted to this in event-ingest task 10, after `sensor-android`
 * exists; the sensor is not built here. No wall clock and no location (event-time.md, privacy.md).
 */
data class PendingEvent(
    val seq: Long,
    val type: String,
    /**
     * `SystemClock.elapsedRealtime()` captured when the event was recorded. The Uploader computes
     * `elapsedMs = sendElapsed - recordedElapsedMs` once per batch at send time, so a delayed retry never
     * reuses a stale value (R9.6).
     */
    val recordedElapsedMs: Long,
    val cell: String,
    val confidence: String,
    val timeQuality: String,
    val simulated: Boolean = false,
    val stopReason: String? = null,
    val reason: String? = null,
    val schedulingDelayMs: Long? = null,
    val batteryPct: Int? = null,
    val plugType: String? = null,
    val refSeq: Long? = null,
    val answer: String? = null,
) {
    /** Simulated events and reboot-crossing (`LOST`) events are never uploaded (R9.7, R4.3). */
    val uploadable: Boolean get() = !simulated && timeQuality == "OK"
}

/** The Outbox the Uploader drains. Implemented over the Sensor's SQLite store in task 10. */
interface OutboxPort {
    /** Pending events in strictly increasing seq order (sensor-android R9.1). */
    fun getPending(limit: Int): List<PendingEvent>

    /** Remove every event with `seq <= upToSeq`. Cumulative (sensor-android `ackEvents`). */
    fun ack(upToSeq: Long)
}

/** Install ID and token from registration (event-ingest R2.1). Null until the phone has registered. */
interface CredentialsProvider {
    fun installId(): String?
    fun token(): String?
}

/** Monotonic clock, `SystemClock.elapsedRealtime()` on the phone. Injected so tests drive time. */
interface ElapsedClock {
    fun elapsedRealtimeMs(): Long
}

/**
 * The HTTP transport, behind an interface so JUnit drives a fake (design section 9). The real OkHttp/
 * `HttpURLConnection` transport is wired in task 10.
 */
fun interface Transport {
    fun post(request: EventsRequest, token: String): TransportResult
}

/** Either a parsed per-event response, or a retryable failure (network down, 5xx, 429, timeout). */
sealed interface TransportResult {
    data class Ok(val response: EventsResponse) : TransportResult
    data class Retry(val retryAfterMs: Long? = null) : TransportResult
}
