package app.outage.map

/** What the Area screen shows: the map, the user's own cell if known, and when the data was fetched. */
data class MapLoad(val map: AreaMap, val spotCellId: String?, val fetchedMs: Long, val fromCache: Boolean)

sealed interface MapResult {
    data class Loaded(val load: MapLoad) : MapResult
    data object Empty : MapResult
}

/** One interface for demo data and the Worker's public JSON (design section 3), so the screen never knows which it has. */
interface AreaMapSource {
    suspend fun load(city: String, nowMs: Long): MapResult
}

/** Last good map JSON and when it was fetched (R4.1). Delete-my-data calls [clear] (R11.4). */
interface MapCache {
    fun read(): Pair<String, Long>?
    fun write(json: String, fetchedMs: Long)
    fun clear()
}

/**
 * Labelled sample map for demo and judges (R5). Never touches the cache (AM6). It has no spot until the person chooses a place,
 * like the website. [data] reads the bundled Lagos files; when they cannot be read the result is [MapResult.Empty].
 */
class DemoAreaMapSource(private val data: () -> LagosDemoData?) : AreaMapSource {
    override suspend fun load(city: String, nowMs: Long): MapResult {
        val d = data() ?: return MapResult.Empty
        return MapResult.Loaded(MapLoad(DemoAreaMap.build(nowMs, d), spotCellId = null, fetchedMs = nowMs, fromCache = false))
    }
}

/**
 * Reads `GET {baseUrl}/api/map.json?city=...` from the Worker (R4). [fetch] returns the body or null on any failure,
 * so this class has no Android or network imports. A good non-simulated map is cached; a simulated one never is (AM6, R5.2).
 * On failure it falls back to the cache, then to [MapResult.Empty]. The spot is unknown here until the sensor feature reports it.
 */
class NetAreaMapSource(
    private val baseUrl: String,
    private val cache: MapCache,
    private val fetch: suspend (url: String) -> String?,
) : AreaMapSource {
    override suspend fun load(city: String, nowMs: Long): MapResult {
        val url = baseUrl.trimEnd('/') + "/api/map.json?city=" + java.net.URLEncoder.encode(city, "UTF-8")
        val body = try { fetch(url) } catch (_: Exception) { null }
        val fresh = body?.let { AreaMapParser.parseOrNull(it) }
        if (fresh != null && body != null) {
            if (!fresh.simulated) cache.write(body, nowMs)
            return MapResult.Loaded(MapLoad(fresh, null, nowMs, fromCache = false))
        }
        val cached = cache.read() ?: return MapResult.Empty
        val map = AreaMapParser.parseOrNull(cached.first) ?: return MapResult.Empty
        return MapResult.Loaded(MapLoad(map, null, cached.second, fromCache = true))
    }
}

object AreaMapSources {
    /** Demo until a Worker address is set at build time (`-PoutageApiBase=https://...`). */
    fun choose(apiBase: String, cache: MapCache, demoData: () -> LagosDemoData? = { null }, fetch: suspend (String) -> String?): AreaMapSource =
        if (apiBase.isBlank()) DemoAreaMapSource(demoData) else NetAreaMapSource(apiBase, cache, fetch)
}
