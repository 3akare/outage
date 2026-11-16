package app.outage.demo

import java.io.File
import java.security.MessageDigest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** demo-mode task 5: the recorded replay player (R3) and the app copy of the replay file (DM7, app side). */
class ReplayPlayerTest {
    private val shared = File("../../../packages/shared/fixtures/replay.json")
    private val replay = ReplayParser.parse(shared.readText())

    private class Clock(var now: Long = 0L) : () -> Long {
        override fun invoke() = now
    }

    private fun runToEnd(p: ReplayPlayer, c: Clock): List<String> {
        val states = mutableListOf(p.view().frame.state)
        var guard = 0
        while (!p.view().finished && guard++ < 10_000) {
            c.now = p.view().nextAtMs ?: break
            p.tick()
            states += p.view().frame.state
        }
        return states
    }

    @Test
    fun R3_4_R3_5_play_reaches_every_state_including_your_spot_only() {
        val c = Clock()
        val p = ReplayPlayer(replay, c)
        p.play()
        val states = runToEnd(p, c)
        assertTrue(p.view().finished)
        assertEquals(replay.frames.size, states.size)
        for (s in listOf("NORMAL", "SPOT_ONLY", "POSSIBLE", "CONFIRMED", "RESTORED")) assertTrue("missing $s", s in states)
        assertEquals("Simulated replay", p.view().banner)
        assertTrue(p.view().explanation?.restore != null)
    }

    @Test
    fun R3_3_pause_restart_and_speed() {
        val c = Clock()
        val p = ReplayPlayer(replay, c)
        p.play()
        val gap1 = p.view().nextAtMs!! - c.now
        p.pause()
        c.now += 60_000
        p.tick()
        assertEquals(0, p.view().index) // paused: nothing moves
        p.setSpeed(4)
        p.play()
        assertEquals(gap1 / 4, p.view().nextAtMs!! - c.now)
        c.now = p.view().nextAtMs!!
        p.tick()
        assertEquals(1, p.view().index)
        p.restart()
        assertEquals(0, p.view().index)
        assertTrue(p.view().playing)
    }

    @Test
    fun R3_a_run_at_1x_takes_about_15_seconds_like_the_web_player() {
        val c = Clock()
        val p = ReplayPlayer(replay, c)
        p.play()
        runToEnd(p, c)
        assertTrue("run took ${c.now} ms", c.now in 5_000L..30_000L)
        assertFalse(p.view().playing)
    }

    @Test
    fun DM7_replay_in_sync_the_app_asset_is_the_file_the_worker_serves() {
        // The app copies this one file at build time (CopyReplay in app/build.gradle.kts) and the Worker imports it.
        val gradle = File("build.gradle.kts").readText()
        assertTrue(gradle.contains("../../../packages/shared/fixtures/replay.json"))
        val worker = File("../../../workers/api/src/index.ts").readText()
        assertTrue(worker.contains("@outage/shared/fixtures/replay.json"))
        // When a build has already produced the asset, it must be byte for byte the shared file.
        val sha = { f: File -> MessageDigest.getInstance("SHA-256").digest(f.readBytes()).joinToString("") { "%02x".format(it) } }
        File("build").walkTopDown().filter { it.name == ReplayParser.ASSET_NAME && it.path.contains("copyReplay") }.forEach {
            assertEquals(it.path, sha(shared), sha(it))
        }
    }
}
