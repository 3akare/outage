package app.outage.sensor

/** One stored event (design section 7). `bootCount` marks events from an earlier boot as `LOST` (R9.4). */
data class StoredEvent(
    val seq: Long,
    val draft: EventDraft,
    val bootCount: Int,
    val acked: Boolean = false,
)

/** The event the app reads (`getPendingEvents`). `elapsedMs` is computed at read time. */
data class SensorEvent(
    val seq: Long,
    val type: EventType,
    val elapsedMs: Long,
    /** Kept so the Uploader can stamp elapsed time at send time (event-ingest R9.6). */
    val recordedElapsedMs: Long,
    val timeQuality: TimeQuality,
    val confidence: Confidence,
    val stopReason: String?,
    val batteryPct: Int,
    val plugType: Plug,
    val schedulingDelayMs: Long?,
    val reason: String?,
    val source: Source,
    val refSeq: Long? = null,
    val answer: String? = null,
)

/** Read-time view of a stored event: elapsed time is only valid within the same boot (R9.4). */
fun StoredEvent.toSensorEvent(nowElapsedMs: Long, currentBoot: Int): SensorEvent {
    val sameBoot = bootCount == currentBoot && draft.recordedElapsedMs <= nowElapsedMs
    return SensorEvent(
        seq = seq,
        type = draft.type,
        elapsedMs = if (sameBoot) nowElapsedMs - draft.recordedElapsedMs else 0,
        recordedElapsedMs = draft.recordedElapsedMs,
        timeQuality = if (sameBoot) TimeQuality.OK else TimeQuality.LOST,
        confidence = draft.confidence,
        stopReason = draft.stopReason,
        batteryPct = draft.batteryPct,
        plugType = draft.plug,
        schedulingDelayMs = draft.schedulingDelayMs,
        reason = draft.reason,
        source = draft.source,
        refSeq = draft.refSeq,
        answer = draft.answer,
    )
}

/** Seven days, the ingest limit (event-ingest R4, `MAX_ELAPSED_MS`), also the local retention (R9.5, R10.5). */
const val RETENTION_MS = 604_800_000L

/**
 * The Outbox (R9). The store assigns strictly increasing sequence numbers that survive restarts and resets (R9.1, S7).
 * Implementations: [SqliteEventStore] on the phone, [MemoryEventStore] in tests.
 */
interface EventStore {
    /** Writes the event and returns its sequence number. Throws if the write failed. */
    fun append(draft: EventDraft, bootCount: Int): Long
    fun pending(limit: Int): List<StoredEvent>
    /** All events, acked or not, oldest first. For telemetry. */
    fun all(): List<StoredEvent>
    fun ack(upToSeq: Long)
    /** Drops acked events older than [RETENTION_MS] in this boot, and acked events from earlier boots. */
    fun prune(nowElapsedMs: Long, currentBoot: Int)
    fun getState(key: String): String?
    fun putState(key: String, value: String?)
    /** Delete-my-data (R12). The sequence counter is kept so a later seq never repeats one the server saw. */
    fun clearAll()
}

/** Which stored events retention removes. Pure, shared by both stores. */
fun shouldPrune(e: StoredEvent, nowElapsedMs: Long, currentBoot: Int): Boolean =
    e.acked && (e.bootCount != currentBoot || nowElapsedMs - e.draft.recordedElapsedMs > RETENTION_MS)

class MemoryEventStore : EventStore {
    private val events = mutableListOf<StoredEvent>()
    private val state = HashMap<String, String>()
    private var lastSeq = 0L
    var failWrites = false

    override fun append(draft: EventDraft, bootCount: Int): Long {
        if (failWrites) throw IllegalStateException("write failed")
        lastSeq++
        events += StoredEvent(lastSeq, draft, bootCount)
        return lastSeq
    }

    override fun pending(limit: Int) = events.filter { !it.acked }.take(limit)
    override fun all(): List<StoredEvent> = events.toList()

    override fun ack(upToSeq: Long) {
        events.replaceAll { if (it.seq <= upToSeq) it.copy(acked = true) else it }
    }

    override fun prune(nowElapsedMs: Long, currentBoot: Int) {
        events.removeAll { shouldPrune(it, nowElapsedMs, currentBoot) }
    }

    override fun getState(key: String) = state[key]
    override fun putState(key: String, value: String?) {
        if (value == null) state.remove(key) else state[key] = value
    }

    override fun clearAll() {
        events.clear()
        state.clear()
    }
}
