package app.outage.demo

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** demo-mode task 6: the Judge mode screen logic behind `DemoViewModel` (R1, R4, R8, design sections 8 and 9). */
class JudgeFlowTest {
    private val replay = ReplayParser.parse(File("../../../packages/shared/fixtures/replay.json").readText())

    private class Clock(var now: Long = 5_000_000L) : () -> Long {
        override fun invoke() = now
    }

    private val wall = JudgeFlow.Charger(charging = true, wallPlug = true)
    private val battery = JudgeFlow.Charger(charging = false, wallPlug = false)

    @Test
    fun R4_1_R4_2_a_real_unplug_on_the_unplug_page_starts_the_track_and_opens_the_demo_prompt() {
        val c = Clock()
        val f = JudgeFlow(replay, c)
        f.onCharger(wall)
        f.onCharger(battery) // on Judge home: ignored
        assertEquals(DemoSession.Step.WAITING, f.session!!.view().step)
        f.open(JudgeFlow.Page.UNPLUG)
        assertEquals(JudgeFlow.Instruction.PLUG_IN_FIRST, f.instruction())
        f.onCharger(wall)
        assertEquals(JudgeFlow.Instruction.UNPLUG_NOW, f.instruction())
        f.onCharger(battery)
        assertEquals(DemoSession.Step.UNPLUGGED, f.session!!.view().step)
        assertFalse(f.session!!.judgeEvents.single().simulated)
        assertTrue(f.promptOpen)
        f.answerPrompt(wakeMe = true)
        assertFalse(f.promptOpen)
        assertEquals(JudgeFlow.Instruction.PLUG_BACK, f.instruction())
        c.now += 5_000
        assertEquals("CONFIRMED", f.session!!.view().state)
        f.onCharger(wall)
        c.now += replay.track.restoredAtMs
        assertEquals("RESTORED", f.session!!.view().state)
        assertTrue(f.takeAlarm()) // R4.8: rings once
        assertFalse(f.takeAlarm())
        assertEquals(JudgeFlow.Instruction.DONE, f.instruction())
    }

    @Test
    fun R4_9_simulate_buttons_do_the_same_labelled_simulated_and_no_alarm_without_yes() {
        val c = Clock()
        val f = JudgeFlow(replay, c)
        f.open(JudgeFlow.Page.UNPLUG)
        assertEquals(JudgeFlow.Instruction.SIMULATE_ONLY, f.instruction()) // no plug report: emulator
        f.simulateUnplug()
        assertTrue(f.session!!.judgeEvents.single().simulated)
        f.answerPrompt(wakeMe = false)
        c.now += 5_000
        f.simulateReplug()
        c.now += 60_000
        assertEquals("RESTORED", f.session!!.view().state)
        assertFalse(f.takeAlarm())
    }

    @Test
    fun R1_4_R5_4_leaving_discards_everything_and_back_goes_to_judge_home_first() {
        val c = Clock()
        val f = JudgeFlow(replay, c)
        f.open(JudgeFlow.Page.UNPLUG)
        f.simulateUnplug()
        assertTrue(f.back())
        assertEquals(JudgeFlow.Page.HOME, f.page)
        assertFalse(f.back()) // the shell leaves Judge mode
        f.discard()
        assertTrue(f.session!!.judgeEvents.isEmpty())
        assertFalse(f.promptOpen)
    }

    @Test
    fun design_9_a_missing_replay_file_shows_the_error_and_offers_no_simulate_button() {
        val f = JudgeFlow(null, Clock())
        assertFalse(f.available)
        assertNull(f.session)
        f.simulateUnplug()
        assertEquals(JudgeFlow.Instruction.SIMULATE_ONLY, f.instruction())
        assertFalse(f.takeAlarm())
    }

    @Test
    fun R2_1_every_page_state_carries_a_simulated_label() {
        val f = JudgeFlow(replay, Clock())
        assertEquals("Simulated neighbors", f.session!!.view().banner)
        assertEquals("Simulated replay", f.player!!.view().banner)
    }
}
