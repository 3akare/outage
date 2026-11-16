package app.outage.sensor

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
import app.outage.MainActivity
import app.outage.R

/**
 * The primary driver (ADR 0032, station-mode design section 6): a `specialUse` foreground service with dynamic
 * `ACTION_POWER_CONNECTED` / `ACTION_POWER_DISCONNECTED` receivers. These broadcasts reach only context-registered
 * receivers since Android 8, which is why the service exists. It also sends an ARMED heartbeat every 10 minutes while
 * armed (station-mode R5), and returns `START_STICKY` so the OS restarts it after a kill.
 * https://developer.android.com/reference/android/content/Intent#ACTION_POWER_DISCONNECTED
 * https://developer.android.com/develop/background-work/services/fgs/service-types#special-use
 * https://developer.android.com/reference/android/app/Service#startForeground(int,%20android.app.Notification,%20int)
 */
class SensorService : Service() {
    private val main = Handler(Looper.getMainLooper())
    private var registered = false

    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(ctx: Context, intent: Intent) {
            val input = when (intent.action) {
                Intent.ACTION_POWER_CONNECTED -> Input.PowerConnected
                Intent.ACTION_POWER_DISCONNECTED -> Input.PowerDisconnected
                else -> return
            }
            val pending = goAsync()
            Thread {
                try { Sensor.get(ctx).handle(input) } finally { pending.finish() }
            }.start()
        }
    }

    private val heartbeat = object : Runnable {
        override fun run() {
            val ctx = this@SensorService
            Thread { Sensor.get(ctx).handle(Input.Heartbeat) }.start()
            main.postDelayed(this, HEARTBEAT_MS)
        }
    }

    override fun onCreate() {
        super.onCreate()
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(CHANNEL, getString(R.string.sensor_channel), NotificationManager.IMPORTANCE_LOW))
        val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        val stop = PendingIntent.getService(this, 1, Intent(this, SensorService::class.java).setAction(ACTION_STOP), PendingIntent.FLAG_IMMUTABLE)
        val n = Notification.Builder(this, CHANNEL)
            .setContentTitle(getString(R.string.sensor_notification_title))
            .setContentText(getString(R.string.sensor_notification_body))
            .setSmallIcon(R.drawable.ic_sensor_armed)
            .setOngoing(true)
            .setContentIntent(open)
            .addAction(Notification.Action.Builder(null, getString(R.string.sensor_notification_stop), stop).build())
            .build()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(NOTIFICATION_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        } else {
            startForeground(NOTIFICATION_ID, n)
        }
        if (!registered) {
            val filter = IntentFilter().apply { addAction(Intent.ACTION_POWER_CONNECTED); addAction(Intent.ACTION_POWER_DISCONNECTED) }
            // System broadcasts; NOT_EXPORTED keeps other apps out.
            // https://developer.android.com/reference/android/content/Context#registerReceiver(android.content.BroadcastReceiver,%20android.content.IntentFilter,%20int)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
            else registerReceiver(receiver, filter)
            registered = true
        }
        val sensor = Sensor.get(this)
        sensor.setReceiverActive(true)
        // The plug may have changed while no receiver listened: feed the current state once.
        Thread { sensor.handle(if (sensor.onDetectionPlug()) Input.PowerConnected else Input.PowerDisconnected) }.start()
        main.postDelayed(heartbeat, HEARTBEAT_MS)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            Thread { Sensor.get(this).stop() }.start()
            return START_NOT_STICKY
        }
        return START_STICKY
    }

    /** API 35. `specialUse` has no time limit today; if one is ever applied, stop cleanly and record it (station-mode R6.4). */
    override fun onTimeout(startId: Int, fgsType: Int) {
        Sensor.get(this).receiverBlocked("FGS_TIMEOUT")
        stopSelf()
    }

    override fun onDestroy() {
        main.removeCallbacks(heartbeat)
        if (registered) runCatching { unregisterReceiver(receiver) }
        registered = false
        Sensor.get(this).setReceiverActive(false)
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    companion object {
        private const val CHANNEL = "sensor"
        private const val NOTIFICATION_ID = 1
        private const val ACTION_STOP = "app.outage.sensor.STOP"
        /** station-mode design decision 5: 10 minutes, so three missed beats stay under the 30-minute silence limit (T7). */
        const val HEARTBEAT_MS = 600_000L

        /**
         * Returns null when started, or `FGS_START_BLOCKED` when Android refused a start from the background.
         * https://developer.android.com/reference/android/app/ForegroundServiceStartNotAllowedException (API 31+)
         */
        fun start(ctx: Context): String? = try {
            ctx.startForegroundService(Intent(ctx, SensorService::class.java))
            null
        } catch (e: IllegalStateException) {
            // ForegroundServiceStartNotAllowedException (API 31+) extends IllegalStateException.
            "FGS_START_BLOCKED"
        } catch (e: SecurityException) {
            "FGS_START_DENIED"
        }

        fun stop(ctx: Context) {
            ctx.stopService(Intent(ctx, SensorService::class.java))
        }
    }
}
