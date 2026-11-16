package app.outage.sensor

import app.outage.net.SensorOutbox
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** onboarding task 1 and 2 (O6_self_test_isolated) and alerts-and-light-alarm task 1 (LABEL on the sensor side). */
class SelfTestAndLabelTest {
    private val store = MemoryEventStore()
    private val clock = FakeClock()
    private val platform = FakePlatform()
    private val ctl = DefaultSensorController(store, clock, platform).also { it.setReceiverActive(true) }

    @Test
    fun label_is_queued_with_ref_seq_and_answer_and_maps_to_the_wire_shape() {
        ctl.start()
        val seq = ctl.queueLabel(3, "YES")
        assertNotNull(seq)
        val e = ctl.getPendingEvents(10).single { it.type == EventType.LABEL }
        assertEquals(3L, e.refSeq)
        assertEquals("YES", e.answer)
        val p = SensorOutbox.toPending(e, "88589c984dfffff")
        assertEquals("LABEL", p.type)
        assertEquals(3L, p.refSeq)
        assertNull(p.batteryPct)
        assertNull(p.plugType)
        assertNull(p.reason)
    }

    @Test
    fun label_write_failure_returns_null_and_counts() {
        store.failWrites = true
        assertNull(ctl.queueLabel(1, "NO"))
        assertEquals(1, ctl.getDiagnostics().writeFailures)
    }

    @Test
    fun O6_self_test_isolated() {
        ctl.start()
        ctl.getPendingEvents(10).lastOrNull()?.let { ctl.ackEvents(it.seq) }
        val heard = mutableListOf<EventType>()
        ctl.addListener { heard += it.type }
        ctl.beginSelfTest()
        platform.facts = Facts(Plug.NONE, 60)
        clock.now += 1_000; ctl.plugChanged(Plug.NONE)
        clock.now += 500; ctl.handle(Input.PowerDisconnected)
        clock.now += 2_000; ctl.handle(Input.JobStopped(StopReasons.CONSTRAINT_CHARGING))
        platform.facts = Facts(Plug.AC, 60)
        clock.now += 1_000; ctl.plugChanged(Plug.AC)
        clock.now += 3_000; ctl.handle(Input.PowerConnected)
        clock.now += 4_000; ctl.handle(Input.JobStarted)
        val r = ctl.endSelfTest()
        assertTrue(r.removalSeen && r.returnSeen && r.sensorArmed)
        assertEquals(7_000L, r.jobDelayMs) // removal lag 2.5 s, return lag 7 s: the larger one
        assertTrue(ctl.getPendingEvents(10).isEmpty())
        assertTrue(heard.isEmpty())
        assertEquals(r, ctl.getDiagnostics().selfTest)
        assertEquals(SensorKind.ARMED, ctl.state().kind)
        // Real events flow again afterwards.
        platform.facts = Facts(Plug.NONE, 60); ctl.handle(Input.PowerDisconnected)
        assertEquals(listOf(EventType.UNPLUG), ctl.getPendingEvents(10).map { it.type })
    }

    @Test
    fun self_test_sees_nothing_when_the_user_does_nothing() {
        ctl.start()
        ctl.beginSelfTest()
        val r = ctl.endSelfTest()
        assertFalse(r.removalSeen)
        assertFalse(r.returnSeen)
        assertTrue(r.sensorArmed)
        assertNull(r.jobDelayMs)
    }

    @Test
    fun a_test_that_ends_unplugged_leaves_the_sensor_not_charging_and_silent() {
        ctl.start()
        ctl.getPendingEvents(10).lastOrNull()?.let { ctl.ackEvents(it.seq) }
        ctl.beginSelfTest()
        platform.facts = Facts(Plug.NONE, 60)
        ctl.handle(Input.PowerDisconnected)
        ctl.endSelfTest()
        assertEquals(SensorKind.NOT_CHARGING, ctl.state().kind)
        assertTrue(ctl.getPendingEvents(10).isEmpty())
    }
}
