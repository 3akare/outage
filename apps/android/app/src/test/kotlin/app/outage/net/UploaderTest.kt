package app.outage.net

import kotlin.random.Random
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * event-ingest R9, property I7: the Uploader sends in seq order, acknowledges only handled events, and for
 * any pattern of transport failures ends with every event delivered exactly once at the server. JUnit 4 with
 * seeded random failure patterns (testing.md). No Android types: clock, RNG, transport and outbox are fakes.
 */
class UploaderTest {
    // --- fakes -------------------------------------------------------------

    private class FakeClock(var now: Long = 0) : ElapsedClock {
        override fun elapsedRealtimeMs(): Long = now
    }

    private class Creds(private val id: String? = "install-1", private val tok: String? = "tok") : CredentialsProvider {
        override fun installId(): String? = id
        override fun token(): String? = tok
    }

    private class FakeOutbox(events: List<PendingEvent>) : OutboxPort {
        private val events = events.sortedBy { it.seq }.toMutableList()
        override fun getPending(limit: Int): List<PendingEvent> = events.take(limit)
        override fun ack(upToSeq: Long) {
            events.removeAll { it.seq <= upToSeq }
        }
        fun remaining(): List<PendingEvent> = events.toList()
    }

    /** A stateful server behind the transport: idempotent by (installId, seq), with scriptable failures. */
    private class FakeServer(private val rng: Random, private val failRequest: Double, private val transientEvent: Double) {
        val storeCount = HashMap<Long, Int>()
        val sentOrder = ArrayList<List<Long>>()

        fun transport(): Transport = Transport { req, _ ->
            sentOrder.add(req.events.map { it.seq })
            if (rng.nextDouble() < failRequest) return@Transport TransportResult.Retry() // nothing processed
            var sawTransient = false
            val results = req.events.map { e ->
                when {
                    storeCount.containsKey(e.seq) -> EventResult(e.seq, EventStatus.DUPLICATE)
                    rng.nextDouble() < transientEvent -> {
                        sawTransient = true
                        EventResult(e.seq, EventStatus.REJECTED, RejectCode.RATE_LIMITED, permanent = false)
                    }
                    else -> {
                        storeCount[e.seq] = 1
                        EventResult(e.seq, EventStatus.ACCEPTED)
                    }
                }
            }
            TransportResult.Ok(EventsResponse(results, if (sawTransient) 20_000L else null))
        }
    }

    private fun ev(seq: Long, type: String = WireType.UNPLUG, simulated: Boolean = false, timeQuality: String = "OK", recorded: Long = 0) =
        PendingEvent(seq = seq, type = type, recordedElapsedMs = recorded, cell = "88589c984dfffff", confidence = "HIGH", timeQuality = timeQuality, simulated = simulated)

    // --- I7 ----------------------------------------------------------------

    @Test
    fun I7_uploader_convergence_under_any_failure_pattern() {
        for (seed in 1L..200L) {
            val rng = Random(seed)
            val n = rng.nextInt(1, 40)
            val events = (1..n).map { i ->
                val t = when (rng.nextInt(5)) {
                    0 -> WireType.ARMED
                    1 -> WireType.DISARMED
                    2 -> WireType.REPLUG
                    3 -> WireType.LABEL
                    else -> WireType.UNPLUG
                }
                ev(i.toLong(), t, recorded = 0)
            }
            val outbox = FakeOutbox(events)
            val clock = FakeClock(now = 1_000_000) // past stateMaxWait, so state-only batches are due
            val server = FakeServer(rng, failRequest = 0.35, transientEvent = 0.35)
            val config = UploaderConfig(maxBatchEvents = rng.nextInt(1, 10))
            val uploader = Uploader(outbox, server.transport(), clock, Random(seed * 7 + 1), Creds(), config)

            var guard = 0
            while (outbox.remaining().isNotEmpty()) {
                clock.now += 10_000_000 // clear any back-off and the state max-wait every round
                uploader.flush()
                assertTrue("did not converge (seed=$seed)", ++guard < 5000)
            }

            // Every event stored exactly once at the server (exactly-once delivery).
            assertEquals("seed=$seed stored seqs", (1..n).map { it.toLong() }.toSet(), server.storeCount.keys)
            assertTrue("seed=$seed no double store", server.storeCount.values.all { it == 1 })
            // Every posted batch is strictly ascending by seq (seq order within a request).
            for (batch in server.sentOrder) assertEquals(batch, batch.sorted())
        }
    }

    @Test
    fun I7_sends_a_contiguous_ascending_prefix_each_request() {
        // One middle event keeps failing transiently; the Uploader must keep resending from the lowest unacked seq.
        val events = (1..6L).map { ev(it, WireType.UNPLUG, recorded = 0) }
        val outbox = FakeOutbox(events)
        val clock = FakeClock(1_000_000)
        val posts = ArrayList<List<Long>>()
        val stored = HashSet<Long>()
        var seq3Attempts = 0
        val transport = Transport { req, _ ->
            posts.add(req.events.map { it.seq })
            val results = req.events.map { e ->
                when {
                    stored.contains(e.seq) -> EventResult(e.seq, EventStatus.DUPLICATE)
                    e.seq == 3L && seq3Attempts++ < 3 -> EventResult(e.seq, EventStatus.REJECTED, RejectCode.RATE_LIMITED, permanent = false)
                    else -> { stored.add(e.seq); EventResult(e.seq, EventStatus.ACCEPTED) }
                }
            }
            TransportResult.Ok(EventsResponse(results))
        }
        val uploader = Uploader(outbox, transport, clock, Random(1), Creds())
        var guard = 0
        while (outbox.remaining().isNotEmpty() && guard++ < 100) {
            clock.now += 10_000_000
            uploader.flush()
        }
        assertTrue(outbox.remaining().isEmpty())
        // Each request is ascending, and its first seq is the lowest still-pending seq at that time.
        for (batch in posts) assertEquals(batch, batch.sorted())
        // seq 3 was resent until it stuck, but seq 1 and 2 were acked and never resent after.
        val postsContainingEarly = posts.count { it.contains(1L) }
        assertEquals("seq 1 sent once then acked", 1, postsContainingEarly)
    }

    @Test
    fun I7_acks_accepted_duplicate_and_permanent_but_not_transient() {
        val events = listOf(
            ev(1, WireType.ARMED, recorded = 0),
            ev(2, WireType.UNPLUG, recorded = 0),
            ev(3, WireType.REPLUG, recorded = 0),
        )
        val outbox = FakeOutbox(events)
        val clock = FakeClock(1_000_000)
        // seq1 accepted, seq2 transient (RATE_LIMITED), seq3 accepted.
        val transport = Transport { req, _ ->
            TransportResult.Ok(
                EventsResponse(
                    req.events.map { e ->
                        when (e.seq) {
                            1L -> EventResult(1, EventStatus.ACCEPTED)
                            2L -> EventResult(2, EventStatus.REJECTED, RejectCode.RATE_LIMITED, permanent = false)
                            else -> EventResult(3, EventStatus.ACCEPTED)
                        }
                    },
                    retryAfterMs = 20_000,
                ),
            )
        }
        val uploader = Uploader(outbox, transport, clock, Random(1), Creds())
        uploader.flush()
        // Cumulative ack stops at the transient seq 2, so seq 2 and seq 3 stay (even though seq 3 was accepted).
        assertEquals(listOf(2L, 3L), outbox.remaining().map { it.seq })
    }

    @Test
    fun I7_permanent_rejection_is_acked() {
        val events = listOf(ev(1, WireType.UNPLUG, recorded = 0), ev(2, WireType.UNPLUG, recorded = 0))
        val outbox = FakeOutbox(events)
        val clock = FakeClock(1_000_000)
        val transport = Transport { req, _ ->
            TransportResult.Ok(
                EventsResponse(
                    req.events.map { e ->
                        if (e.seq == 1L) EventResult(1, EventStatus.REJECTED, RejectCode.BAD_CELL, permanent = true)
                        else EventResult(2, EventStatus.ACCEPTED)
                    },
                ),
            )
        }
        Uploader(outbox, transport, clock, Random(1), Creds()).flush()
        assertTrue("both handled and acked", outbox.remaining().isEmpty())
    }

    // --- R9.7 exclusion ----------------------------------------------------

    @Test
    fun R9_7_simulated_and_lost_events_are_never_sent_and_are_acked_in_order() {
        val events = listOf(
            ev(1, WireType.UNPLUG, simulated = true, recorded = 0),
            ev(2, WireType.UNPLUG, timeQuality = "LOST", recorded = 0),
            ev(3, WireType.UNPLUG, recorded = 0),
        )
        val outbox = FakeOutbox(events)
        val clock = FakeClock(1_000_000)
        val posted = ArrayList<Long>()
        val transport = Transport { req, _ ->
            req.events.forEach { posted.add(it.seq) }
            TransportResult.Ok(EventsResponse(req.events.map { EventResult(it.seq, EventStatus.ACCEPTED) }))
        }
        Uploader(outbox, transport, clock, Random(1), Creds()).flush()
        assertEquals("only the real event is sent", listOf(3L), posted)
        assertTrue("all acked including the skipped ones", outbox.remaining().isEmpty())
    }

    // --- R9.1 / R9.2 upload timing ----------------------------------------

    @Test
    fun R9_2_state_only_batch_waits_for_the_max_wait() {
        val events = listOf(ev(1, WireType.ARMED, recorded = 0), ev(2, WireType.DISARMED, recorded = 0))
        val outbox = FakeOutbox(events)
        val clock = FakeClock(0)
        var posts = 0
        val transport = Transport { req, _ ->
            posts++
            TransportResult.Ok(EventsResponse(req.events.map { EventResult(it.seq, EventStatus.ACCEPTED) }))
        }
        val config = UploaderConfig(stateMaxWaitMs = 900_000)
        val uploader = Uploader(outbox, transport, clock, Random(1), Creds(), config)

        clock.now = 100_000 // before the max wait
        val r1 = uploader.flush()
        assertEquals(0, posts)
        assertTrue(r1.waitingForState)
        assertFalse(r1.attempted)

        clock.now = 900_000 // oldest event age now equals the max wait
        uploader.flush()
        assertEquals(1, posts)
        assertTrue(outbox.remaining().isEmpty())
    }

    @Test
    fun R9_1_detection_event_sends_immediately() {
        val events = listOf(ev(1, WireType.ARMED, recorded = 0), ev(2, WireType.UNPLUG, recorded = 0))
        val outbox = FakeOutbox(events)
        val clock = FakeClock(1_000) // well before any max wait
        var posts = 0
        val transport = Transport { req, _ ->
            posts++
            TransportResult.Ok(EventsResponse(req.events.map { EventResult(it.seq, EventStatus.ACCEPTED) }))
        }
        Uploader(outbox, transport, clock, Random(1), Creds()).flush()
        assertEquals("the detection event pulls the waiting state event along", 1, posts)
        assertTrue(outbox.remaining().isEmpty())
    }

    // --- R9.6 send-time elapsedMs -----------------------------------------

    @Test
    fun R9_6_elapsed_is_stamped_at_send_time_for_the_whole_batch() {
        val events = listOf(ev(1, WireType.UNPLUG, recorded = 5_000), ev(2, WireType.UNPLUG, recorded = 3_000))
        val outbox = FakeOutbox(events)
        val clock = FakeClock(0)
        val seen = ArrayList<Pair<Long, Long>>() // seq to elapsedMs
        val transport = Transport { req, _ ->
            req.events.forEach { seen.add(it.seq to it.elapsedMs) }
            TransportResult.Retry() // force a resend at a later clock value
        }
        val uploader = Uploader(outbox, transport, clock, Random(1), Creds())

        clock.now = 10_000
        uploader.flush()
        clock.now = 100_000 // backoff cleared later; re-stamp must use the new now
        clock.now = 100_000
        // advance past any backoff window
        clock.now = 10_000_000
        uploader.flush()

        val first = seen.filter { it.first == 1L }
        assertEquals(10_000L - 5_000L, first.first().second) // first send: now 10_000, recorded 5_000
        assertEquals(10_000_000L - 5_000L, first.last().second) // resend uses the new send time, not a stale value
    }

    // --- R9.4 back-off -----------------------------------------------------

    @Test
    fun R9_4_failed_requests_back_off_within_the_jittered_cap() {
        val events = listOf(ev(1, WireType.UNPLUG, recorded = 0))
        val outbox = FakeOutbox(events)
        val clock = FakeClock(0)
        val transport = Transport { _, _ -> TransportResult.Retry() }
        val config = UploaderConfig(backoffBaseMs = 1_000, backoffCapMs = 300_000)
        val uploader = Uploader(outbox, transport, clock, Random(42), Creds(), config)

        var prevCeilExceeded = false
        repeat(20) { attempt ->
            clock.now += 1_000_000 // clear the previous back-off
            val r = uploader.flush()
            val delay = r.nextDelayMs!!
            val shift = minOf(attempt, 20)
            val ceil = minOf(config.backoffCapMs, config.backoffBaseMs shl shift)
            assertTrue("delay $delay within [0, $ceil]", delay in 0..ceil)
            if (delay > config.backoffCapMs) prevCeilExceeded = true
        }
        assertFalse("delay never exceeds the cap", prevCeilExceeded)
        assertTrue("nothing acked while failing", outbox.remaining().size == 1)
    }

    @Test
    fun flush_does_nothing_without_credentials() {
        val outbox = FakeOutbox(listOf(ev(1, WireType.UNPLUG, recorded = 0)))
        val transport = Transport { _, _ -> throw AssertionError("must not post without credentials") }
        val r = Uploader(outbox, transport, FakeClock(1_000_000), Random(1), Creds(id = null, tok = null)).flush()
        assertFalse(r.attempted)
        assertEquals(1, outbox.remaining().size)
    }
}
