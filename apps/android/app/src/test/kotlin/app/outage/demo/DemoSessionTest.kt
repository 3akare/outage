package app.outage.demo

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

/** demo-mode task 4: `DemoSession` on the committed replay file (`packages/shared/fixtures/replay.json`). DM1, DM3, DM5. */
class DemoSessionTest {
    private val text = File("../../../packages/shared/fixtures/replay.json").readText()
    private val replay = ReplayParser.parse(text)

    private class Clock(var now: Long = 1_000_000L) : () -> Long {
        override fun invoke() = now
    }

    @Test
    fun DM1_all_labeled_the_loader_refuses_any_object_without_simulated_true() {
        // Each object kind in turn loses its label; the loader must refuse the whole file.
        val cuts = listOf(
            "\"simulated\": true,\n  \"label\": \"Simulated replay\"" to "\"label\": \"Simulated replay\"", // file
            "\"role\": \"SIMULATED_NEIGHBOR\",\n      \"simulated\": true" to "\"role\": \"SIMULATED_NEIGHBOR\"", // phone
            "\"tMs\": 0,\n      \"simulated\": true" to "\"tMs\": 0", // frame
            "\"type\": \"ARMED\",\n          \"simulated\": true" to "\"type\": \"ARMED\"", // frame event
        )
        for ((from, to) in cuts) {
            assertTrue("fixture text changed: $from", text.contains(from))
            try {
                ReplayParser.parse(text.replaceFirst(from, to))
                fail("accepted a file without simulated: true ($to)")
            } catch (_: ReplayFormatException) {
            }
        }
        for (key in listOf("\"label\": \"Simulated neighbor 1\"", "\"phase\": \"UNPLUG\"")) {
            val i = text.indexOf(key)
            val j = text.indexOf("\"simulated\": true", i)
            val broken = text.substring(0, j) + "\"simulated\": false" + text.substring(j + "\"simulated\": true".length)
            try {
                ReplayParser.parse(broken)
                fail("accepted an unlabelled neighbor or track frame")
            } catch (_: ReplayFormatException) {
            }
        }
    }

    @Test
    fun DM1_all_labeled_every_session_view_carries_the_banner() {
        val clock = Clock()
        val s = DemoSession(replay, clock)
        val views = mutableListOf(s.view())
        s.judgeUnplug(simulated = false)
        repeat(40) { clock.now += 100; views += s.view() }
        s.judgeReplug(simulated = false)
        repeat(200) { clock.now += 100; views += s.view() }
        views.forEach { assertEquals("Simulated neighbors", it.banner) }
        views.forEach { v -> v.phones.filterNot { it.isJudge }.forEach { assertTrue(it.simulated && it.label.startsWith("Simulated neighbor ")) } }
    }

    @Test
    fun R4_5_confirmed_shows_within_5_seconds_of_the_unplug_then_restored_after_the_replug() {
        val clock = Clock()
        val s = DemoSession(replay, clock)
        assertEquals(DemoSession.Step.WAITING, s.view().step)
        s.judgeUnplug(simulated = false)
        val t0 = clock.now
        var confirmedAt: Long? = null
        while (clock.now - t0 <= 5_000) {
            if (s.view().state == "CONFIRMED") { confirmedAt = clock.now; break }
            clock.now += 50
        }
        val at = confirmedAt ?: error("not confirmed within 5 s")
        assertTrue(at - t0 <= 5_000)
        val e = s.view().explanation ?: error("no explanation shown with Confirmed")
        assertTrue(e.k >= e.confirmedMinK && e.p <= e.confirmedMaxP)
        clock.now += 10_000
        assertEquals(replay.track.drops, s.view().drops)
        assertEquals(replay.track.armed, s.view().armed)
        s.judgeReplug(simulated = false)
        clock.now += replay.track.restoredAtMs
        assertEquals("RESTORED", s.view().state)
        clock.now += 60_000
        assertEquals(0, s.view().drops)
        assertNull(s.view().nextAtMs)
    }

    @Test
    fun DM5_one_real_drop_the_judge_only_or_none_in_simulate_mode() {
        for (simulate in listOf(false, true)) {
            val clock = Clock()
            val s = DemoSession(replay, clock)
            s.judgeUnplug(simulated = simulate)
            clock.now += 10_000
            val real = s.view().phones.filter { it.off && !it.simulated }
            assertEquals(if (simulate) 0 else 1, real.size)
            if (!simulate) assertTrue(real.single().isJudge)
            assertEquals(1, s.judgeEvents.size)
        }
        // The file itself holds no real drop.
        replay.track.frames.flatMap { it.events }.forEach { assertTrue(it.simulated) }
    }

    @Test
    fun R4_8_demo_alarm_is_due_once_after_restored_only_if_the_judge_said_yes() {
        val clock = Clock()
        val s = DemoSession(replay, clock)
        s.judgeUnplug(false)
        s.answerPrompt(wakeMe = true)
        clock.now += 5_000
        assertFalse(s.view().alarmDue)
        s.judgeReplug(false)
        clock.now += replay.track.restoredAtMs
        assertTrue(s.view().alarmDue)
        s.alarmRang()
        assertFalse(s.view().alarmDue)
        s.restart()
        assertEquals(DemoSession.Step.WAITING, s.view().step)
        assertTrue(s.judgeEvents.isEmpty())
    }

    @Test
    fun R4_7_an_early_replug_shows_every_unplug_frame_first() {
        val clock = Clock()
        val s = DemoSession(replay, clock)
        s.judgeUnplug(false)
        clock.now += 100
        s.judgeReplug(false)
        assertEquals(replay.track.drops - 1, s.view().phones.count { !it.isJudge && it.off })
    }
}
