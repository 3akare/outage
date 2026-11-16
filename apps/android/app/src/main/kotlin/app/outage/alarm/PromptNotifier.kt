package app.outage.alarm

import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import app.outage.MainActivity
import app.outage.R

/**
 * The quiet "Power just went?" prompt (alerts-and-light-alarm R1, design 3.2). Channel `power-check` has no sound or
 * vibration. The two actions are `PendingIntent`s to an explicit, non-exported receiver with `FLAG_IMMUTABLE`
 * (mutable intents without an explicit component throw on Android 14 targets).
 * https://developer.android.com/about/versions/14/behavior-changes-14
 * https://developer.android.com/reference/android/app/Notification.Builder#setTimeoutAfter(long)
 */
class PromptNotifier(private val ctx: Context) {
    fun show(unplugSeq: Long) {
        ChannelSetup.ensure(ctx)
        val nm = ctx.getSystemService(NotificationManager::class.java) ?: return
        if (!nm.areNotificationsEnabled()) return // R1.7: the app screen offers the same two actions
        val open = PendingIntent.getActivity(ctx, 0, Intent(ctx, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        val n = Notification.Builder(ctx, ChannelSpecs.POWER_CHECK)
            .setSmallIcon(R.drawable.ic_sensor_unplugged)
            .setContentTitle(ctx.getString(R.string.prompt_title))
            .setContentText(ctx.getString(R.string.prompt_body))
            .setContentIntent(open)
            .setCategory(Notification.CATEGORY_STATUS)
            .setOnlyAlertOnce(true)
            .setTimeoutAfter(AlarmLimits.PROMPT_TIMEOUT_MS)
            .addAction(action(unplugSeq, NotificationActionReceiver.ACTION_YES, R.string.prompt_action_yes, 1))
            .addAction(action(unplugSeq, NotificationActionReceiver.ACTION_NO, R.string.prompt_action_no, 2))
            .build()
        nm.notify(TAG, id(unplugSeq), n)
    }

    fun remove(unplugSeq: Long) {
        ctx.getSystemService(NotificationManager::class.java)?.cancel(TAG, id(unplugSeq))
    }

    private fun action(seq: Long, action: String, label: Int, slot: Int): Notification.Action {
        val intent = Intent(ctx, NotificationActionReceiver::class.java).setAction(action).putExtra(NotificationActionReceiver.EXTRA_SEQ, seq)
        val pi = PendingIntent.getBroadcast(ctx, requestCode(seq, slot), intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        return Notification.Action.Builder(null, ctx.getString(label), pi).build()
    }

    companion object {
        const val TAG = "power-check"
        fun id(seq: Long): Int = (seq % 100_000).toInt()
        fun requestCode(seq: Long, slot: Int): Int = (seq % 100_000).toInt() * 4 + slot
    }
}
