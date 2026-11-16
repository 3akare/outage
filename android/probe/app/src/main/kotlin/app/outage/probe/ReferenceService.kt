package app.outage.probe

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.SystemClock

/**
 * R2: the time reference. A foreground service with dynamic power receivers logs each plug change with the time the
 * broadcast arrived, the plug read at that moment, and the plug read again one second later. Switchable off (R2.2).
 * Foreground type specialUse needs a <property> in the manifest
 * (https://developer.android.com/reference/android/content/pm/ServiceInfo#FOREGROUND_SERVICE_TYPE_SPECIAL_USE).
 */
class ReferenceService : Service() {
    private val main = Handler(Looper.getMainLooper())
    private var lastBattery: Triple<Any?, Any?, Any?>? = null

    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(ctx: Context, intent: Intent) {
            val seenAt = SystemClock.elapsedRealtime()
            val log = ProbeLog.get(ctx)
            when (intent.action) {
                Intent.ACTION_POWER_CONNECTED, Intent.ACTION_POWER_DISCONNECTED -> {
                    val now = Facts.battery(ctx)
                    val action = if (intent.action == Intent.ACTION_POWER_CONNECTED) "CONNECTED" else "DISCONNECTED"
                    main.postDelayed({
                        val later = Facts.battery(ctx)
                        log.append("PLUG", linkedMapOf("source" to "RECEIVER", "action" to action, "plug" to now["plug"], "plugAfter1s" to later["plug"],
                            "charging" to now["charging"], "batteryPct" to now["batteryPct"], "isInteractive" to Facts.interactive(ctx)), seenAt)
                    }, 1_000)
                }
                Intent.ACTION_BATTERY_CHANGED -> {
                    val f = Facts.battery(ctx)
                    val key = Triple(f["plug"], f["charging"], f["batteryPct"])
                    if (key != lastBattery) { lastBattery = key; log.append("BATTERY", linkedMapOf<String, Any?>("source" to "RECEIVER").apply { putAll(f) }, seenAt) }
                }
            }
        }
    }

    override fun onCreate() {
        super.onCreate()
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(CHANNEL, "Probe reference logger", NotificationManager.IMPORTANCE_LOW))
        val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        val n = Notification.Builder(this, CHANNEL).setContentTitle("Outage probe").setContentText("Reference logger is on")
            .setSmallIcon(android.R.drawable.ic_lock_idle_charging).setOngoing(true).setContentIntent(open).build()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) startForeground(NOTIFICATION_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        else startForeground(NOTIFICATION_ID, n)
        val filter = IntentFilter().apply {
            addAction(Intent.ACTION_POWER_CONNECTED); addAction(Intent.ACTION_POWER_DISCONNECTED); addAction(Intent.ACTION_BATTERY_CHANGED)
        }
        // System broadcasts; NOT_EXPORTED keeps other apps out (https://developer.android.com/reference/android/content/Context#registerReceiver(android.content.BroadcastReceiver,%20android.content.IntentFilter,%20int))
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
        else registerReceiver(receiver, filter)
        ProbeLog.get(this).append("SESSION", mapOf("kind" to "reference_on"))
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int = START_STICKY

    override fun onDestroy() {
        runCatching { unregisterReceiver(receiver) }
        ProbeLog.get(this).append("SESSION", mapOf("kind" to "reference_off"))
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    companion object {
        private const val CHANNEL = "reference"
        private const val NOTIFICATION_ID = 1
        fun start(ctx: Context) { Prefs(ctx).referenceOn = true; ctx.startForegroundService(Intent(ctx, ReferenceService::class.java)) }
        fun stop(ctx: Context) { Prefs(ctx).referenceOn = false; ctx.stopService(Intent(ctx, ReferenceService::class.java)) }
    }
}
