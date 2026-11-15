package app.outage.map

import java.net.HttpURLConnection
import java.net.URL

/** One GET to the Worker's public JSON. The only network call the map makes (R11.2). Returns null on any failure. */
object MapHttp {
    // https://developer.android.com/reference/java/net/HttpURLConnection (call off the main thread)
    fun get(url: String): String? = try {
        val c = URL(url).openConnection() as HttpURLConnection
        c.connectTimeout = 8_000
        c.readTimeout = 8_000
        c.setRequestProperty("Accept", "application/json")
        try {
            if (c.responseCode in 200..299) c.inputStream.bufferedReader().use { it.readText() } else null
        } finally {
            c.disconnect()
        }
    } catch (_: Exception) {
        null
    }
}
