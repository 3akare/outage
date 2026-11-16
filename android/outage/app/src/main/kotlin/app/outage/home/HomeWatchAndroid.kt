package app.outage.home

import android.content.Context
import app.outage.onboarding.MiniJson
import java.net.HttpURLConnection
import java.net.URL

/** The viewer's pairs in SharedPreferences, one JSON array. Cleared by delete-my-data. */
class PrefsPairBook(context: Context) : PairBook {
    private val prefs = context.applicationContext.getSharedPreferences("home_watch", Context.MODE_PRIVATE)

    @Synchronized
    override fun all(): List<LocalPair> = decode(prefs.getString(KEY, null))

    @Synchronized
    override fun put(pair: LocalPair) {
        val list = all().filterNot { it.pairId == pair.pairId } + pair
        prefs.edit().putString(KEY, encode(list)).apply()
    }

    @Synchronized
    override fun remove(pairId: String) {
        prefs.edit().putString(KEY, encode(all().filterNot { it.pairId == pairId })).apply()
    }

    @Synchronized
    override fun clear() {
        prefs.edit().clear().apply()
    }

    companion object {
        private const val KEY = "pairs"

        fun encode(list: List<LocalPair>): String = list.joinToString(",", "[", "]") { p ->
            "{\"pairId\":${Json.q(p.pairId)},\"name\":${Json.q(p.name)},\"cached\":${p.cached?.toJson() ?: "null"},\"fetchedAtMs\":${p.fetchedAtMs ?: "null"}}"
        }

        @Suppress("UNCHECKED_CAST")
        fun decode(text: String?): List<LocalPair> {
            if (text == null) return emptyList()
            val arr = runCatching { MiniJson.parse(text) as List<Any?> }.getOrNull() ?: return emptyList()
            return arr.mapNotNull { item ->
                val m = item as? Map<String, Any?> ?: return@mapNotNull null
                val id = m["pairId"] as? String ?: return@mapNotNull null
                val name = m["name"] as? String ?: HomeWording.DEFAULT_NAME
                val cached = (m["cached"] as? Map<String, Any?>)?.let { runCatching { HomeView.fromMap(it) }.getOrNull() }
                LocalPair(id, name, cached, (m["fetchedAtMs"] as? Number)?.toLong())
            }
        }
    }
}

/** `HttpURLConnection`, no extra library (ADR 0012). https://developer.android.com/reference/java/net/HttpURLConnection */
object UrlConnectionHomeHttp : HomeHttp {
    override fun call(method: String, url: String, body: String?, headers: Map<String, String>): Pair<Int, String>? = try {
        val c = URL(url).openConnection() as HttpURLConnection
        try {
            c.requestMethod = method
            c.connectTimeout = 10_000
            c.readTimeout = 15_000
            c.setRequestProperty("Accept", "application/json")
            headers.forEach { (k, v) -> c.setRequestProperty(k, v) }
            if (body != null) {
                c.doOutput = true
                c.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            }
            val code = c.responseCode
            val stream = if (code in 200..299) c.inputStream else c.errorStream
            code to (stream?.bufferedReader()?.use { it.readText() } ?: "")
        } finally {
            c.disconnect()
        }
    } catch (_: Exception) {
        null
    }
}
