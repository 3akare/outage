package app.outage.net

import app.outage.onboarding.MiniJson
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * event-ingest R1.4: the Worker (Vitest) and the app (JUnit) both read the same contract fixtures in
 * `core/shared/fixtures/ingest/`, so the Kotlin wire types cannot drift from the shared schema.
 * Gradle runs unit tests with the module directory (`android/outage/app`) as the working directory.
 */
class WireContractTest {
    private val dir = File("../../../core/shared/fixtures/ingest")
    private fun read(name: String): String = File(dir, name).readText()

    /** The exact field names the strict schema allows (event-ingest R1.1, design section 5). */
    private val allowedKeys = setOf(
        "installId", "seq", "type", "elapsedMs", "cell", "confidence", "timeQuality",
        "stopReason", "reason", "schedulingDelayMs", "batteryPct", "plugType", "refSeq", "answer",
    )

    @Test
    fun I7_contract_single_event_fixtures_decode() {
        val armed = WireJson.decodeEvent(read("event-armed.json"))
        assertEquals(WireType.ARMED, armed.type)
        assertEquals(1L, armed.seq)
        assertEquals(1200L, armed.elapsedMs)
        assertEquals("OK", armed.timeQuality)

        val unplug = WireJson.decodeEvent(read("event-unplug.json"))
        assertEquals(WireType.UNPLUG, unplug.type)
        assertEquals(0L, unplug.elapsedMs)
        assertEquals(64, unplug.batteryPct)
        assertEquals("AC", unplug.plugType)
        assertNull(unplug.schedulingDelayMs) // present as null in the fixture

        val full = WireJson.decodeEvent(read("event-battery-full.json"))
        assertEquals(WireType.BATTERY_FULL, full.type)
        assertEquals(604_800_000L, full.elapsedMs) // exactly 7 days, the accepted boundary
        assertEquals(100, full.batteryPct)

        val replug = WireJson.decodeEvent(read("event-replug.json"))
        assertEquals(WireType.REPLUG, replug.type)
        assertEquals(1500L, replug.schedulingDelayMs)

        val label = WireJson.decodeEvent(read("event-label.json"))
        assertEquals(WireType.LABEL, label.type)
        assertEquals(3L, label.refSeq)
        assertEquals("YES", label.answer)
    }

    @Test
    fun I7_contract_request_fixture_decodes_in_order() {
        val req = WireJson.decodeRequest(read("events-request.json"))
        assertEquals("kg4yq7mxwb2ndpr3tfhj5vcsaz", req.installId)
        assertEquals(
            listOf("ARMED", "DISARMED", "UNPLUG", "BATTERY_FULL", "REPLUG", "LABEL"),
            req.events.map { it.type },
        )
        assertEquals((1L..6L).toList(), req.events.map { it.seq })
        req.events.forEach { assertEquals(req.installId, it.installId) }
    }

    @Test
    fun I7_contract_response_fixture_decodes() {
        val res = WireJson.decodeResponse(read("events-response.json"))
        assertEquals(20_000L, res.retryAfterMs)
        assertEquals(EventStatus.ACCEPTED, res.results[0].status)
        assertEquals(EventStatus.DUPLICATE, res.results[1].status)
        val rejected = res.results[2]
        assertEquals(EventStatus.REJECTED, rejected.status)
        assertEquals(RejectCode.RATE_LIMITED, rejected.code)
        assertEquals(false, rejected.permanent)
    }

    @Test
    fun I7_contract_encode_round_trips_and_emits_only_allowed_keys() {
        val req = WireJson.decodeRequest(read("events-request.json"))
        val encoded = WireJson.encodeRequest(req)
        // Re-decoding yields the same structure.
        assertEquals(req, WireJson.decodeRequest(encoded))
        // Semantic equality with the fixture, treating an absent key as an explicit null.
        assertEquals(norm(MiniJson.parse(read("events-request.json"))), norm(MiniJson.parse(encoded)))

        // No field outside the strict schema is ever emitted (R1.2); no wall-clock field exists.
        @Suppress("UNCHECKED_CAST")
        val events = (MiniJson.parse(encoded) as Map<String, Any?>)["events"] as List<Map<String, Any?>>
        for (e in events) {
            assertTrue("unexpected keys: " + e.keys, allowedKeys.containsAll(e.keys))
            assertFalse(e.keys.any { it.contains("wall", true) || it.contains("clock", true) || it == "timestamp" })
        }
    }

    /** Drops null-valued map entries recursively so "absent" and "present null" compare equal. */
    private fun norm(v: Any?): Any? = when (v) {
        is Map<*, *> -> v.entries.filter { it.value != null }.associate { it.key to norm(it.value) }
        is List<*> -> v.map { norm(it) }
        else -> v
    }
}
