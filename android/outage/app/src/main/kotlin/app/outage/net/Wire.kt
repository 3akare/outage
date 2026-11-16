package app.outage.net

/**
 * The ingest wire model (event-ingest design section 5). One strict schema lives in `core/shared`
 * (`core/shared/src/ingest.ts`); these Kotlin types mirror it and are checked against the shared
 * contract fixtures in `core/shared/fixtures/ingest/` by `WireContractTest`, so the two cannot drift.
 *
 * No wall-clock field exists here on purpose: the phone only ever sends `elapsedMs` (event-time.md, R1.5).
 */

/** Event types in the strict schema. `LABEL` was added by `alerts-and-light-alarm`. */
object WireType {
    const val ARMED = "ARMED"
    const val DISARMED = "DISARMED"
    const val UNPLUG = "UNPLUG"
    const val BATTERY_FULL = "BATTERY_FULL"
    const val REPLUG = "REPLUG"
    const val LABEL = "LABEL"

    /** power-log R7.4: the "Power is out" tap, kind OUT. Prompt like every non-state event. */
    const val REPORT = "REPORT"

    /** State events are write-behind on the server and may wait before upload (R9.2, ADR 0002). */
    val STATE = setOf(ARMED, DISARMED)

    /** Everything that is not a state event uploads promptly (R9.1; design: LABEL is uploaded promptly). */
    fun isPrompt(type: String): Boolean = type !in STATE
}

data class WireEvent(
    val installId: String,
    val seq: Long,
    val type: String,
    val elapsedMs: Long,
    val cell: String,
    val confidence: String,
    val timeQuality: String = "OK",
    val stopReason: String? = null,
    val reason: String? = null,
    val schedulingDelayMs: Long? = null,
    val batteryPct: Int? = null,
    val plugType: String? = null,
    val refSeq: Long? = null,
    val answer: String? = null,
    val kind: String? = null,
)

data class EventsRequest(val installId: String, val events: List<WireEvent>)

enum class EventStatus { ACCEPTED, DUPLICATE, REJECTED }

data class EventResult(
    val seq: Long,
    val status: EventStatus,
    val code: String? = null,
    val permanent: Boolean? = null,
)

data class EventsResponse(val results: List<EventResult>, val retryAfterMs: Long? = null)

/**
 * Rejection codes (event-ingest R8.3). Permanent codes mean the event will never be accepted, so the
 * Uploader acknowledges them (stops resending). Transient codes mean "try again later".
 */
object RejectCode {
    const val UNKNOWN_FIELD = "UNKNOWN_FIELD"
    const val BAD_CELL = "BAD_CELL"
    const val BAD_ELAPSED = "BAD_ELAPSED"
    const val TIME_LOST = "TIME_LOST"
    const val SIMULATED_REJECTED = "SIMULATED_REJECTED"
    const val RATE_LIMITED = "RATE_LIMITED"
    const val UNAVAILABLE = "UNAVAILABLE"

    val PERMANENT = setOf(UNKNOWN_FIELD, BAD_CELL, BAD_ELAPSED, TIME_LOST, SIMULATED_REJECTED)
    val TRANSIENT = setOf(RATE_LIMITED, UNAVAILABLE)
}
