package app.outage.probe

import android.app.NotificationManager
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.BatteryManager
import android.os.Build
import android.os.PowerManager
import android.provider.Settings

/** Reads of phone state for log rows. Every call is guarded by API level; a failed read is logged as null, never guessed. */
object Facts {
    /** Sticky ACTION_BATTERY_CHANGED intent: registerReceiver(null, filter) returns it without registering. */
    private fun sticky(ctx: Context): Intent? = try {
        ctx.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
    } catch (_: RuntimeException) { null }

    fun battery(ctx: Context): Map<String, Any?> {
        val i = sticky(ctx)
        val plugged = i?.getIntExtra(BatteryManager.EXTRA_PLUGGED, -1)?.takeIf { it >= 0 }
        val level = i?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
        val scale = i?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
        val status = i?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1
        val plug = Contract.plugName(plugged)
        return linkedMapOf(
            "plug" to plug,
            "charging" to if (plugged == null) null else plug != "NONE",
            "batteryPct" to if (level >= 0 && scale > 0) level * 100 / scale else null,
            "batteryStatus" to when (status) {
                BatteryManager.BATTERY_STATUS_CHARGING -> "CHARGING"
                BatteryManager.BATTERY_STATUS_DISCHARGING -> "DISCHARGING"
                BatteryManager.BATTERY_STATUS_FULL -> "FULL"
                BatteryManager.BATTERY_STATUS_NOT_CHARGING -> "NOT_CHARGING"
                else -> "UNKNOWN"
            },
        )
    }

    /** M14: the second source, BatteryManager properties (https://developer.android.com/reference/android/os/BatteryManager). */
    fun batteryManager(ctx: Context): Map<String, Any?> {
        val bm = ctx.getSystemService(BatteryManager::class.java) ?: return mapOf("bmCharging" to null, "bmPct" to null)
        val pct = bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY).takeIf { it in 0..100 }
        return mapOf("bmCharging" to bm.isCharging, "bmPct" to pct)
    }

    fun standbyBucket(ctx: Context): String? {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) return null
        val usm = ctx.getSystemService(UsageStatsManager::class.java) ?: return null
        return when (val b = usm.appStandbyBucket) {
            UsageStatsManager.STANDBY_BUCKET_ACTIVE -> "ACTIVE"
            UsageStatsManager.STANDBY_BUCKET_WORKING_SET -> "WORKING_SET"
            UsageStatsManager.STANDBY_BUCKET_FREQUENT -> "FREQUENT"
            UsageStatsManager.STANDBY_BUCKET_RARE -> "RARE"
            UsageStatsManager.STANDBY_BUCKET_RESTRICTED -> "RESTRICTED"
            else -> "BUCKET_$b"
        }
    }

    fun exempt(ctx: Context): Boolean? = ctx.getSystemService(PowerManager::class.java)?.isIgnoringBatteryOptimizations(ctx.packageName)

    fun interactive(ctx: Context): Boolean? = ctx.getSystemService(PowerManager::class.java)?.isInteractive

    /** M12. Android 14+ only (https://developer.android.com/reference/android/app/NotificationManager#canUseFullScreenIntent()). */
    fun fullScreen(ctx: Context): Boolean? =
        if (Build.VERSION.SDK_INT >= 34) ctx.getSystemService(NotificationManager::class.java)?.canUseFullScreenIntent() else null

    /** Settings.Global.BOOT_COUNT, API 24+ (https://developer.android.com/reference/android/provider/Settings.Global#BOOT_COUNT). */
    fun bootCount(ctx: Context): Int = try {
        Settings.Global.getInt(ctx.contentResolver, Settings.Global.BOOT_COUNT)
    } catch (_: Settings.SettingNotFoundException) { -1 }

    fun network(ctx: Context): String {
        val cm = ctx.getSystemService(ConnectivityManager::class.java) ?: return "OTHER"
        val caps = cm.getNetworkCapabilities(cm.activeNetwork) ?: return "NONE"
        return when {
            caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "WIFI"
            caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "CELLULAR"
            else -> "OTHER"
        }
    }

    fun device(alias: String) = DeviceInfo(alias, Build.MANUFACTURER.take(40), Build.BRAND.take(40), Build.VERSION.SDK_INT)
}
