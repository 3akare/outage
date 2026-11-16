package app.outage.onboarding

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager
import android.os.Build
import android.os.CancellationSignal
import android.os.SystemClock
import java.util.concurrent.Executors

/**
 * One coarse position, once (onboarding R3.2). Needs only `ACCESS_COARSE_LOCATION`. A recent last-known position and a
 * fresh fix race; the first to arrive wins and the wait ends after [FirstResult.TIMEOUT_MS] (R3.4). Blocking: call it off
 * the main thread. The position never leaves this call: the caller turns it into a cell and drops it (O2).
 * https://developer.android.com/reference/android/location/LocationManager#getLastKnownLocation(java.lang.String)
 * https://developer.android.com/reference/android/location/LocationManager#getCurrentLocation(java.lang.String,%20android.os.CancellationSignal,%20java.util.concurrent.Executor,%20java.util.function.Consumer%3Candroid.location.Location%3E)
 * https://developer.android.com/reference/android/location/Location#isMock()
 */
object LocationSource {
    fun hasPermission(ctx: Context): Boolean =
        ctx.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

    @SuppressLint("MissingPermission") // checked by hasPermission above
    fun readOnce(ctx: Context): Fix? {
        if (!hasPermission(ctx)) return null
        val lm = ctx.getSystemService(LocationManager::class.java) ?: return null
        val first = FirstResult<Fix>()
        val providers = listOf(LocationManager.NETWORK_PROVIDER, LocationManager.PASSIVE_PROVIDER, LocationManager.GPS_PROVIDER)
            .filter { runCatching { lm.isProviderEnabled(it) }.getOrDefault(false) || it == LocationManager.PASSIVE_PROVIDER }

        for (p in providers) {
            val last = runCatching { lm.getLastKnownLocation(p) }.getOrNull() ?: continue
            val ageMs = (SystemClock.elapsedRealtimeNanos() - last.elapsedRealtimeNanos) / 1_000_000
            if (ageMs in 0..FirstResult.MAX_FIX_AGE_MS) { first.offer(last.toFix()); break }
        }
        if (first.result() == null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val signal = CancellationSignal()
            val exec = Executors.newSingleThreadExecutor()
            providers.firstOrNull { it != LocationManager.PASSIVE_PROVIDER }?.let { p ->
                runCatching { lm.getCurrentLocation(p, signal, exec) { loc -> if (loc != null) first.offer(loc.toFix()) } }
            }
            val deadline = SystemClock.elapsedRealtime() + FirstResult.TIMEOUT_MS
            while (first.result() == null && SystemClock.elapsedRealtime() < deadline) Thread.sleep(100)
            signal.cancel()
            exec.shutdown()
        }
        return first.result()
    }

    private fun Location.toFix(): Fix {
        val mocked = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) isMock else @Suppress("DEPRECATION") isFromMockProvider
        return Fix(latitude, longitude, mocked)
    }
}
