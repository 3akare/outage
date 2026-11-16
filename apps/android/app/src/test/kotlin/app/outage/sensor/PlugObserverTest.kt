package app.outage.sensor

import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** sensor-android R13 (demo-mode task 1): the plug observer's change filter and the demo flag. */
class PlugObserverTest {
    @After
    fun reset() = DemoFlag.leave()

    @Test
    fun R13_1_only_plug_changes_are_reported_not_level_ticks() {
        val seen = mutableListOf<Plug>()
        val f = PlugChangeFilter { seen += it }
        listOf(1, 1, 1, 0, 0, 2, 1, 1).forEach { f.offer(Plug.fromExtra(it)) }
        assertEquals(listOf(Plug.AC, Plug.NONE, Plug.USB, Plug.AC), seen)
    }

    @Test
    fun R13_2_demo_flag_suppresses_the_prompt_only_while_open() {
        assertFalse(DemoFlag.suppressPrompt(0))
        DemoFlag.enter()
        assertTrue(DemoFlag.suppressPrompt(0))
        DemoFlag.leave()
        assertFalse(DemoFlag.suppressPrompt(0))
    }

    @Test
    fun R13_3_demo_flag_clears_after_30_seconds_in_the_background() {
        DemoFlag.enter()
        DemoFlag.backgrounded(1_000)
        assertTrue(DemoFlag.suppressPrompt(31_000)) // exactly 30 s: still open
        DemoFlag.foregrounded()
        DemoFlag.backgrounded(40_000)
        assertFalse(DemoFlag.suppressPrompt(70_001))
        assertFalse(DemoFlag.suppressPrompt(70_002)) // stays cleared once cleared
    }
}
