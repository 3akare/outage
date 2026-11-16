package app.outage.home

/** The install's credentials for the Worker. Null until the phone has registered (event-ingest R2). */
interface HomeCredentials {
    fun installId(): String?
    fun token(): String?
}

/** One viewer card (R4.1 to R4.4). [stale] is true when the last refresh failed and [line] comes from the cache. */
data class HomeCard(val pairId: String, val name: String, val line: HomeLine?, val fetchedAtMs: Long?, val stale: Boolean)

data class StationPair(val pairId: String, val createdMs: Long)

enum class ClaimStatus { IDLE, BUSY, DONE, NOT_FOUND, FULL, FAILED }

enum class StationStatus { IDLE, BUSY, FULL, FAILED }

data class HomeWatchUi(
    /** No Worker address in this build (ADR 0024): pairing needs the server, so the screens say so. */
    val noServer: Boolean,
    /** The phone has not registered with the Worker yet (it does after first run, once online). */
    val notRegistered: Boolean,
    val cards: List<HomeCard>,
    val claim: ClaimStatus,
    val offerCode: String?,
    val offerExpiresAtMs: Long?,
    val station: StationStatus,
    /** Null until loaded; the station lists every pair so it can remove a dead viewer (ADR 0009 review). */
    val stationPairs: List<StationPair>?,
) {
    companion object {
        val Initial = HomeWatchUi(false, false, emptyList(), ClaimStatus.IDLE, null, null, StationStatus.IDLE, null)
    }
}

/**
 * The Home Watch screens' logic (home-watch task 8). Plain Kotlin and blocking, so JUnit runs it; the ViewModel calls it
 * off the main thread. The phone shows the Worker's state and never derives one (R2).
 */
class HomeWatchModel(
    private val api: HomeApi?,
    private val credentials: HomeCredentials,
    private val book: PairBook,
    private val cell: () -> String?,
    private val nowMs: () -> Long,
    private val tzOffsetMin: () -> Int,
) {
    @Volatile
    var ui: HomeWatchUi = HomeWatchUi.Initial.copy(noServer = api == null, cards = cards(failedIds = emptySet()))
        private set

    private fun creds(): Pair<String, String>? {
        val id = credentials.installId()
        val token = credentials.token()
        return if (id == null || token == null) null else id to token
    }

    private fun cards(failedIds: Set<String>): List<HomeCard> = book.all().map { p ->
        HomeCard(p.pairId, p.name, p.cached?.let { HomeWording.line(it, p.name) }, p.fetchedAtMs, p.pairId in failedIds)
    }

    private fun publish(update: (HomeWatchUi) -> HomeWatchUi) {
        ui = update(ui).copy(noServer = api == null, notRegistered = api != null && creds() == null)
    }

    /** R4.3: on open and while shown. Failed reads keep the cached state and mark it stale with its age (R4.4). */
    fun refresh() {
        val c = creds()
        val failed = HashSet<String>()
        if (api != null && c != null) {
            for (p in book.all()) {
                when (val r = api.home(c.first, c.second, p.pairId)) {
                    is HomeFetch.Ok -> book.put(p.copy(cached = r.view, fetchedAtMs = nowMs()))
                    HomeFetch.Gone -> book.remove(p.pairId) // the station removed this pair
                    HomeFetch.Failed -> failed += p.pairId
                }
            }
        } else {
            book.all().forEach { failed += it.pairId }
        }
        publish { it.copy(cards = cards(failed)) }
    }

    /** Viewer: enter the code shown on the station (R1.4, R1.8). The name stays on this phone (R7.6). */
    fun claim(typed: String, name: String) {
        val c = creds()
        if (api == null || c == null) {
            publish { it.copy(claim = ClaimStatus.FAILED) }
            return
        }
        publish { it.copy(claim = ClaimStatus.BUSY) }
        val status = when (val r = api.claim(c.first, c.second, typed, tzOffsetMin())) {
            is ClaimOutcome.Ok -> {
                book.put(LocalPair(r.pairId, name.trim().take(MAX_NAME).ifEmpty { HomeWording.DEFAULT_NAME }, null, null))
                ClaimStatus.DONE
            }
            ClaimOutcome.NotFound -> ClaimStatus.NOT_FOUND
            ClaimOutcome.Full -> ClaimStatus.FULL
            ClaimOutcome.Failed -> ClaimStatus.FAILED
        }
        publish { it.copy(claim = status, cards = cards(emptySet())) }
        if (status == ClaimStatus.DONE) refresh()
    }

    fun resetClaim() = publish { it.copy(claim = ClaimStatus.IDLE) }

    /** Viewer side remove (R1.10). Kept on the phone when the server could not be reached, so it can be retried. */
    fun removeViewerPair(pairId: String): Boolean {
        val c = creds() ?: return false
        if (api == null || !api.remove(c.first, c.second, pairId)) return false
        book.remove(pairId)
        publish { it.copy(cards = cards(emptySet())) }
        return true
    }

    /** Station: "Pair with my phone" (R1.1). The cell goes to the Worker only, so it can watch the station's events. */
    fun requestOffer() {
        val c = creds()
        if (api == null || c == null) {
            publish { it.copy(station = StationStatus.FAILED) }
            return
        }
        publish { it.copy(station = StationStatus.BUSY) }
        when (val r = api.offer(c.first, c.second, cell())) {
            is OfferOutcome.Ok -> publish { it.copy(station = StationStatus.IDLE, offerCode = r.code, offerExpiresAtMs = r.expiresAtMs) }
            OfferOutcome.Full -> publish { it.copy(station = StationStatus.FULL, offerCode = null, offerExpiresAtMs = null) }
            OfferOutcome.Failed -> publish { it.copy(station = StationStatus.FAILED) }
        }
    }

    /** The code is shown only while it is valid (R1.2). */
    fun offerShown(): String? {
        val exp = ui.offerExpiresAtMs ?: return null
        return if (nowMs() < exp) ui.offerCode else null
    }

    fun loadStationPairs() {
        val c = creds() ?: return
        val list = api?.stationPairs(c.first, c.second) ?: return
        publish { it.copy(stationPairs = list.map { (id, at) -> StationPair(id, at) }) }
    }

    /** Station side remove (R1.10, ADR 0009 review): frees the seat of a dead viewer. */
    fun removeStationPair(pairId: String): Boolean {
        val c = creds() ?: return false
        if (api == null || !api.remove(c.first, c.second, pairId)) return false
        publish { s -> s.copy(stationPairs = s.stationPairs?.filterNot { it.pairId == pairId }) }
        return true
    }

    /** Pair ids for delete-my-data, so the Worker cleans the shards of this viewer's pairs (home-watch R7.4). */
    fun pairIdsForDelete(): List<String> = book.all().map { it.pairId }.take(MAX_DELETE_IDS)

    companion object {
        const val MAX_NAME = 40
        const val MAX_DELETE_IDS = 25
        const val MAX_VIEWER_PAIRS = 5
    }
}
