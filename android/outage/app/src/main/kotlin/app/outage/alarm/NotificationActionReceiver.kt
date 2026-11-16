package app.outage.alarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Maps a tapped notification action to the alarm layer. Explicit and not exported (manifest). Works with no app screen
 * open (R1.3, R2.6): it goes to the SQLite-backed [AlarmHost], which a new process builds on demand.
 * https://developer.android.com/reference/android/content/BroadcastReceiver#goAsync()
 */
class NotificationActionReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        val action = intent.action ?: return
        val seq = intent.getLongExtra(EXTRA_SEQ, -1L)
        val pending = goAsync()
        Thread {
            try {
                val host = AlarmHost.get(ctx)
                when (action) {
                    ACTION_YES -> if (seq >= 0) host.core.answer(seq, true)
                    ACTION_NO -> if (seq >= 0) host.core.answer(seq, false)
                    ACTION_STOP -> host.core.stop()
                }
                host.flush()
            } finally {
                pending.finish()
            }
        }.start()
    }

    companion object {
        const val ACTION_YES = "app.outage.alarm.YES"
        const val ACTION_NO = "app.outage.alarm.NO"
        const val ACTION_STOP = "app.outage.alarm.STOP"
        const val EXTRA_SEQ = "unplugSeq"
    }
}
