package app.outage.probe

import android.content.Context
import android.os.SystemClock
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/**
 * R3: batch upload to the probe Worker on a background thread. A batch is marked uploaded only after a 200, so
 * nothing is lost when the network is down (R3.4). Each attempt logs an UPLOAD row (M13: duration and network).
 */
object Uploader {
    private val worker = Executors.newSingleThreadExecutor()

    fun uploadNow(ctx: Context, done: (String) -> Unit) = worker.execute {
        val app = ctx.applicationContext
        val prefs = Prefs(app)
        val log = ProbeLog.get(app)
        if (!Contract.aliasOk(prefs.alias)) return@execute done("Set an alias first (a-z, 0-9, -).")
        if (!prefs.workerUrl.startsWith("https://") || prefs.token.isBlank()) return@execute done("Set the Worker URL (https) and the token first.")
        val device = Facts.device(prefs.alias)
        var sent = 0
        for (round in 0 until 40) {
            val batch = log.pending(Contract.MAX_ROWS_PER_UPLOAD)
            if (batch.isEmpty()) break
            val started = SystemClock.elapsedRealtime()
            val network = Facts.network(app)
            val (status, error) = post(prefs.workerUrl.trimEnd('/') + "/probe/events", prefs.token, Contract.uploadBody(device, batch))
            val ms = SystemClock.elapsedRealtime() - started
            log.append("UPLOAD", mapOf("ok" to (status == 200), "status" to status, "rows" to batch.size, "durationMs" to ms, "network" to network, "error" to error))
            if (status != 200) return@execute done("Upload failed (${status ?: error}). Rows are kept. Sent $sent so far.")
            log.markUploaded(batch.map { it.id })
            sent += batch.size
        }
        done("Uploaded $sent rows.")
    }

    private fun post(url: String, token: String, body: String): Pair<Int?, String?> = try {
        val c = (URL(url).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"; connectTimeout = 15_000; readTimeout = 30_000; doOutput = true
            setRequestProperty("content-type", "application/json")
            setRequestProperty("authorization", "Bearer $token")
        }
        c.outputStream.use { it.write(body.toByteArray()) }
        val code = c.responseCode
        (if (code < 400) c.inputStream else c.errorStream)?.close()
        c.disconnect()
        code to null
    } catch (e: Exception) {
        null to "${e.javaClass.simpleName}: ${e.message}".take(200)
    }
}
