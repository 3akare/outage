package app.outage.net

import kotlin.random.Random

/**
 * Client upload tunables (event-ingest design section 4). These are operational limits, not detection
 * thresholds. `backoffBaseMs`/`backoffCapMs` are the client back-off envelope (R9.4); the spec leaves the
 * exact numbers to the client, recorded in docs/session-notes.md.
 */
data class UploaderConfig(
    val maxBatchEvents: Int = 100,
    val stateMaxWaitMs: Long = 900_000,
    val backoffBaseMs: Long = 1_000,
    val backoffCapMs: Long = 300_000,
)

/** What one [Uploader.flush] did, so a driver can schedule the next run. */
data class FlushResult(
    val attempted: Boolean,
    val sentCount: Int,
    val ackedUpToSeq: Long?,
    /** Delay until the next attempt is worth trying (back-off, retry-after, or state max-wait). Null if idle. */
    val nextDelayMs: Long?,
    val waitingForState: Boolean,
)

/**
 * Drains the Sensor Outbox to the ingest Worker (event-ingest R9). Pure and injectable: a clock, an RNG,
 * a [Transport] and a [CredentialsProvider] are supplied, so JUnit drives it with fakes (design section 9).
 * A driver (task 10) calls [flush] on triggers: a new detection event, the network coming back, or a timer.
 *
 * Policy:
 *  - Detection events (and LABEL) send immediately; state-only batches wait up to `stateMaxWaitMs` (R9.1, R9.2).
 *  - Events go in seq order, batched up to `maxBatchEvents` (R9.3).
 *  - `elapsedMs` is stamped once per batch at send time (R9.6).
 *  - Only accepted, duplicate and permanent-rejection results are acknowledged; transient results and failed
 *    requests leave events in the Outbox (R9.5). Simulated and LOST events are never sent (R9.7).
 *  - Failed requests back off exponentially with full jitter (R9.4).
 */
class Uploader(
    private val outbox: OutboxPort,
    private val transport: Transport,
    private val clock: ElapsedClock,
    private val rng: Random,
    private val credentials: CredentialsProvider,
    private val config: UploaderConfig = UploaderConfig(),
) {
    private var failedAttempts = 0
    private var nextAttemptElapsedMs = 0L

    fun flush(): FlushResult {
        val installId = credentials.installId()
        val token = credentials.token()
        if (installId == null || token == null) return idle()

        val now = clock.elapsedRealtimeMs()
        val pending = outbox.getPending(config.maxBatchEvents)
        if (pending.isEmpty()) return idle()

        // Simulated and LOST events are handled locally: never sent, acknowledged in seq order (R9.7).
        val handled = HashMap<Long, Boolean>()
        for (e in pending) if (!e.uploadable) handled[e.seq] = true

        val sendable = pending.filter { it.uploadable }
        val hasPrompt = sendable.any { WireType.isPrompt(it.type) }
        val oldestAgeMs = sendable.maxOfOrNull { now - it.recordedElapsedMs } ?: -1L
        val stateWaitElapsed = oldestAgeMs >= config.stateMaxWaitMs
        val inBackoff = now < nextAttemptElapsedMs
        val shouldSend = sendable.isNotEmpty() && (hasPrompt || stateWaitElapsed) && !inBackoff

        var sentCount = 0
        var nextDelayMs: Long? = null

        if (shouldSend) {
            val batch = sendable.take(config.maxBatchEvents)
            val wire = batch.map { toWire(it, installId, now) }
            when (val r = transport.post(EventsRequest(installId, wire), token)) {
                is TransportResult.Retry -> {
                    failedAttempts++
                    val delay = r.retryAfterMs ?: backoff(failedAttempts)
                    nextAttemptElapsedMs = now + delay
                    nextDelayMs = delay
                }
                is TransportResult.Ok -> {
                    failedAttempts = 0
                    nextAttemptElapsedMs = 0L
                    sentCount = batch.size
                    val bySeq = r.response.results.associateBy { it.seq }
                    for (e in batch) handled[e.seq] = isHandled(bySeq[e.seq])
                    // A transient per-event result (e.g. RATE_LIMITED) with a hint: wait before resending.
                    if (batch.any { handled[it.seq] != true }) r.response.retryAfterMs?.let {
                        nextAttemptElapsedMs = now + it
                        nextDelayMs = it
                    }
                }
            }
        }

        // Cumulative ack: the longest seq-ordered prefix in which every event is handled.
        var ackSeq: Long? = null
        for (e in pending) {
            if (handled[e.seq] == true) ackSeq = e.seq else break
        }
        ackSeq?.let { outbox.ack(it) }

        val waitingForState = sendable.isNotEmpty() && !hasPrompt && !stateWaitElapsed
        if (nextDelayMs == null) {
            nextDelayMs = when {
                inBackoff -> nextAttemptElapsedMs - now
                waitingForState -> config.stateMaxWaitMs - oldestAgeMs
                // Still events left unsent (e.g. beyond the batch window): a driver should flush again now.
                sendable.size > sentCount && sentCount > 0 -> 0L
                else -> null
            }
        }
        return FlushResult(shouldSend, sentCount, ackSeq, nextDelayMs, waitingForState)
    }

    private fun idle() = FlushResult(false, 0, null, null, false)

    private fun isHandled(res: EventResult?): Boolean {
        if (res == null) return false
        return when (res.status) {
            EventStatus.ACCEPTED, EventStatus.DUPLICATE -> true
            EventStatus.REJECTED -> res.permanent ?: (res.code in RejectCode.PERMANENT)
        }
    }

    private fun toWire(e: PendingEvent, installId: String, nowElapsedMs: Long): WireEvent =
        WireEvent(
            installId = installId,
            seq = e.seq,
            type = e.type,
            elapsedMs = nowElapsedMs - e.recordedElapsedMs, // R9.6: one send time for the whole batch
            cell = e.cell,
            confidence = e.confidence,
            timeQuality = "OK",
            stopReason = e.stopReason,
            reason = e.reason,
            schedulingDelayMs = e.schedulingDelayMs,
            batteryPct = e.batteryPct,
            plugType = e.plugType,
            refSeq = e.refSeq,
            answer = e.answer,
        )

    /** Full-jitter exponential back-off (R9.4): a random wait in [0, min(cap, base * 2^(attempt-1))]. */
    private fun backoff(attempt: Int): Long {
        val shift = minOf(attempt - 1, 20)
        val ceil = minOf(config.backoffCapMs, config.backoffBaseMs shl shift)
        return rng.nextLong(0, ceil + 1)
    }
}
