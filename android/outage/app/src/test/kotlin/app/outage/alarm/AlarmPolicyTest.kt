package app.outage.alarm

import java.util.Random
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** alerts-and-light-alarm task 3: L1, L2, L4, L9, L10. Seeded random loops, no extra dependency (design section 9). */
class AlarmPolicyTest {
    private val ttl = AlarmLimits.WAKE_TTL_MS

    private fun policy() = AlarmPolicy(MemoryWakeStore())

    @Test
    fun L1_one_prompt_per_unplug() {
        for (seed in 1..200) {
            val rnd = Random(seed.toLong())
            val p = policy()
            val seen = HashSet<Long>()
            var shows = 0
            repeat(40) {
                val seq = (rnd.nextInt(6) + 1).toLong()
                val actions = p.onUnplug(seq)
                val isNew = seen.add(seq)
                val n = actions.count { it is AlarmAction.ShowPrompt }
                assertEquals(if (isNew) 1 else 0, n)
                shows += n
            }
            assertEquals(seen.size, shows)
        }
    }

    @Test
    fun L1_prompt_removed_by_answer_replug_or_timeout() {
        val a = policy(); a.onUnplug(1)
        assertTrue(a.onAnswer(1, false, 10, 1).contains(AlarmAction.RemovePrompt(1)))
        val b = policy(); b.onUnplug(1)
        assertTrue(b.onReplug(10, 1).contains(AlarmAction.RemovePrompt(1)))
        val c = policy(); c.onUnplug(1)
        assertEquals(listOf(AlarmAction.RemovePrompt(1L)), c.onPromptTimeout(1))
        assertEquals(emptyList<AlarmAction>(), c.onPromptTimeout(1))
        assertEquals(null, c.openPrompt())
    }

    /** Reference model of R3: ring iff the latest unplug has an unexpired YES from this boot, then a REPLUG, once. */
    @Test
    fun L2_ring_iff_conditions() {
        for (seed in 1..500) {
            val rnd = Random(seed.toLong())
            val p = policy()
            var now = 1_000L
            var modelSeq = -1L
            var promptOpen = false
            var modelYes = false
            var modelExpires = 0L
            var modelFired = false
            var nextSeq = 1L
            repeat(60) {
                now += rnd.nextInt(3_600_000) * (if (rnd.nextInt(10) == 0) 10L else 1L)
                when (rnd.nextInt(3)) {
                    0 -> { p.onUnplug(nextSeq); modelSeq = nextSeq; promptOpen = true; modelYes = false; modelFired = false; nextSeq++ }
                    1 -> {
                        val target = if (rnd.nextBoolean() && modelSeq > 0) modelSeq else maxOf(1L, nextSeq - 2)
                        val yes = rnd.nextBoolean()
                        p.onAnswer(target, yes, now, 1)
                        if (target == modelSeq && promptOpen) { promptOpen = false; modelYes = yes; modelExpires = now + ttl }
                    }
                    else -> {
                        val rings = p.onReplug(now, 1).filterIsInstance<AlarmAction.Ring>()
                        val expect = modelSeq > 0 && modelYes && !modelFired && now < modelExpires
                        assertEquals("seed $seed", expect, rings.isNotEmpty())
                        assertTrue(rings.size <= 1)
                        if (expect) modelFired = true
                        promptOpen = false
                    }
                }
            }
        }
    }

    @Test
    fun L2_never_twice_and_never_without_yes() {
        val p = policy()
        p.onUnplug(1)
        assertTrue(p.onReplug(10, 1).none { it is AlarmAction.Ring })
        p.onUnplug(2); p.onAnswer(2, false, 20, 1)
        assertTrue(p.onReplug(30, 1).none { it is AlarmAction.Ring })
        p.onUnplug(3); p.onAnswer(3, true, 40, 1)
        assertEquals(1, p.onReplug(50, 1).count { it is AlarmAction.Ring })
        assertEquals(0, p.onReplug(60, 1).count { it is AlarmAction.Ring })
    }

    @Test
    fun L4_first_answer_wins_and_one_label() {
        for (seed in 1..200) {
            val rnd = Random(seed.toLong())
            val p = policy()
            p.onUnplug(7)
            var labels = 0
            var firstYes: Boolean? = null
            repeat(10) {
                val yes = rnd.nextBoolean()
                val out = p.onAnswer(7, yes, 100L + it, 1)
                if (firstYes == null) firstYes = yes
                labels += out.count { a -> a is AlarmAction.QueueLabel }
            }
            assertEquals(1, labels)
            val rings = p.onReplug(1_000, 1).count { it is AlarmAction.Ring }
            assertEquals(if (firstYes == true) 1 else 0, rings)
        }
    }

    @Test
    fun L4_answers_after_replug_are_ignored() {
        val p = policy()
        p.onUnplug(1)
        p.onReplug(10, 1)
        assertEquals(emptyList<AlarmAction>(), p.onAnswer(1, true, 20, 1))
        assertEquals(0, p.onReplug(30, 1).count { it is AlarmAction.Ring })
    }

    @Test
    fun L9_expired_wake_never_rings() {
        val p = policy()
        p.onUnplug(1); p.onAnswer(1, true, 1_000, 1)
        val out = p.onReplug(1_000 + ttl, 1)
        assertTrue(out.none { it is AlarmAction.Ring })
        assertTrue(out.contains(AlarmAction.DropWake(1)))
        val q = policy()
        q.onUnplug(1); q.onAnswer(1, true, 1_000, 1)
        assertEquals(1, q.onReplug(1_000 + ttl - 1, 1).count { it is AlarmAction.Ring })
    }

    @Test
    fun L9_wake_from_an_earlier_boot_never_rings() {
        val p = policy()
        p.onUnplug(1); p.onAnswer(1, true, 1_000, 1)
        assertTrue(p.onReplug(2_000, 2).none { it is AlarmAction.Ring })
        val q = policy()
        q.onUnplug(1); q.onAnswer(1, true, 1_000, 1)
        assertEquals(listOf(AlarmAction.DropWake(1L)), q.onReboot())
        assertTrue(q.onReplug(2_000, 1).none { it is AlarmAction.Ring })
        assertEquals(emptyList<AlarmAction>(), q.onReboot())
    }

    @Test
    fun L9_expire_drops_without_replug() {
        val p = policy()
        p.onUnplug(1); p.onAnswer(1, true, 1_000, 1)
        assertEquals(emptyList<AlarmAction>(), p.expire(2_000, 1))
        assertEquals(listOf(AlarmAction.DropWake(1L)), p.expire(1_000 + ttl, 1))
    }

    @Test
    fun new_unplug_supersedes_an_unrung_wake_but_not_a_rung_one() {
        val p = policy()
        p.onUnplug(1); p.onAnswer(1, true, 100, 1)
        val out = p.onUnplug(2)
        assertTrue(out.contains(AlarmAction.DropWake(1)))
        assertTrue(p.onReplug(200, 1).none { it is AlarmAction.Ring })
    }

    /** One episode: UNPLUG, answer, REPLUG. Episodes run one after another, as the phone does. */
    private data class Episode(val seq: Long, val yes: Boolean?)

    private fun run(episodes: List<Episode>, noise: Random?): List<Long> {
        val p = policy()
        val rung = mutableListOf<Long>()
        var now = 1_000L
        for (e in episodes) {
            now += 60_000
            val steps = mutableListOf<() -> List<AlarmAction>>()
            steps += { p.onUnplug(e.seq) }
            if (e.yes != null) steps += { p.onAnswer(e.seq, e.yes, now, 1) }
            steps += { p.onReplug(now + 1, 1) }
            for ((i, step) in steps.withIndex()) {
                rung += step().filterIsInstance<AlarmAction.Ring>().map { it.unplugSeq }
                if (noise != null) {
                    // Duplicates of events already delivered, and a late answer, arrive in any order.
                    if (i >= 0 && noise.nextBoolean()) p.onUnplug(e.seq)
                    if (i >= 1 && noise.nextBoolean()) p.onPromptTimeout(e.seq)
                    if (i >= 2 && noise.nextBoolean()) p.onAnswer(e.seq, noise.nextBoolean(), now, 1)
                    if (i >= 2 && noise.nextBoolean()) rung += p.onReplug(now + 2, 1).filterIsInstance<AlarmAction.Ring>().map { it.unplugSeq }
                }
            }
        }
        return rung
    }

    @Test
    fun L10_replay_equivalence() {
        for (seed in 1..300) {
            val rnd = Random(seed.toLong())
            val episodes = (1..6).map { Episode(it.toLong(), listOf(true, false, null)[rnd.nextInt(3)]) }
            val clean = run(episodes, null)
            assertEquals(episodes.filter { it.yes == true }.map { it.seq }, clean)
            assertEquals("seed $seed", clean, run(episodes, Random(seed.toLong() * 31)))
        }
    }

    @Test
    fun L10_unanswered_prompt_then_replug_rings_nothing() {
        assertFalse(policy().also { it.onUnplug(1) }.onReplug(5, 1).any { it is AlarmAction.Ring })
    }
}
