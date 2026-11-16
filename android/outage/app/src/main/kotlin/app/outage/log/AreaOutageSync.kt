package app.outage.log

import app.outage.onboarding.MiniJson
import java.io.File

/**
 * Public outages for the spot's cell (power-log R9, design section 7). Reads
 * `GET {baseUrl}/api/v1/public/cell/{cell}/outages?days=30` from the Worker (`web/routes.ts`), which
 * answers with an empty list when the spot has no public status (R9.2). Only the cell is sent (R9.3). The body is
 * cached in a file and used when offline (R9.4); the result replaces the cached `AREA_OUTAGE` inputs in the log.
 */
class AreaOutageSync(
    private val baseUrl: String,
    private val store: LogStore,
    private val cache: OutageCache,
    private val fetch: (String) -> String? = app.outage.map.MapHttp::get,
) {
    /** Call off the main thread. Returns the outages now in the log, from the network or the cache. */
    fun sync(cell: String, nowMs: Long): List<LogInput.AreaOutage> {
        if (baseUrl.isBlank() || !CELL.matches(cell)) return emptyList()
        val url = baseUrl.trimEnd('/') + "/api/v1/public/cell/" + cell + "/outages?days=" + DAYS
        val fresh = fetch(url)?.let { body -> parse(body)?.also { cache.write(cell, body) } }
        val outages = fresh ?: cache.read(cell)?.let { parse(it) } ?: return emptyList()
        store.replaceAreaOutages(nowMs - DAYS * DAY_MS, outages)
        return outages
    }

    companion object {
        const val DAYS = 30
        private const val DAY_MS = 86_400_000L
        private val CELL = Regex("^[0-9a-f]{15}$")
        private val LEVELS = setOf("POSSIBLE", "CONFIRMED")

        /** Parses the endpoint's body. Null on a bad body; an empty list when the spot is not public. */
        fun parse(body: String): List<LogInput.AreaOutage>? = try {
            @Suppress("UNCHECKED_CAST")
            val m = MiniJson.parse(body) as Map<String, Any?>
            (m["outages"] as List<Any?>).mapNotNull { o ->
                @Suppress("UNCHECKED_CAST")
                val r = o as Map<String, Any?>
                val level = r["level"] as? String
                val start = (r["startMs"] as? Double)?.toLong()
                if (level !in LEVELS || start == null) null
                else LogInput.AreaOutage(start, (r["endMs"] as? Double)?.toLong(), level!!)
            }
        } catch (_: Exception) {
            null
        }
    }
}

/** Last good response per cell. */
interface OutageCache {
    fun read(cell: String): String?
    fun write(cell: String, body: String)
    fun clear()
}

/** One file in the app's private directory, like the map cache (`map/FileMapCache.kt`). Keeps only the latest cell. */
class FileOutageCache(private val dir: File) : OutageCache {
    private val file get() = File(dir, "area-outages.json")
    private val cellFile get() = File(dir, "area-outages.cell")

    override fun read(cell: String): String? = try {
        if (cellFile.isFile && cellFile.readText().trim() == cell && file.isFile) file.readText() else null
    } catch (_: Exception) {
        null
    }

    override fun write(cell: String, body: String) {
        try {
            dir.mkdirs()
            file.writeText(body)
            cellFile.writeText(cell)
        } catch (_: Exception) {
            // A full disk must not break the log.
        }
    }

    override fun clear() {
        file.delete()
        cellFile.delete()
    }
}
