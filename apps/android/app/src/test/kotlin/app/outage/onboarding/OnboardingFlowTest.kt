package app.outage.onboarding

import kotlin.random.Random
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** onboarding R1, R4, R5, R10; properties O1, O3, O7, O8. Seeded random loops, no extra dependency. */
class OnboardingFlowTest {
    private val facts0 = Gen.noneSet
    private val order = OnboardingStep.entries

    private fun invariant(rec: OnboardingRecord, where: String) {
        if (rec.step.ordinal > OnboardingStep.SPOT.ordinal) assertTrue(where + ": past Spot without a cell", rec.cell != null)
        if (rec.step.ordinal > OnboardingStep.CONSENT.ordinal) assertTrue(where + ": past Consent without consent", rec.hasConsent)
        rec.cell?.let { assertTrue(where + ": stored cell is not a cell", OnboardingFlow.isCell(it)) }
    }

    @Test
    fun O1_flow_machine_any_persisted_state_resumes_to_a_valid_step() {
        val r = Random(1)
        repeat(2000) { i ->
            val store = MemoryStore()
            store.save(Gen.record(r))
            val facts = Gen.facts(r)
            val flow = OnboardingFlow.open(store, facts)
            invariant(flow.snapshot, "open#" + i)
            if (flow.current != OnboardingStep.FINISH) {
                assertFalse("auto-skipped step shown: " + flow.current, OnboardingFlow.autoSkipped(flow.current, facts))
            }
        }
    }

    @Test
    fun O1_flow_machine_never_passes_consent_without_it_whatever_the_calls() {
        val r = Random(2)
        repeat(500) { i ->
            val flow = OnboardingFlow.open(MemoryStore(), Gen.facts(r))
            repeat(60) { n ->
                val label = Gen.act(flow, r, Gen.facts(r))
                invariant(flow.snapshot, "run#" + i + " op#" + n + " " + label)
            }
        }
    }

    @Test
    fun O1_flow_machine_ends_at_finish_for_any_sequence_of_skips() {
        val r = Random(3)
        repeat(1000) { i ->
            val store = MemoryStore()
            if (r.nextBoolean()) store.save(Gen.record(r))
            val flow = OnboardingFlow.open(store, Gen.facts(r))
            var guard = 0
            while (flow.current != OnboardingStep.FINISH && guard++ < 20) {
                val before = flow.current
                Gen.cooperate(flow, r, Gen.facts(r))
                invariant(flow.snapshot, "coop#" + i)
                assertTrue("no progress at " + before, flow.current.ordinal > before.ordinal)
            }
            assertEquals("run#" + i, OnboardingStep.FINISH, flow.current)
            assertTrue(flow.complete(Gen.facts(r)))
            assertTrue(flow.snapshot.completed)
        }
    }

    @Test
    fun O1_flow_machine_spot_and_consent_cannot_be_skipped_and_need_input() {
        val flow = OnboardingFlow.open(MemoryStore(), facts0)
        assertTrue(flow.startSetup(facts0))
        assertEquals(OnboardingStep.SPOT, flow.current)
        assertFalse(flow.skip(facts0))
        assertFalse(flow.complete(facts0))
        assertFalse(flow.chooseSpot("51.5,-0.12", null, null, facts0))
        assertFalse(flow.chooseSpot("88a5a9d8e1ffff", null, null, facts0))
        assertTrue(flow.chooseSpot(Gen.CELL, "Yaba", " ", facts0))
        assertNull(flow.snapshot.postcodePrefix)
        assertEquals(OnboardingStep.CONSENT, flow.current)
        assertFalse(flow.skip(facts0))
        assertFalse(flow.complete(facts0))
        assertFalse(flow.agree(0, 10, false, facts0))
        assertTrue(flow.agree(1, 10, true, facts0))
        assertEquals(OnboardingStep.NOTIFICATIONS, flow.current)
        assertEquals(1, flow.snapshot.consentVersion)
        assertEquals(10L, flow.snapshot.consentAtMs)
        assertTrue(flow.snapshot.diagnosticsOptIn)
    }

    @Test
    fun O1_flow_machine_records_skips_and_step_times() {
        val flow = OnboardingFlow.open(MemoryStore(), facts0)
        flow.startSetup(facts0, 1000)
        flow.chooseSpot(Gen.CELL, null, null, facts0, 4000)
        flow.agree(1, 5, false, facts0, 2000)
        flow.skip(facts0, 3000)
        flow.complete(facts0, 500)
        assertEquals(listOf(OnboardingStep.NOTIFICATIONS), flow.snapshot.skips)
        assertEquals(4000L, flow.snapshot.stepTimesMs[OnboardingStep.SPOT])
        assertEquals(3000L, flow.snapshot.stepTimesMs[OnboardingStep.NOTIFICATIONS])
        assertEquals(OnboardingStep.SELF_TEST, flow.current)
    }

    @Test
    fun O1_flow_machine_back_keeps_choices() {
        val flow = OnboardingFlow.open(MemoryStore(), facts0)
        flow.startSetup(facts0); flow.chooseSpot(Gen.CELL, "Yaba", "100", facts0); flow.agree(1, 9, false, facts0)
        assertTrue(flow.back(facts0))
        assertEquals(OnboardingStep.CONSENT, flow.current)
        assertTrue(flow.back(facts0))
        assertEquals(OnboardingStep.SPOT, flow.current)
        assertEquals(Gen.CELL, flow.snapshot.cell)
        assertTrue(flow.snapshot.hasConsent)
        assertTrue(flow.complete(facts0))
        assertTrue(flow.complete(facts0))
        assertEquals(OnboardingStep.NOTIFICATIONS, flow.current)
        assertTrue(flow.back(facts0) && flow.back(facts0) && flow.back(facts0))
        assertEquals(OnboardingStep.WELCOME, flow.current)
        assertFalse(flow.back(facts0))
    }

    @Test
    fun O3_no_register_before_consent_random_calls() {
        val r = Random(4)
        repeat(500) { i ->
            val store = MemoryStore()
            var registered = 0
            val gate = RegistrationGate(store) { registered++ }
            val flow = OnboardingFlow.open(store, Gen.facts(r))
            repeat(60) { n ->
                val label = Gen.act(flow, r, Gen.facts(r))
                val had = flow.snapshot.hasConsent
                val before = registered
                val ran = gate.registerIfConsented()
                assertEquals("run#" + i + " op#" + n + " " + label, had, ran)
                assertEquals(had, gate.mayUpload())
                assertEquals(had, flow.registrationAllowed)
                if (!had) assertEquals(before, registered)
            }
        }
    }

    @Test
    fun O3_no_register_before_consent_and_reset_withdraws_it() {
        val store = MemoryStore()
        var registered = 0
        val gate = RegistrationGate(store) { registered++ }
        assertFalse(gate.registerIfConsented())
        val flow = OnboardingFlow.open(store, facts0)
        flow.startSetup(facts0); flow.chooseSpot(Gen.CELL, null, null, facts0)
        assertFalse(gate.registerIfConsented())
        assertEquals(0, registered)
        flow.agree(1, 10, false, facts0)
        assertTrue(gate.registerIfConsented())
        assertEquals(1, registered)
        flow.reset()
        assertFalse(gate.mayUpload())
        assertEquals(OnboardingStep.WELCOME, flow.current)
        assertNull(store.saved)
    }

    @Test
    fun O3_no_register_before_consent_unreadable_store_means_no() {
        val broken = object : OnboardingStore {
            override fun load(): OnboardingRecord? = throw IllegalStateException("disk")
            override fun save(record: OnboardingRecord) {}
            override fun clear() {}
        }
        assertFalse(RegistrationGate(broken) { throw AssertionError("must not register") }.registerIfConsented())
        assertEquals(OnboardingStep.WELCOME, OnboardingFlow.open(broken, facts0).current)
    }

    @Test
    fun O7_resume_same_step_and_choices_at_every_point() {
        val r = Random(5)
        repeat(500) { i ->
            val store = MemoryStore()
            val facts = Gen.facts(r)
            var flow = OnboardingFlow.open(store, facts)
            repeat(40) { n ->
                val label = Gen.act(flow, r, facts)
                val reopened = OnboardingFlow.open(store, facts)
                assertEquals("run#" + i + " op#" + n + " " + label, flow.snapshot, reopened.snapshot)
                flow = reopened
            }
        }
    }

    @Test
    fun O7_resume_after_each_step_of_the_happy_path() {
        val store = MemoryStore()
        val facts = facts0
        val flow = OnboardingFlow.open(store, facts)
        val seen = ArrayList<OnboardingStep>()
        while (true) {
            seen += flow.current
            assertEquals(flow.current, OnboardingFlow.open(store, facts).current)
            if (flow.current == OnboardingStep.FINISH) break
            Gen.cooperate(flow, Random(6), facts)
        }
        assertEquals(order, seen)
    }

    @Test
    fun O7_resume_codec_round_trip_and_garbage() {
        val r = Random(7)
        repeat(300) {
            val rec = Gen.record(r)
            assertEquals(rec, OnboardingCodec.decode(OnboardingCodec.encode(rec)))
        }
        assertNull(OnboardingCodec.decode(emptyMap()))
        assertNull(OnboardingCodec.decode(mapOf("step" to "NOPE")))
        assertNull(OnboardingCodec.decode(mapOf("step" to "SPOT", "consentAtMs" to "abc")))
        assertNull(OnboardingCodec.decode(mapOf("step" to "SPOT", "stepTimesMs" to "SPOT")))
    }

    @Test
    fun O7_resume_moves_past_a_step_the_user_fixed_while_the_app_was_closed() {
        val store = MemoryStore()
        store.save(OnboardingRecord(step = OnboardingStep.NOTIFICATIONS, consentVersion = 1, consentAtMs = 5, cell = Gen.CELL))
        val granted = OnboardingFacts(notificationsOk = true, fullScreenOk = true, batteryExempt = false)
        assertEquals(OnboardingStep.BATTERY, OnboardingFlow.open(store, granted).current)
    }

    @Test
    fun O8_reonboarding_skips_only_spot_consent_and_finish_remain() {
        val facts = Gen.allSet
        val flow = OnboardingFlow.open(MemoryStore(), facts)
        assertEquals(OnboardingStep.WELCOME, flow.current)
        val shown = ArrayList<OnboardingStep>()
        flow.startSetup(facts)
        shown += flow.current
        flow.chooseSpot(Gen.CELL, null, null, facts)
        shown += flow.current
        flow.agree(1, 7, false, facts)
        shown += flow.current
        assertEquals(listOf(OnboardingStep.SPOT, OnboardingStep.CONSENT, OnboardingStep.FINISH), shown)
        assertTrue(flow.snapshot.skips.isEmpty())
    }

    @Test
    fun O8_reonboarding_skips_for_any_all_set_facts_and_shows_steps_when_one_is_missing() {
        val missing = listOf(
            OnboardingFacts(false, true, true), OnboardingFacts(true, false, true), OnboardingFacts(true, true, false),
        )
        for (f in missing) {
            val flow = OnboardingFlow.open(MemoryStore(), f)
            flow.startSetup(f); flow.chooseSpot(Gen.CELL, null, null, f); flow.agree(1, 7, false, f)
            assertTrue("a step is shown for " + f, flow.current != OnboardingStep.FINISH)
        }
        val r = Random(8)
        repeat(200) {
            val f = Gen.allSet
            val flow = OnboardingFlow.open(MemoryStore(), f)
            flow.startSetup(f); flow.chooseSpot(Gen.cell(r), null, null, f); flow.agree(1, 7, false, f)
            assertEquals(OnboardingStep.FINISH, flow.current)
        }
    }
}
