package app.outage.net

import app.outage.onboarding.MiniJson

/**
 * Serialises the ingest wire types to and from JSON with no new dependency. Reuses the hand-written
 * [MiniJson] reader (onboarding design section 5). Only known fields are emitted, in the strict schema
 * (event-ingest R1): an optional field is written only when present, so no extra key can slip in.
 */
object WireJson {
    fun encodeRequest(req: EventsRequest): String {
        val sb = StringBuilder()
        sb.append("{\"installId\":").append(str(req.installId)).append(",\"events\":[")
        req.events.forEachIndexed { i, e ->
            if (i > 0) sb.append(',')
            encodeEvent(sb, e)
        }
        sb.append("]}")
        return sb.toString()
    }

    private fun encodeEvent(sb: StringBuilder, e: WireEvent) {
        val parts = ArrayList<String>(14)
        parts.add("\"installId\":" + str(e.installId))
        parts.add("\"seq\":" + e.seq)
        parts.add("\"type\":" + str(e.type))
        parts.add("\"elapsedMs\":" + e.elapsedMs)
        parts.add("\"cell\":" + str(e.cell))
        parts.add("\"confidence\":" + str(e.confidence))
        parts.add("\"timeQuality\":" + str(e.timeQuality))
        e.stopReason?.let { parts.add("\"stopReason\":" + str(it)) }
        e.reason?.let { parts.add("\"reason\":" + str(it)) }
        e.schedulingDelayMs?.let { parts.add("\"schedulingDelayMs\":" + it) }
        e.batteryPct?.let { parts.add("\"batteryPct\":" + it) }
        e.plugType?.let { parts.add("\"plugType\":" + str(it)) }
        e.refSeq?.let { parts.add("\"refSeq\":" + it) }
        e.answer?.let { parts.add("\"answer\":" + str(it)) }
        e.kind?.let { parts.add("\"kind\":" + str(it)) }
        sb.append('{').append(parts.joinToString(",")).append('}')
    }

    private fun str(s: String): String {
        val sb = StringBuilder(s.length + 2)
        sb.append('"')
        for (c in s) when (c) {
            '"' -> sb.append("\\\"")
            '\\' -> sb.append("\\\\")
            '\n' -> sb.append("\\n")
            '\r' -> sb.append("\\r")
            '\t' -> sb.append("\\t")
            else -> if (c < ' ') sb.append("\\u").append(c.code.toString(16).padStart(4, '0')) else sb.append(c)
        }
        sb.append('"')
        return sb.toString()
    }

    @Suppress("UNCHECKED_CAST")
    fun decodeEvent(text: String): WireEvent = eventFrom(MiniJson.parse(text) as Map<String, Any?>)

    @Suppress("UNCHECKED_CAST")
    fun decodeRequest(text: String): EventsRequest {
        val m = MiniJson.parse(text) as Map<String, Any?>
        val events = (m["events"] as List<Any?>).map { eventFrom(it as Map<String, Any?>) }
        return EventsRequest(m["installId"] as String, events)
    }

    @Suppress("UNCHECKED_CAST")
    fun decodeResponse(text: String): EventsResponse {
        val m = MiniJson.parse(text) as Map<String, Any?>
        val results = (m["results"] as List<Any?>).map {
            val r = it as Map<String, Any?>
            EventResult(
                seq = (r["seq"] as Double).toLong(),
                status = EventStatus.valueOf((r["status"] as String).uppercase()),
                code = r["code"] as String?,
                permanent = r["permanent"] as Boolean?,
            )
        }
        return EventsResponse(results, (m["retryAfterMs"] as Double?)?.toLong())
    }

    private fun eventFrom(m: Map<String, Any?>): WireEvent = WireEvent(
        installId = m["installId"] as String,
        seq = (m["seq"] as Double).toLong(),
        type = m["type"] as String,
        elapsedMs = (m["elapsedMs"] as Double).toLong(),
        cell = m["cell"] as String,
        confidence = m["confidence"] as String,
        timeQuality = m["timeQuality"] as String,
        stopReason = m["stopReason"] as String?,
        reason = m["reason"] as String?,
        schedulingDelayMs = (m["schedulingDelayMs"] as Double?)?.toLong(),
        batteryPct = (m["batteryPct"] as Double?)?.toInt(),
        plugType = m["plugType"] as String?,
        refSeq = (m["refSeq"] as Double?)?.toLong(),
        answer = m["answer"] as String?,
        kind = m["kind"] as String?,
    )
}
