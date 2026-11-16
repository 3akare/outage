package app.outage.sensor

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.random.Random

/** Pure core: decision table, state machine, both drivers (sensor-android S1 to S8, station-mode T1 to T6). */
class SensorCoreTest {
    private val ac = Facts(Plug.AC, 60)
    private val off = Facts(Plug.NONE, 60)

    private fun run(start: MachineState, steps: List<Pair<Input, Facts>>, receiver: Boolean = true): Pair<MachineState, List<EventDraft>> {
        var s = start
        val out = mutableListOf<EventDraft>()
        steps.forEachIndexed { i, (input, f) ->
            val o = SensorStateMachine.step(s, input, f, 1_000L * (i + 1), receiver)
            s = o.state
            out += o.events
        }
        return s to out
    }

    @Test
    fun S2_plug_classification() {
        assertEquals(Plug.NONE, Plug.fromExtra(0))
        assertEquals(Plug.AC, Plug.fromExtra(1))
        assertEquals(Plug.USB, Plug.fromExtra(2))
        assertEquals(Plug.WIRELESS, Plug.fromExtra(4))
        assertEquals(Plug.DOCK, Plug.fromExtra(8))
        assertTrue(Plug.AC.detection && Plug.DOCK.detection)
        assertTrue(!Plug.USB.detection && !Plug.WIRELESS.detection && !Plug.NONE.detection)
    }

    @Test
    fun S3_decision_table_every_row() {
        val c = StopReasons.CONSTRAINT_CHARGING
        assertEquals(StopDecision(EventType.UNPLUG, Confidence.HIGH), decideStop(c, Facts(Plug.NONE, 94)))
        assertEquals(StopDecision(EventType.BATTERY_FULL, Confidence.HIGH), decideStop(c, Facts(Plug.NONE, 95)))
        assertEquals(Reason.NON_DETECTION_PLUG, decideStop(c, Facts(Plug.USB, 50)).reason)
        assertEquals(Reason.NON_DETECTION_PLUG, decideStop(c, Facts(Plug.WIRELESS, 50)).reason)
        assertEquals(Reason.STOP_REASON_MISMATCH, decideStop(c, Facts(Plug.AC, 50)).reason)
        assertEquals(StopDecision(EventType.DISARMED, Confidence.HIGH, "TIMEOUT"), decideStop(3, off))
        assertEquals(StopDecision(EventType.UNPLUG, Confidence.LOW), decideStop(null, Facts(Plug.NONE, 10)))
        assertEquals(StopDecision(EventType.BATTERY_FULL, Confidence.LOW), decideStop(null, Facts(Plug.NONE, 99)))
        assertEquals(Reason.NON_DETECTION_PLUG, decideStop(null, Facts(Plug.USB, 10)).reason)
        assertEquals(Reason.UNKNOWN_CAUSE, decideStop(null, Facts(Plug.DOCK, 10)).reason)
    }

    @Test
    fun S6_low_confidence_only_without_stop_reason() {
        for (r in listOf<Int?>(null, 1, 3, 6, 10)) for (p in Plug.entries) for (b in listOf(0, 50, 95, 100)) {
            val d = decideStop(r, Facts(p, b))
            assertEquals(if (r == null) Confidence.LOW else Confidence.HIGH, d.confidence)
        }
    }

    @Test
    fun S1_outage_and_restore_give_unplug_then_replug() {
        val (s, ev) = run(MachineState(), listOf(Input.Start to ac, Input.PowerDisconnected to off, Input.PowerConnected to ac))
        assertEquals(listOf(EventType.ARMED, EventType.UNPLUG, EventType.REPLUG), ev.map { it.type })
        assertEquals(0L, ev.last().schedulingDelayMs)
        assertEquals(Phase.ARMED, s.phase)
    }

    @Test
    fun S4_job_replug_carries_scheduling_delay() {
        val (_, ev) = run(MachineState(), listOf(Input.Start to ac, Input.JobStopped(6) to off, Input.JobStarted to ac), receiver = false)
        assertEquals(listOf(EventType.ARMED, EventType.UNPLUG, EventType.REPLUG), ev.map { it.type })
        assertEquals(1_000L, ev.last().schedulingDelayMs)
        assertEquals(Source.JOB, ev[1].source)
    }

    @Test
    fun S5_timeout_is_a_gap_without_receiver_and_silent_with_it() {
        val (s1, ev1) = run(MachineState(), listOf(Input.Start to ac, Input.JobStopped(3) to ac, Input.JobStarted to ac), receiver = false)
        assertEquals(listOf(EventType.ARMED, EventType.DISARMED, EventType.ARMED), ev1.map { it.type })
        assertEquals(Phase.ARMED, s1.phase)
        val (_, ev2) = run(MachineState(), listOf(Input.Start to ac, Input.JobStopped(3) to ac, Input.JobStarted to ac), receiver = true)
        assertEquals(listOf(EventType.ARMED), ev2.map { it.type })
    }

    @Test
    fun S5_user_stop_disarms_and_goes_idle() {
        val (s, ev) = run(MachineState(), listOf(Input.Start to ac, Input.UserStopped to ac, Input.PowerDisconnected to off))
        assertEquals(listOf(EventType.ARMED, EventType.DISARMED), ev.map { it.type })
        assertEquals(Reason.USER_STOPPED, ev.last().reason)
        assertEquals(Phase.IDLE, s.phase)
    }

    @Test
    fun S8_recovery_after_reboot_and_process_death() {
        val armed = MachineState(Phase.ARMED)
        val r1 = SensorStateMachine.step(armed, Input.Recovered(bootChanged = true), ac, 5, true)
        assertEquals(listOf(EventType.DISARMED, EventType.ARMED), r1.events.map { it.type })
        assertEquals(Reason.REBOOT, r1.events[0].reason)
        val dropped = MachineState(Phase.DROPPED, 3)
        val r2 = SensorStateMachine.step(dropped, Input.Recovered(bootChanged = false), ac, 5, true)
        assertEquals(listOf(EventType.REPLUG), r2.events.map { it.type })
        assertEquals(Confidence.LOW, r2.events[0].confidence)
        assertNull(r2.events[0].schedulingDelayMs)
        val r3 = SensorStateMachine.step(dropped, Input.Recovered(bootChanged = false), off, 5, true)
        assertEquals(Phase.DROPPED, r3.state.phase)
        assertTrue(r3.events.isEmpty())
    }

    @Test
    fun T2_receiver_unplug_any_battery() {
        for (b in 0..100) for (from in listOf(Phase.ARMED, Phase.FULL)) {
            val o = SensorStateMachine.step(MachineState(from), Input.PowerDisconnected, Facts(Plug.NONE, b), 9, true)
            assertEquals(listOf(EventType.UNPLUG), o.events.map { it.type })
            assertEquals(Source.RECEIVER, o.events[0].source)
        }
    }

    @Test
    fun T3_mismatch_emits_nothing() {
        val o = SensorStateMachine.step(MachineState(Phase.ARMED), Input.PowerDisconnected, ac, 9, true)
        assertTrue(o.events.isEmpty())
        assertTrue(o.broadcastMismatch)
        assertEquals(Phase.ARMED, o.state.phase)
    }

    @Test
    fun T6_heartbeat_only_while_armed() {
        for (p in Phase.entries) {
            val o = SensorStateMachine.step(MachineState(p), Input.Heartbeat, ac, 9, true)
            val expected = when (p) {
                Phase.ARMED -> EventType.ARMED
                // home-watch R3.1: on battery the heartbeat is DISARMED with a reason; the phase never changes.
                Phase.DROPPED, Phase.NOT_CHARGING -> EventType.DISARMED
                else -> null
            }
            assertEquals(if (expected == null) 0 else 1, o.events.size)
            assertEquals(expected, o.events.firstOrNull()?.type)
            assertEquals(MachineState(p), o.state)
            if (expected == EventType.DISARMED) assertEquals(Reason.HEARTBEAT_ON_BATTERY, o.events[0].reason)
        }
    }

    /** T1, T4: random interleavings of both drivers reporting the same drops give exactly one UNPLUG and one REPLUG each. */
    @Test
    fun T1_T4_single_unplug_and_replug_any_interleaving() {
        val rng = Random(20261123)
        repeat(500) {
            var steps = mutableListOf<Pair<Input, Facts>>(Input.Start to ac)
            val outages = rng.nextInt(1, 6)
            repeat(outages) {
                val down = mutableListOf<Input>(Input.PowerDisconnected, Input.JobStopped(6))
                if (rng.nextBoolean()) down.removeAt(rng.nextInt(2)) // one driver may miss it
                down.shuffle(rng)
                down.forEach { steps += it to off }
                if (rng.nextBoolean()) steps += Input.Heartbeat to off
                val up = mutableListOf<Input>(Input.PowerConnected, Input.JobStarted)
                if (rng.nextBoolean()) up.removeAt(rng.nextInt(2))
                up.shuffle(rng)
                up.forEach { steps += it to ac }
                if (rng.nextBoolean()) steps += Input.Heartbeat to ac
            }
            val (_, ev) = run(MachineState(), steps, receiver = rng.nextBoolean())
            assertEquals(outages, ev.count { it.type == EventType.UNPLUG })
            assertEquals(outages, ev.count { it.type == EventType.REPLUG })
            // T4: every REPLUG follows an UNPLUG with no other REPLUG in between.
            var open = false
            for (e in ev) when (e.type) {
                EventType.UNPLUG -> { assertTrue(!open); open = true }
                EventType.REPLUG -> { assertTrue(open); open = false }
                else -> Unit
            }
        }
    }

    @Test
    fun T7_heartbeat_vs_silence_limit() {
        assertTrue(SensorService.HEARTBEAT_MS * 3 <= 30 * 60_000L)
    }

    /** T5: switching the receiver on or off at any point emits nothing and keeps seq strictly increasing. */
    @Test
    fun T5_mode_changes_are_silent() {
        val rng = Random(5)
        repeat(200) {
            val store = MemoryEventStore()
            val platform = FakePlatform(ac)
            val ctl = DefaultSensorController(store, FakeClock(), platform)
            ctl.start()
            repeat(30) {
                val before = store.all().size
                when (rng.nextInt(3)) {
                    0 -> { ctl.setReceiverActive(rng.nextBoolean()); assertEquals(before, store.all().size) }
                    1 -> { platform.facts = off; ctl.handle(Input.PowerDisconnected) }
                    else -> { platform.facts = ac; ctl.handle(Input.PowerConnected) }
                }
            }
            val seqs = store.all().map { it.seq }
            assertEquals(seqs.sorted().distinct(), seqs)
        }
    }
}
