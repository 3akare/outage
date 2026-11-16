package app.outage.net

import android.content.Context
import android.os.SystemClock
import app.outage.sensor.DefaultSensorController
import app.outage.sensor.EventType
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit
import kotlin.random.Random

/**
 * Install ID and token in private SharedPreferences (event-ingest R2.1). Kept until the server confirms a delete, so a
 * failed delete can be retried at the next start (app-shell R5.3).
 * https://developer.android.com/reference/android/content/SharedPreferences
 */
class PrefsCredentials(context: Context) : CredentialsProvider {
    private val prefs = context.applicationContext.getSharedPreferences("ingest_prefs", Context.MODE_PRIVATE)
    override fun installId(): String? = prefs.getString(KEY_ID, null)
    override fun token(): String? = prefs.getString(KEY_TOKEN, null)
    fun save(r: Registration) = prefs.edit().putString(KEY_ID, r.installId).putString(KEY_TOKEN, r.token).apply()
    fun rememberCell(cell: String) = prefs.edit().putString(KEY_CELLS, cell).apply()
    fun cells(): List<String> = prefs.getString(KEY_CELLS, null)?.let { listOf(it) } ?: emptyList()
    fun clear() = prefs.edit().clear().apply()

    private companion object {
        const val KEY_ID = "install_id"
        const val KEY_TOKEN = "token"
        const val KEY_CELLS = "uploaded_cell"
    }
}

/**
 * event-ingest task 10: drives the [Uploader] on one background thread. Triggers: start, every new detection event from
 * the sensor listener (prompt upload, R9.1), and the delay the Uploader asks for. Registers once on first run.
 * Nothing runs when `BuildConfig.API_BASE` is empty (demo builds, ADR 0024).
 */
class UploadDriver(
    private val api: IngestApi,
    private val credentials: PrefsCredentials,
    private val sensor: DefaultSensorController,
    private val cell: () -> String?,
) {
    private val exec = Executors.newSingleThreadScheduledExecutor { r -> Thread(r, "uploader").apply { isDaemon = true } }
    private var next: ScheduledFuture<*>? = null
    private val uploader = Uploader(
        outbox = SensorOutbox(sensor) { cell()?.also { credentials.rememberCell(it) } },
        transport = api,
        clock = object : ElapsedClock { override fun elapsedRealtimeMs() = SystemClock.elapsedRealtime() },
        rng = Random.Default,
        credentials = credentials,
    )

    fun start() {
        sensor.addListener { e -> if (e.type != EventType.ARMED && e.type != EventType.DISARMED) kick(0) else kick(STATE_CHECK_MS) }
        kick(0)
    }

    @Synchronized
    private fun kick(delayMs: Long) {
        val current = next
        if (current != null && !current.isDone && current.getDelay(TimeUnit.MILLISECONDS) <= delayMs) return
        current?.cancel(false)
        next = exec.schedule({ runOnce() }, delayMs, TimeUnit.MILLISECONDS)
    }

    private fun runOnce() {
        try {
            if (credentials.installId() == null) {
                val r = api.register()
                if (r == null) { kick(RETRY_REGISTER_MS); return }
                credentials.save(r)
                sensor.setInstallId(r.installId)
            }
            val result = uploader.flush()
            result.nextDelayMs?.let { kick(it.coerceAtLeast(0)) }
        } catch (_: Exception) {
            kick(RETRY_REGISTER_MS)
        }
    }

    private companion object {
        const val RETRY_REGISTER_MS = 300_000L
        /** State events wait in the Uploader (R9.2); check back after a heartbeat interval. */
        const val STATE_CHECK_MS = 600_000L
    }
}
