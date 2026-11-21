package app.outage.net

import app.outage.onboarding.MiniJson
import java.net.HttpURLConnection
import java.net.URL

/** The answer of `POST /v1/register` (event-ingest R2.1): an install ID and its token. */
data class Registration(val installId: String, val token: String)

/** A tiny blocking HTTP client for the project's own Worker. Off the main thread only. */
fun interface HttpPost {
    /** Returns the status code and body, or null when the network failed. */
    fun post(url: String, body: String, token: String?): Pair<Int, String>?
}

/** `HttpURLConnection`, no extra library (ADR 0012). https://developer.android.com/reference/java/net/HttpURLConnection */
object UrlConnectionPost : HttpPost {
    override fun post(url: String, body: String, token: String?): Pair<Int, String>? = try {
        val c = URL(url).openConnection() as HttpURLConnection
        try {
            c.requestMethod = "POST"
            c.connectTimeout = 10_000
            c.readTimeout = 15_000
            c.doOutput = true
            c.setRequestProperty("Content-Type", "application/json")
            c.setRequestProperty("Accept", "application/json")
            if (token != null) c.setRequestProperty("Authorization", "Bearer $token")
            c.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
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

/**
 * The ingest calls (event-ingest design section 5): register, events, delete. Pure over [HttpPost], so JUnit drives it.
 * `base` is `BuildConfig.API_BASE` (ADR 0024).
 */
class IngestApi(private val base: String, private val http: HttpPost) : Transport {
    private fun url(path: String) = base.trimEnd('/') + path

    fun register(): Registration? {
        val (code, body) = http.post(url("/v1/register"), "{}", null) ?: return null
        if (code != 200) return null
        @Suppress("UNCHECKED_CAST")
        val m = runCatching { MiniJson.parse(body) as Map<String, Any?> }.getOrNull() ?: return null
        val id = m["installId"] as? String ?: return null
        val token = m["token"] as? String ?: return null
        return Registration(id, token)
    }

    /** 2xx with results is Ok; 429 and 5xx retry with the server hint; other 4xx retry with back-off. */
    override fun post(request: EventsRequest, token: String): TransportResult {
        val (code, body) = http.post(url("/v1/events"), WireJson.encodeRequest(request), token) ?: return TransportResult.Retry()
        if (code in 200..299) {
            return runCatching { TransportResult.Ok(WireJson.decodeResponse(body)) }.getOrElse { TransportResult.Retry() }
        }
        return TransportResult.Retry(retryAfter(body))
    }

    private fun retryAfter(body: String): Long? = runCatching {
        @Suppress("UNCHECKED_CAST")
        ((MiniJson.parse(body) as Map<String, Any?>)["retryAfterMs"] as? Number)?.toLong()
    }.getOrNull()

    /** `POST /v1/delete` (event-ingest R12). True only on a confirmed delete. */
    fun delete(installId: String, token: String, cells: List<String>): Boolean {
        // All are fixed-format identifiers; anything else is refused rather than escaped.
        if (!INSTALL_ID.matches(installId) || cells.any { !CELL.matches(it) }) return false
        val json = buildString {
            append("{\"installId\":\"").append(installId).append("\",\"cells\":[")
            cells.forEachIndexed { i, c -> if (i > 0) append(','); append('"').append(c).append('"') }
            append("]}")
        }
        val (code, _) = http.post(url("/v1/delete"), json, token) ?: return false
        return code == 200
    }

    /**
     * `POST /v1/telemetry` (field-telemetry R3.1). [Sent] on 2xx, [Dropped] when the Worker will never accept this body
     * (400, 413, 401, 403: retrying cannot help), [Retry] for a network failure, 429 and 5xx.
     */
    fun postTelemetry(deviceDayJson: String, token: String): TelemetryResult {
        val (code, _) = http.post(url("/v1/telemetry"), deviceDayJson, token) ?: return TelemetryResult.Retry
        return when {
            code in 200..299 -> TelemetryResult.Sent
            code == 429 || code >= 500 -> TelemetryResult.Retry
            else -> TelemetryResult.Dropped
        }
    }

    companion object {
        private val INSTALL_ID = Regex("^[a-z2-7]{26}$")
        private val CELL = Regex("^[0-9a-f]{15}$")
    }
}

enum class TelemetryResult { Sent, Dropped, Retry }
