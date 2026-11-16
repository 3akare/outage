package app.outage.net

import app.outage.sensor.DefaultSensorController
import app.outage.sensor.FakeClock
import app.outage.sensor.FakePlatform
import app.outage.sensor.Input
import app.outage.sensor.MemoryEventStore
import app.outage.sensor.Plug
import app.outage.sensor.Facts
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** event-ingest task 10: the real transport and the sensor Outbox, against a fake HTTP layer. */
class IngestApiTest {
    private class FakeHttp(var reply: (String, String) -> Pair<Int, String>?) : HttpPost {
        val calls = mutableListOf<Triple<String, String, String?>>()
        override fun post(url: String, body: String, token: String?): Pair<Int, String>? {
            calls += Triple(url, body, token)
            return reply(url, body)
        }
    }

    private val id = "abcdefghijklmnopqrstuvwxyz"
    private val cell = "883f5b2b6dfffff"

    @Test
    fun I1_register_parses_install_id_and_token() {
        val http = FakeHttp { _, _ -> 200 to """{"installId":"$id","token":"t.k"}""" }
        val r = IngestApi("https://x.dev/", http).register()
        assertEquals(Registration(id, "t.k"), r)
        assertEquals("https://x.dev/v1/register", http.calls.single().first)
        assertNull(IngestApi("https://x.dev", FakeHttp { _, _ -> 429 to "{}" }).register())
        assertNull(IngestApi("https://x.dev", FakeHttp { _, _ -> null }).register())
    }

    @Test
    fun I7_events_ok_retry_and_auth_header() {
        val http = FakeHttp { _, _ -> 200 to """{"results":[{"seq":1,"status":"accepted"}]}""" }
        val api = IngestApi("https://x.dev", http)
        val req = EventsRequest(id, listOf(WireEvent(id, 1, "UNPLUG", 5, cell, "HIGH")))
        val ok = api.post(req, "tok") as TransportResult.Ok
        assertEquals(EventStatus.ACCEPTED, ok.response.results.single().status)
        assertEquals("tok", http.calls.single().third)
        http.reply = { _, _ -> 429 to """{"retryAfterMs":3000}""" }
        assertEquals(TransportResult.Retry(3000), api.post(req, "tok"))
        http.reply = { _, _ -> null }
        assertEquals(TransportResult.Retry(), api.post(req, "tok"))
    }

    @Test
    fun R12_delete_refuses_malformed_ids() {
        val http = FakeHttp { _, _ -> 200 to "{}" }
        val api = IngestApi("https://x.dev", http)
        assertTrue(api.delete(id, "t", listOf(cell)))
        assertEquals("""{"installId":"$id","cells":["$cell"]}""", http.calls.single().second)
        assertFalse(api.delete("\"bad", "t", listOf(cell)))
        assertFalse(api.delete(id, "t", listOf("\"],\"x\":[\"")))
        assertEquals(1, http.calls.size)
    }

    @Test
    fun I7_sensor_outbox_adds_cell_and_waits_without_one() {
        val platform = FakePlatform(Facts(Plug.AC, 70))
        val sensor = DefaultSensorController(MemoryEventStore(), FakeClock(), platform)
        sensor.start()
        platform.facts = Facts(Plug.NONE, 70)
        sensor.handle(Input.PowerDisconnected)
        assertTrue(SensorOutbox(sensor) { null }.getPending(10).isEmpty())
        val out = SensorOutbox(sensor) { cell }
        val pending = out.getPending(10)
        assertEquals(listOf("ARMED", "UNPLUG"), pending.map { it.type })
        assertTrue(pending.all { it.cell == cell && it.uploadable })
        out.ack(pending.last().seq)
        assertTrue(out.getPending(10).isEmpty())
    }

    @Test
    fun I7_uploader_drains_sensor_end_to_end() {
        val platform = FakePlatform(Facts(Plug.AC, 70))
        val clock = FakeClock()
        val sensor = DefaultSensorController(MemoryEventStore(), clock, platform)
        sensor.start()
        platform.facts = Facts(Plug.NONE, 70)
        sensor.handle(Input.PowerDisconnected)
        val http = FakeHttp { _, body ->
            val seqs = Regex("\"seq\":(\\d+)").findAll(body).map { it.groupValues[1] }.toList()
            200 to """{"results":[${seqs.joinToString(",") { """{"seq":$it,"status":"accepted"}""" }}]}"""
        }
        val up = Uploader(
            SensorOutbox(sensor) { cell }, IngestApi("https://x.dev", http),
            object : ElapsedClock { override fun elapsedRealtimeMs() = clock.now },
            kotlin.random.Random(1),
            object : CredentialsProvider { override fun installId() = id; override fun token() = "t" },
        )
        val r = up.flush()
        assertEquals(2, r.sentCount)
        assertTrue(sensor.getPendingEvents(10).isEmpty())
    }
}
