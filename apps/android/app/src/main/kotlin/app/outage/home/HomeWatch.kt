package app.outage.home

import app.outage.onboarding.MiniJson

/**
 * Home Watch on the phone (home-watch task 8). No Android imports: the JUnit tests drive it with fake HTTP and a fake store.
 * The phone never computes the station state; it shows what `GET /v1/home/:pairId` answers (home-watch R2, R4).
 */

/** The answer of `GET /v1/home/:pairId` (`packages/shared/fixtures/home/home-response.json`). */
data class HomeView(
    val status: String,
    val sinceMs: Long?,
    val lastKnownState: String?,
    val lastKnownSinceMs: Long?,
    val lastSeenMs: Long?,
    val stationName: String?,
    val asOfMs: Long,
) {
    companion object {
        private val STATES = setOf("ON", "OFF", "OFFLINE", "UNKNOWN")

        @Suppress("UNCHECKED_CAST")
        fun fromMap(m: Map<String, Any?>): HomeView {
            val status = m["status"] as? String ?: throw IllegalArgumentException("status")
            require(status in STATES) { "status" }
            val known = m["lastKnown"] as? Map<String, Any?>
            return HomeView(
                status = status,
                sinceMs = (m["sinceMs"] as? Number)?.toLong(),
                lastKnownState = known?.get("state") as? String,
                lastKnownSinceMs = (known?.get("sinceMs") as? Number)?.toLong(),
                lastSeenMs = (m["lastSeenMs"] as? Number)?.toLong(),
                stationName = m["stationName"] as? String,
                asOfMs = (m["asOfMs"] as? Number)?.toLong() ?: throw IllegalArgumentException("asOfMs"),
            )
        }

        @Suppress("UNCHECKED_CAST")
        fun parse(text: String): HomeView = fromMap(MiniJson.parse(text) as Map<String, Any?>)
    }

    /** For the local cache (R4.4). Same shape as the server's answer, so [parse] reads it back. */
    fun toJson(): String = buildString {
        append("{\"status\":").append(Json.q(status))
        append(",\"sinceMs\":").append(sinceMs ?: "null")
        append(",\"lastKnown\":")
        if (lastKnownState == null) append("null") else append("{\"state\":").append(Json.q(lastKnownState)).append(",\"sinceMs\":").append(lastKnownSinceMs ?: "null").append('}')
        append(",\"lastSeenMs\":").append(lastSeenMs ?: "null")
        append(",\"stationName\":").append(stationName?.let(Json::q) ?: "null")
        append(",\"asOfMs\":").append(asOfMs).append('}')
    }
}

/** Plain JSON string quoting for the few bodies the app writes. */
internal object Json {
    fun q(s: String): String = buildString {
        append('"')
        for (c in s) when {
            c == '"' -> append("\\\"")
            c == '\\' -> append("\\\\")
            c < ' ' -> append(String.format("\\u%04x", c.code))
            else -> append(c)
        }
        append('"')
    }
}

/** What the card says (R4.2). The words live in string resources; this is the choice between them. */
sealed interface HomeLine {
    /** "Home: power on since 2:14 p.m." */
    data class PowerOn(val name: String, val sinceMs: Long) : HomeLine
    /** "Home: power off since 2:14 p.m." */
    data class PowerOff(val name: String, val sinceMs: Long) : HomeLine
    /** "Station offline" and, when known, "Last known: power on since 2:14 p.m." Silence is never shown as off (R2.5). */
    data class Offline(val name: String, val lastKnownOn: Boolean?, val lastKnownSinceMs: Long?) : HomeLine
    /** Paired, but the station has not reported yet. */
    data class Waiting(val name: String) : HomeLine
}

object HomeWording {
    const val DEFAULT_NAME = "Home"

    fun line(view: HomeView, name: String): HomeLine = when (view.status) {
        "ON" -> view.sinceMs?.let { HomeLine.PowerOn(name, it) } ?: HomeLine.Waiting(name)
        "OFF" -> view.sinceMs?.let { HomeLine.PowerOff(name, it) } ?: HomeLine.Waiting(name)
        "OFFLINE" -> HomeLine.Offline(
            name,
            when (view.lastKnownState) {
                "ON" -> true
                "OFF" -> false
                else -> null
            },
            view.lastKnownSinceMs,
        )
        else -> HomeLine.Waiting(name)
    }
}

/** One pair kept on the viewer phone. The name stays here unless the viewer syncs it (R7.6). */
data class LocalPair(val pairId: String, val name: String, val cached: HomeView?, val fetchedAtMs: Long?)

/** The viewer's pair list on the phone. */
interface PairBook {
    fun all(): List<LocalPair>
    fun put(pair: LocalPair)
    fun remove(pairId: String)
    fun clear()
}

class MemoryPairBook : PairBook {
    private val items = LinkedHashMap<String, LocalPair>()
    override fun all() = items.values.toList()
    override fun put(pair: LocalPair) { items[pair.pairId] = pair }
    override fun remove(pairId: String) { items.remove(pairId) }
    override fun clear() = items.clear()
}

/** A blocking HTTP call to the project's Worker. Returns status and body, or null when the network failed. */
fun interface HomeHttp {
    fun call(method: String, url: String, body: String?, headers: Map<String, String>): Pair<Int, String>?
}

sealed interface OfferOutcome {
    data class Ok(val code: String, val expiresAtMs: Long) : OfferOutcome
    /** 409: this station already has 5 viewers (R1.9). */
    data object Full : OfferOutcome
    data object Failed : OfferOutcome
}

sealed interface ClaimOutcome {
    data class Ok(val pairId: String) : ClaimOutcome
    /** The one answer for a wrong, used, expired or burned code (R1.5). */
    data object NotFound : ClaimOutcome
    data object Full : ClaimOutcome
    data object Failed : ClaimOutcome
}

/**
 * The pairing and viewer calls (home-watch design 3, Worker `workers/api/src/ingest/handlers.ts`). Station events go
 * through the normal upload path; nothing here sends events.
 */
class HomeApi(private val base: String, private val http: HomeHttp) {
    private fun url(path: String) = base.trimEnd('/') + path
    private fun auth(token: String) = mapOf("Authorization" to "Bearer $token", "Content-Type" to "application/json")

    fun offer(installId: String, token: String, cell: String?): OfferOutcome {
        if (!INSTALL_ID.matches(installId)) return OfferOutcome.Failed
        val body = "{\"installId\":${Json.q(installId)}" + (if (cell != null && CELL.matches(cell)) ",\"cell\":${Json.q(cell)}" else "") + "}"
        val (code, text) = http.call("POST", url("/v1/pair/offer"), body, auth(token)) ?: return OfferOutcome.Failed
        if (code == 409) return OfferOutcome.Full
        if (code != 200) return OfferOutcome.Failed
        val m = obj(text) ?: return OfferOutcome.Failed
        val c = m["code"] as? String ?: return OfferOutcome.Failed
        val exp = (m["expiresAtMs"] as? Number)?.toLong() ?: return OfferOutcome.Failed
        return OfferOutcome.Ok(c, exp)
    }

    /** No Firebase Messaging in the app yet, so the claim sends [NO_PUSH_TOKEN] and the viewer polls (ADR 0037). */
    fun claim(installId: String, token: String, typed: String, tzOffsetMin: Int): ClaimOutcome {
        val code = normalize(typed)
        if (!INSTALL_ID.matches(installId)) return ClaimOutcome.Failed
        if (!CODE.matches(code)) return ClaimOutcome.NotFound
        val body = "{\"installId\":${Json.q(installId)},\"code\":${Json.q(code)},\"fcmToken\":${Json.q(NO_PUSH_TOKEN)}," +
            "\"quietStartMin\":0,\"quietEndMin\":0,\"tzOffsetMin\":${tzOffsetMin.coerceIn(-840, 840)}}"
        val (status, text) = http.call("POST", url("/v1/pair/claim"), body, auth(token)) ?: return ClaimOutcome.Failed
        return when (status) {
            200 -> (obj(text)?.get("pairId") as? String)?.takeIf { PAIR_ID.matches(it) }?.let { ClaimOutcome.Ok(it) } ?: ClaimOutcome.Failed
            404 -> ClaimOutcome.NotFound
            409 -> ClaimOutcome.Full
            else -> ClaimOutcome.Failed
        }
    }

    /** True when the server no longer has the pair (removed now, or already gone: 404). */
    fun remove(installId: String, token: String, pairId: String): Boolean {
        if (!INSTALL_ID.matches(installId) || !PAIR_ID.matches(pairId)) return false
        val body = "{\"installId\":${Json.q(installId)},\"pairId\":${Json.q(pairId)}}"
        val (code, _) = http.call("POST", url("/v1/pair/remove"), body, auth(token)) ?: return false
        return code == 200 || code == 404
    }

    /** The station's own pairs (ADR 0037): id and creation time. Null on any failure. */
    fun stationPairs(installId: String, token: String): List<Pair<String, Long>>? {
        if (!INSTALL_ID.matches(installId)) return null
        val (code, text) = http.call("POST", url("/v1/pair/list"), "{\"installId\":${Json.q(installId)}}", auth(token)) ?: return null
        if (code != 200) return null
        val list = obj(text)?.get("pairs") as? List<*> ?: return null
        return list.mapNotNull { item ->
            val m = item as? Map<*, *> ?: return@mapNotNull null
            val id = m["pairId"] as? String ?: return@mapNotNull null
            val at = (m["createdMs"] as? Number)?.toLong() ?: return@mapNotNull null
            if (PAIR_ID.matches(id)) id to at else null
        }
    }

    /** `GET /v1/home/:pairId`. [HomeFetch.Gone] for 404 (the pair was removed by the station). */
    fun home(installId: String, token: String, pairId: String): HomeFetch {
        if (!INSTALL_ID.matches(installId) || !PAIR_ID.matches(pairId)) return HomeFetch.Failed
        val headers = mapOf("Authorization" to "Bearer $token", "X-Install-Id" to installId)
        val (code, text) = http.call("GET", url("/v1/home/$pairId"), null, headers) ?: return HomeFetch.Failed
        if (code == 404) return HomeFetch.Gone
        if (code != 200) return HomeFetch.Failed
        return runCatching { HomeFetch.Ok(HomeView.parse(text)) }.getOrElse { HomeFetch.Failed }
    }

    @Suppress("UNCHECKED_CAST")
    private fun obj(text: String) = runCatching { MiniJson.parse(text) as Map<String, Any?> }.getOrNull()

    companion object {
        /** Same value as `NO_PUSH_TOKEN` in `packages/shared/src/pairing.ts`. */
        const val NO_PUSH_TOKEN = "none"
        const val ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ"
        private val INSTALL_ID = Regex("^[a-z2-7]{26}$")
        private val CELL = Regex("^[0-9a-f]{15}$")
        private val CODE = Regex("^[$ALPHABET]{10}$")
        val PAIR_ID = Regex("^[$ALPHABET]{2}[0-9a-f]{32}$")

        /** Like `normalizeCode` in `packages/shared`: upper case, spaces and hyphens removed. */
        fun normalize(typed: String): String = typed.uppercase().replace(Regex("[\\s-]"), "")
    }
}

sealed interface HomeFetch {
    data class Ok(val view: HomeView) : HomeFetch
    data object Gone : HomeFetch
    data object Failed : HomeFetch
}
