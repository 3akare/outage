package app.outage.telemetry

import android.content.Context
import android.os.Build
import android.os.SystemClock
import app.outage.net.IngestApi
import app.outage.net.PrefsCredentials
import app.outage.net.TelemetryResult
import app.outage.sensor.DefaultSensorController
import java.time.LocalDate
import java.time.ZoneId
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * Whether the user turned on "Share anonymous diagnostics" (field-telemetry R1.1, onboarding R4.5). A small interface so
 * the onboarding screens can supply the answer however they store it; nothing uploads while this says false.
 */
fun interface TelemetryConsent {
    fun enabled(): Boolean
}

/**
 * The consent answer in a private preference. The onboarding screens write it with [set] when the user taps the
 * diagnostics choice, and the Settings "Share anonymous diagnostics" row reads and writes it. Default off.
 * https://developer.android.com/training/data-storage/shared-preferences
 */
class PrefsTelemetryConsent(context: Context) : TelemetryConsent {
    private val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    override fun enabled(): Boolean = prefs.getBoolean(KEY, false)

    fun set(on: Boolean) {
        prefs.edit().putBoolean(KEY, on).apply()
    }

    /** Delete-my-data (R1.4): back to off, and forget which days were sent. */
    fun clear() {
        prefs.edit().clear().apply()
    }

    companion object {
        const val PREFS = "telemetry_prefs"
        const val KEY = "share_diagnostics"
        const val KEY_LAST_DAY = "last_uploaded_day"
    }
}

/**
 * The daily uploader (field-telemetry R2.4, R3.1). Every few hours it looks at the previous local day: when consent is on,
 * the phone has registered, and that day was not sent yet, it builds one aggregate and posts it. A day is marked sent on a
 * 2xx or when the Worker refuses the body for good, so one bad body is never retried forever. Nothing runs with no Worker
 * address (demo builds, ADR 0024).
 */
class TelemetryDriver(
    private val context: Context,
    private val api: IngestApi,
    private val credentials: PrefsCredentials,
    private val sensor: DefaultSensorController,
    private val consent: TelemetryConsent,
) {
    private val prefs = context.applicationContext.getSharedPreferences(PrefsTelemetryConsent.PREFS, Context.MODE_PRIVATE)
    private val exec = Executors.newSingleThreadScheduledExecutor { r -> Thread(r, "telemetry").apply { isDaemon = true } }

    fun start() {
        exec.scheduleWithFixedDelay({ runCatching { runOnce() } }, FIRST_RUN_MIN, EVERY_MIN, TimeUnit.MINUTES)
    }

    /** One pass. Visible for the caller that wants to run it now. */
    fun runOnce(zone: ZoneId = ZoneId.systemDefault()) {
        if (!consent.enabled()) return
        val id = credentials.installId() ?: return
        val token = credentials.token() ?: return
        val yesterday = LocalDate.now(zone).minusDays(1)
        if (prefs.getString(PrefsTelemetryConsent.KEY_LAST_DAY, null) == yesterday.toString()) return
        val day = DeviceDays.build(
            installId = id,
            maker = DeviceDays.maker(Build.MANUFACTURER.orEmpty(), Build.BRAND.orEmpty()),
            androidMajor = Build.VERSION.RELEASE.substringBefore('.').toIntOrNull() ?: Build.VERSION.SDK_INT,
            day = yesterday,
            zone = zone,
            events = sensor.recentEvents(),
            diagnostics = sensor.getDiagnostics(),
            nowWallMs = System.currentTimeMillis(),
            nowElapsedMs = SystemClock.elapsedRealtime(),
        )
        when (api.postTelemetry(day.toJson(), token)) {
            TelemetryResult.Sent, TelemetryResult.Dropped ->
                prefs.edit().putString(PrefsTelemetryConsent.KEY_LAST_DAY, yesterday.toString()).apply()
            TelemetryResult.Retry -> Unit
        }
    }

    private companion object {
        const val FIRST_RUN_MIN = 5L
        const val EVERY_MIN = 180L
    }
}
