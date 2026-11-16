package app.outage.map

import java.io.File

/** Map cache in two small files in the app's private directory: the JSON and its fetch time. */
class FileMapCache(private val dir: File) : MapCache {
    private val json get() = File(dir, "map-cache.json")
    private val stamp get() = File(dir, "map-cache.time")

    override fun read(): Pair<String, Long>? = try {
        if (json.isFile && stamp.isFile) json.readText() to stamp.readText().trim().toLong() else null
    } catch (_: Exception) {
        null
    }

    override fun write(json: String, fetchedMs: Long) {
        try {
            dir.mkdirs()
            this.json.writeText(json)
            stamp.writeText(fetchedMs.toString())
        } catch (_: Exception) {
            // A full disk must not crash the map.
        }
    }

    override fun clear() {
        json.delete()
        stamp.delete()
    }
}
