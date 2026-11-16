package app.outage.sensor

import android.app.NotificationManager
import android.app.job.JobInfo
import android.app.job.JobScheduler
import android.app.usage.UsageStatsManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.Build
import android.os.PowerManager
import android.os.SystemClock
import android.provider.Settings

/** `SystemClock.elapsedRealtime()` (https://developer.android.com/reference/android/os/SystemClock#elapsedRealtime())
 *  and `Settings.Global.BOOT_COUNT`, API 24+ (https://developer.android.com/reference/android/provider/Settings.Global#BOOT_COUNT). */
class AndroidSensorClock(private val ctx: Context) : SensorClock {
    override fun elapsedMs(): Long = SystemClock.elapsedRealtime()
    override fun bootCount(): Int = try {
        Settings.Global.getInt(ctx.contentResolver, Settings.Global.BOOT_COUNT)
    } catch (_: Settings.SettingNotFoundException) {
        -1
    }
}

class AndroidSensorPlatform(private val ctx: Context) : SensorPlatform {
    /**
     * The sticky `ACTION_BATTERY_CHANGED` intent: `registerReceiver(null, filter)` returns it without registering.
     * https://developer.android.com/reference/android/content/Context#registerReceiver(android.content.BroadcastReceiver,%20android.content.IntentFilter)
     * https://developer.android.com/reference/android/os/BatteryManager#EXTRA_PLUGGED
     */
    override fun facts(): Facts {
        val i = try { ctx.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED)) } catch (_: RuntimeException) { null }
        val plugged = i?.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0) ?: 0
        val level = i?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
        val scale = i?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
        val pct = if (level >= 0 && scale > 0) (level * 100 / scale).coerceIn(0, 100) else 0
        return Facts(Plug.fromExtra(plugged), pct)
    }

    private fun js() = ctx.getSystemService(JobScheduler::class.java)

    /**
     * The backup job: charging constraint, persisted across reboot (needs RECEIVE_BOOT_COMPLETED). Scheduling the same ID
     * replaces the old job, which keeps it idempotent. Never through the OS back-off (probe run 1, ADR 0001).
     * https://developer.android.com/reference/android/app/job/JobInfo.Builder#setRequiresCharging(boolean)
     * https://developer.android.com/reference/android/app/job/JobInfo.Builder#setPersisted(boolean)
     */
    override fun scheduleJob() {
        val info = JobInfo.Builder(JOB_ID, ComponentName(ctx, ChargingJobService::class.java))
            .setRequiresCharging(true).setPersisted(true).build()
        js()?.schedule(info)
    }

    override fun cancelJob() { js()?.cancel(JOB_ID) }

    override fun startReceiver(): String? = SensorService.start(ctx)
    override fun stopReceiver() = SensorService.stop(ctx)

    override fun androidSdk(): Int = Build.VERSION.SDK_INT
    override fun manufacturer(): String = Build.MANUFACTURER.take(40)

    /** https://developer.android.com/reference/android/app/usage/UsageStatsManager#getAppStandbyBucket() (API 28+). */
    override fun standbyBucket(): String? {
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

    /** https://developer.android.com/reference/android/os/PowerManager#isIgnoringBatteryOptimizations(java.lang.String) */
    override fun batteryExempt(): Boolean? = ctx.getSystemService(PowerManager::class.java)?.isIgnoringBatteryOptimizations(ctx.packageName)

    /** https://developer.android.com/reference/android/app/NotificationManager#areNotificationsEnabled() */
    override fun notificationsAllowed(): Boolean = ctx.getSystemService(NotificationManager::class.java)?.areNotificationsEnabled() ?: true

    companion object {
        const val JOB_ID = 1
    }
}

/** One sensor per process. Built lazily by whichever component starts first (app, job, service or boot receiver). */
object Sensor {
    @Volatile private var instance: DefaultSensorController? = null

    /**
     * Runs once when this process builds the sensor, before it recovers from a restart, so a listener added here
     * hears every event of the process (the Power Log uses it, power-log R1). Set by `OutageApp.onCreate`.
     */
    @Volatile var onCreated: (DefaultSensorController) -> Unit = {}

    /** The sensor if this process already built it. Never builds it, so Home can read it on the main thread. */
    fun peek(): DefaultSensorController? = instance

    fun get(ctx: Context): DefaultSensorController = instance ?: synchronized(this) {
        instance ?: DefaultSensorController(
            SqliteEventStore(ctx),
            AndroidSensorClock(ctx.applicationContext),
            AndroidSensorPlatform(ctx.applicationContext),
        ).also {
            instance = it
            runCatching { onCreated(it) }
            it.recoverOnProcessStart()
        }
    }
}
