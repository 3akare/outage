package app.outage.home

import app.outage.onboarding.MiniJson
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** home-watch task 8: the viewer and station logic, against the shared fixture `core/shared/fixtures/home/home-response.json`. */
class HomeWatchTest {
    private val fixture = File("../../../core/shared/fixtures/home/home-response.json").readText()
    private val id = "kg4yq7mxwb2ndpr3tfhj5vcsaz"
    private val pairId = "AB" + "0123456789abcdef0123456789abcdef"

    @Suppress("UNCHECKED_CAST")
    private fun views(): List<HomeView> = (MiniJson.parse(fixture) as List<Map<String, Any?>>).map(HomeView::fromMap)

    private class FakeHttp(var answer: (String, String, String?) -> Pair<Int, String>?) : HomeHttp {
        val calls = mutableListOf<Triple<String, String, String?>>()
        override fun call(method: String, url: String, body: String?, headers: Map<String, String>): Pair<Int, String>? {
            calls += Triple(method, url, body)
            return answer(method, url, body)
        }
    }

    private fun model(http: FakeHttp, book: PairBook = MemoryPairBook(), now: Long = 1_800_000_000_000L, registered: Boolean = true) =
        HomeWatchModel(
            api = HomeApi("https://api.test", http),
            credentials = object : HomeCredentials {
                override fun installId() = if (registered) id else null
                override fun token() = if (registered) "tok" else null
            },
            book = book,
            cell = { "88754e64dffffff" },
            nowMs = { now },
            tzOffsetMin = { 60 },
        )

    @Test
    fun R4_2_fixture_states_map_to_the_spec_wording() {
        val lines = views().map { HomeWording.line(it, "Home") }
        assertEquals(HomeLine.PowerOn("Home", 1800000000000), lines[0])
        assertEquals(HomeLine.PowerOff("Home", 1800000100000), lines[1])
        assertEquals(HomeLine.Offline("Home", true, 1800000000000), lines[2])
        assertEquals(HomeLine.Waiting("Home"), lines[3])
    }

    @Test
    fun H1_R2_5_offline_is_never_shown_as_power_off() {
        val offline = views()[2].copy(lastKnownState = "OFF", lastKnownSinceMs = 5)
        val line = HomeWording.line(offline, "Home")
        assertTrue(line is HomeLine.Offline)
        assertEquals(false, (line as HomeLine.Offline).lastKnownOn)
    }

    @Test
    fun R4_4_cache_round_trips_through_json() {
        views().forEach { assertEquals(it, HomeView.parse(it.toJson())) }
        val pairs = listOf(LocalPair(pairId, "Mum \"flat\"", views()[0], 7L), LocalPair(pairId.replace('A', 'C'), "Home", null, null))
        assertEquals(pairs, PrefsPairBook.decode(PrefsPairBook.encode(pairs)))
    }

    @Test
    fun R1_4_claim_sends_the_normalized_code_and_no_push_token_and_stores_the_name_locally() {
        val http = FakeHttp { _, url, _ ->
            when {
                url.endsWith("/v1/pair/claim") -> 200 to "{\"pairId\":\"$pairId\"}"
                url.contains("/v1/home/") -> 200 to fixtureItem(0)
                else -> 500 to ""
            }
        }
        val book = MemoryPairBook()
        val m = model(http, book)
        m.claim("abcd-efgh 23", "Mum's flat")
        assertEquals(ClaimStatus.DONE, m.ui.claim)
        val body = http.calls.first().third!!
        assertTrue(body.contains("\"code\":\"ABCDEFGH23\""))
        assertTrue(body.contains("\"fcmToken\":\"none\""))
        assertFalse(body.contains("Mum")) // R7.6: the name stays on the phone
        assertEquals("Mum's flat", book.all().single().name)
        assertEquals(HomeLine.PowerOn("Mum's flat", 1800000000000), m.ui.cards.single().line)
    }

    @Test
    fun H5_R1_5_every_failed_claim_gives_the_same_answer() {
        val http = FakeHttp { _, _, _ -> 404 to "{\"error\":\"not_found\"}" }
        val m = model(http)
        m.claim("ABCDEFGH23", "Home")
        assertEquals(ClaimStatus.NOT_FOUND, m.ui.claim)
        m.claim("bad", "Home") // wrong shape: not even sent
        assertEquals(ClaimStatus.NOT_FOUND, m.ui.claim)
        assertEquals(1, http.calls.size)
        http.answer = { _, _, _ -> 409 to "" }
        m.claim("ABCDEFGH23", "Home")
        assertEquals(ClaimStatus.FULL, m.ui.claim)
        http.answer = { _, _, _ -> null }
        m.claim("ABCDEFGH23", "Home")
        assertEquals(ClaimStatus.FAILED, m.ui.claim)
        assertTrue(m.ui.cards.isEmpty())
    }

    @Test
    fun R4_4_a_failed_refresh_keeps_the_cached_state_and_marks_it_stale() {
        val book = MemoryPairBook().apply { put(LocalPair(pairId, "Home", views()[1], 1_799_999_000_000L)) }
        val m = model(FakeHttp { _, _, _ -> null }, book)
        m.refresh()
        val card = m.ui.cards.single()
        assertTrue(card.stale)
        assertEquals(HomeLine.PowerOff("Home", 1800000100000), card.line)
        assertEquals(1_799_999_000_000L, card.fetchedAtMs)
    }

    @Test
    fun R1_10_a_pair_removed_by_the_station_disappears_on_refresh() {
        val book = MemoryPairBook().apply { put(LocalPair(pairId, "Home", null, null)) }
        val m = model(FakeHttp { _, _, _ -> 404 to "" }, book)
        m.refresh()
        assertTrue(m.ui.cards.isEmpty())
    }

    @Test
    fun R1_10_viewer_remove_keeps_the_pair_when_the_server_is_unreachable() {
        val book = MemoryPairBook().apply { put(LocalPair(pairId, "Home", null, null)) }
        val http = FakeHttp { _, _, _ -> null }
        val m = model(http, book)
        assertFalse(m.removeViewerPair(pairId))
        assertEquals(1, book.all().size)
        http.answer = { _, _, _ -> 200 to "{\"removed\":true}" }
        assertTrue(m.removeViewerPair(pairId))
        assertTrue(book.all().isEmpty())
    }

    @Test
    fun R1_1_station_offer_shows_the_code_only_until_expiry_and_sends_the_cell() {
        var now = 1_800_000_000_000L
        val http = FakeHttp { _, _, _ -> 200 to "{\"code\":\"ABCDEFGH23\",\"expiresAtMs\":${now + 600_000}}" }
        val m = HomeWatchModel(HomeApi("https://api.test", http), object : HomeCredentials {
            override fun installId() = id
            override fun token() = "tok"
        }, MemoryPairBook(), { "88754e64dffffff" }, { now }, { 0 })
        m.requestOffer()
        assertEquals("ABCDEFGH23", m.offerShown())
        assertTrue(http.calls.single().third!!.contains("\"cell\":\"88754e64dffffff\""))
        now += 600_000
        assertNull(m.offerShown())
    }

    @Test
    fun R1_9_station_lists_every_pair_and_removes_a_dead_viewer() {
        val other = "CD" + "0123456789abcdef0123456789abcdef"
        val http = FakeHttp { _, url, _ ->
            if (url.endsWith("/v1/pair/list")) 200 to "{\"pairs\":[{\"pairId\":\"$pairId\",\"createdMs\":1},{\"pairId\":\"$other\",\"createdMs\":2}]}"
            else 200 to "{\"removed\":true}"
        }
        val m = model(http)
        m.loadStationPairs()
        assertEquals(listOf(StationPair(pairId, 1), StationPair(other, 2)), m.ui.stationPairs)
        assertTrue(m.removeStationPair(pairId))
        assertEquals(listOf(StationPair(other, 2)), m.ui.stationPairs)
    }

    @Test
    fun R9_without_registration_nothing_is_sent() {
        val http = FakeHttp { _, _, _ -> 200 to "" }
        val m = model(http, registered = false)
        m.claim("ABCDEFGH23", "Home")
        m.requestOffer()
        assertEquals(ClaimStatus.FAILED, m.ui.claim)
        assertTrue(m.ui.notRegistered)
        assertTrue(http.calls.isEmpty())
    }

    @Test
    fun H8_R7_4_delete_lists_the_viewer_pair_ids() {
        val book = MemoryPairBook().apply { put(LocalPair(pairId, "Home", null, null)) }
        assertEquals(listOf(pairId), model(FakeHttp { _, _, _ -> null }, book).pairIdsForDelete())
        var sent = ""
        val api = app.outage.net.IngestApi("https://api.test") { _, body, _ -> sent = body; 200 to "{}" }
        assertTrue(api.delete(id, "t", emptyList(), listOf(pairId)))
        assertTrue(sent.contains("\"pairIds\":[\"$pairId\"]"))
        assertFalse(api.delete(id, "t", emptyList(), listOf("\"x")))
    }

    private fun fixtureItem(i: Int): String = views()[i].toJson()
}
