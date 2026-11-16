package app.outage.sensor

import app.outage.onboarding.MiniJson
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class FakeClock(var now: Long = 1_000, var boot: Int = 1) : SensorClock {
    override fun elapsedMs() = now
    override fun bootCount() = boot
}

class FakePlatform(var facts: Facts = Facts(Plug.AC, 50)) : SensorPlatform {
    var scheduled = 0
    var cancelled = 0
    var receiverStarts = 0
    var blockReceiver: String? = null
    override fun facts() = facts
    override fun scheduleJob() { scheduled++ }
    override fun cancelJob() { cancelled++ }
    override fun startReceiver(): String? { receiverStarts++; return blockReceiver }
    override fun stopReceiver() {}
}

/** SensorController against fake adapters (sensor-android task 9, S7, R2, R10, R11, R12). */
class SensorControllerTest {
    private val store = MemoryEventStore()
    private val clock = FakeClock()
    private val platform = FakePlatform()
    private val ctl = DefaultSensorController(store, clock, platform).also { it.setReceiverActive(true) }

    @Test
    fun R11_start_arms_schedules_job_and_starts_receiver() {
        val s = ctl.start()
        assertEquals(SensorKind.ARMED, s.kind)
        assertTrue(platform.scheduled > 0)
        assertEquals(1, platform.receiverStarts)
        assertEquals(listOf(EventType.ARMED), ctl.getPendingEvents(10).map { it.type })
    }

    @Test
    fun R4_3_replug_reaches_listener_in_process() {
        val heard = mutableListOf<EventType>()
        ctl.addListener { heard += it.type }
        ctl.start()
        platform.facts = Facts(Plug.NONE, 50); ctl.handle(Input.PowerDisconnected)
        platform.facts = Facts(Plug.AC, 50); ctl.handle(Input.PowerConnected)
        assertEquals(listOf(EventType.ARMED, EventType.UNPLUG, EventType.REPLUG), heard)
    }

    @Test
    fun S7_seq_strictly_increasing_across_restart_and_ack() {
        ctl.start()
        repeat(20) { i ->
            clock.now += 1_000
            platform.facts = if (i % 2 == 0) Facts(Plug.NONE, 50) else Facts(Plug.AC, 50)
            ctl.handle(if (i % 2 == 0) Input.PowerDisconnected else Input.PowerConnected)
            if (i == 7) ctl.ackEvents(ctl.getPendingEvents(100).last().seq)
        }
        // A new process over the same store: recovery appends, seq keeps growing.
        val again = DefaultSensorController(store, clock, platform)
        again.recoverOnProcessStart()
        val seqs = store.all().map { it.seq }
        assertEquals(seqs.sorted(), seqs)
        assertEquals(seqs.size, seqs.toSet().size)
    }

    @Test
    fun R9_4_events_across_reboot_are_lost() {
        ctl.start()
        clock.boot = 2
        clock.now = 10
        val e = ctl.getPendingEvents(10).single()
        assertEquals(TimeQuality.LOST, e.timeQuality)
        assertEquals(0L, e.elapsedMs)
    }

    @Test
    fun R5_4_reboot_recovery_records_gap() {
        ctl.start()
        clock.boot = 2
        clock.now = 50
        DefaultSensorController(store, clock, platform).recoverOnProcessStart()
        val types = store.all().map { it.draft.type to it.draft.reason }
        assertEquals(EventType.DISARMED to Reason.REBOOT, types[1])
        assertEquals(EventType.ARMED, types[2].first)
    }

    @Test
    fun R2_3_write_failure_is_counted_and_job_still_rescheduled() {
        ctl.start()
        val before = platform.scheduled
        store.failWrites = true
        platform.facts = Facts(Plug.NONE, 50)
        ctl.handle(Input.JobStopped(6))
        assertEquals(1, ctl.getDiagnostics().writeFailures)
        assertTrue(platform.scheduled > before)
    }

    @Test
    fun R10_telemetry_armed_ratio_and_gaps() {
        // Job only: armed 0..10 s, timeout gap 10..15 s, armed 15..20 s, unplug at 20 s.
        ctl.setReceiverActive(false)
        clock.now = 0; ctl.start()
        clock.now = 10_000; ctl.handle(Input.JobStopped(3))
        clock.now = 15_000; ctl.handle(Input.JobStarted)
        clock.now = 20_000; platform.facts = Facts(Plug.NONE, 50); ctl.handle(Input.JobStopped(6))
        clock.now = 30_000
        val t = ctl.getTelemetry(60_000)
        assertEquals(20_000L, t.chargingMs)
        assertEquals(15_000L, t.armedMs)
        assertEquals(0.75, t.armedRatio!!, 1e-9)
        assertEquals(listOf(Gap("TIMEOUT", 10_000, 5_000)), t.gaps)
        assertEquals(1, ctl.getDiagnostics().stopReasonCounts["TIMEOUT"])
    }

    /** home-watch R3.2: the battery heartbeat is not a gap and does not end the charging run or any armed interval. */
    @Test
    fun R3_2_battery_heartbeat_is_not_a_gap() {
        fun ev(seq: Long, type: EventType, at: Long, plug: Plug, reason: String? = null) =
            SensorEvent(seq, type, 0, at, TimeQuality.OK, Confidence.HIGH, null, 50, plug, null, reason, Source.RECEIVER)
        val armed = ev(1, EventType.ARMED, 0, Plug.AC)
        val unplug = ev(2, EventType.UNPLUG, 10_000, Plug.NONE)
        val beat = ev(3, EventType.DISARMED, 20_000, Plug.NONE, Reason.HEARTBEAT_ON_BATTERY)
        val withBeat = TelemetryCalc.compute(listOf(armed, unplug, beat), 30_000, 60_000)
        assertEquals(TelemetryCalc.compute(listOf(armed, unplug), 30_000, 60_000), withBeat)
        assertTrue(withBeat.gaps.isEmpty())
    }

    @Test
    fun R10_no_charging_gives_null_ratio() {
        platform.facts = Facts(Plug.NONE, 50)
        ctl.start()
        assertNull(ctl.getTelemetry(60_000).armedRatio)
        assertEquals(SensorKind.NOT_CHARGING, ctl.state().kind)
    }

    @Test
    fun R8_blocked_receiver_is_reported() {
        platform.blockReceiver = "FGS_START_BLOCKED"
        ctl.start()
        val d = ctl.getDiagnostics()
        assertFalse(d.receiverRunning)
        assertEquals("FGS_START_BLOCKED", d.receiverBlockedReason)
    }

    @Test
    fun R12_delete_all_data_erases_everything() {
        ctl.setInstallId("abc")
        ctl.start()
        ctl.deleteAllData()
        assertTrue(store.all().isEmpty())
        assertNull(ctl.installId())
        assertFalse(ctl.isOn)
        assertTrue(platform.cancelled > 0)
    }

    @Test
    fun R9_5_retention_drops_old_acked_events() {
        ctl.start()
        ctl.ackEvents(1)
        clock.now += RETENTION_MS + 1
        ctl.ackEvents(1)
        assertTrue(store.all().isEmpty())
    }

    @Test
    fun R9_contract_enum_names_match_shared_fixture() {
        val text = File("../../../packages/shared/fixtures/sensor/sensor-events.json").readText()
        @Suppress("UNCHECKED_CAST")
        val list = MiniJson.parse(text) as List<Map<String, Any?>>
        for (m in list) {
            EventType.valueOf(m["type"] as String)
            Plug.valueOf(m["plugType"] as String)
            Source.valueOf(m["source"] as String)
            Confidence.valueOf(m["confidence"] as String)
            TimeQuality.valueOf(m["timeQuality"] as String)
        }
        assertEquals(5, list.size)
    }

    /** R12, station-mode R10.2: the manifest asks for no microphone, motion, location or advertising permission and no dataSync service. */
    @Test
    fun R12_manifest_privacy_check() {
        val m = File("src/main/AndroidManifest.xml").readText()
        for (bad in listOf("RECORD_AUDIO", "ACCESS_FINE_LOCATION", "ACCESS_COARSE_LOCATION", "ACCESS_BACKGROUND_LOCATION",
            "BODY_SENSORS", "ACTIVITY_RECOGNITION", "HIGH_SAMPLING_RATE_SENSORS", "AD_ID", "READ_PHONE_STATE", "dataSync")) {
            assertFalse("manifest must not contain $bad", m.contains(bad))
        }
        assertTrue(m.contains("android:foregroundServiceType=\"specialUse\""))
        assertTrue(m.contains("PROPERTY_SPECIAL_USE_FGS_SUBTYPE"))
    }
}
