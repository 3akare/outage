package app.outage.net

import android.annotation.SuppressLint
import android.content.Context
import app.outage.BuildConfig
import app.outage.alarm.ChannelSetup
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging
import com.google.firebase.messaging.FirebaseMessagingService
import java.util.TimeZone
import java.util.concurrent.Executors

/** Follow choices on the phone (cell, kinds, quiet window). Cleared by delete-my-data. */
// commit() on purpose, same as the other stores: "Deleted" is shown only after the data is on disk.
@SuppressLint("ApplySharedPref")
class FollowStore(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences("follow_prefs", Context.MODE_PRIVATE)

    fun read(): FollowPrefs? = try {
        val cell = prefs.getString("cell", null) ?: return null
        val kinds = prefs.getString("kinds", "")!!.split(',').mapNotNull { n -> PushKind.entries.firstOrNull { it.name == n } }.toSet()
        val s = prefs.getInt("quietStart", -1)
        val e = prefs.getInt("quietEnd", -1)
        FollowPrefs(cell, kinds, if (s in 0..1439 && e in 0..1439) QuietWindow(s, e) else null)
    } catch (_: Exception) {
        null
    }

    fun save(p: FollowPrefs) {
        prefs.edit().putString("cell", p.cell).putString("kinds", p.kinds.joinToString(",") { it.name })
            .putInt("quietStart", p.quiet?.startMin ?: -1).putInt("quietEnd", p.quiet?.endMin ?: -1).commit()
    }

    fun clear() {
        prefs.edit().clear().commit()
    }
}

/**
 * Push registration and follow calls (alerts-and-light-alarm task 8). Push is on only when this build has Firebase
 * configuration ([isAvailable], ADR 0036); without it every call answers [FollowResult.NO_PUSH] and nothing touches
 * Firebase, so Light Alarm is never affected. Channels are created before the token is requested (R9.1).
 * The token is sent only to the project's Worker with the follow request and is never logged.
 * https://firebase.google.com/docs/cloud-messaging/android/client#retrieve-the-current-registration-token
 */
class PushHost private constructor(private val ctx: Context) {
    val store = FollowStore(ctx)
    private val credentials = PrefsCredentials(ctx)
    private val io = Executors.newSingleThreadExecutor { r -> Thread(r, "push").apply { isDaemon = true } }
    private val api: FollowApi? = BuildConfig.API_BASE.takeIf { it.isNotBlank() }?.let { FollowApi(it, UrlConnectionPost) }

    /** True when a default Firebase app exists, which needs the Firebase config file at build time. */
    fun isAvailable(): Boolean = runCatching { FirebaseApp.getApps(ctx).isNotEmpty() }.getOrDefault(false)

    /** Saves the choice, then registers with the Worker. [done] is called on the push thread. */
    fun follow(prefs: FollowPrefs, done: (FollowResult) -> Unit) {
        io.execute {
            store.save(prefs)
            done(register(prefs))
        }
    }

    fun unfollow(done: (FollowResult) -> Unit) {
        io.execute {
            val p = store.read()
            store.clear()
            val id = credentials.installId()
            val token = credentials.token()
            val body = if (p != null && id != null) FollowJson.unfollow(id, p.cell) else null
            val a = api
            done(if (body == null || token == null || a == null) FollowResult.OK else a.unfollow(body, token))
        }
    }

    /** A refreshed token (R8, ADR 0035): sent again for the followed cell, if any. */
    fun onNewToken(token: String) {
        io.execute { store.read()?.let { send(it, token) } }
    }

    /** Delete-my-data, phone side. The server rows go with `POST /v1/delete`, which lists the cell (ADR 0035). */
    fun deleteLocal() {
        store.clear()
        if (isAvailable()) runCatching { FirebaseMessaging.getInstance().deleteToken() }
    }

    private fun register(p: FollowPrefs): FollowResult {
        if (!isAvailable()) return FollowResult.NO_PUSH
        if (api == null) return FollowResult.NO_SERVER
        if (credentials.installId() == null || credentials.token() == null) return FollowResult.NOT_REGISTERED
        ChannelSetup.ensure(ctx)
        val token = try {
            com.google.android.gms.tasks.Tasks.await(FirebaseMessaging.getInstance().token, 20, java.util.concurrent.TimeUnit.SECONDS)
        } catch (_: Exception) {
            return FollowResult.RETRY
        }
        // The delete call reads this cell to reach the right server rows.
        credentials.rememberCell(p.cell)
        return send(p, token)
    }

    private fun send(p: FollowPrefs, fcmToken: String): FollowResult {
        val a = api ?: return FollowResult.NO_SERVER
        val id = credentials.installId()
        val auth = credentials.token()
        if (id == null || auth == null) return FollowResult.NOT_REGISTERED
        val offset = TimeZone.getDefault().getOffset(System.currentTimeMillis()) / 60_000
        val body = FollowJson.follow(id, fcmToken, p, offset) ?: return FollowResult.REJECTED
        return a.follow(body, auth)
    }

    companion object {
        @Volatile private var instance: PushHost? = null

        fun get(ctx: Context): PushHost = instance ?: synchronized(this) {
            instance ?: PushHost(ctx.applicationContext).also { instance = it }
        }
    }
}

/**
 * Receives token refreshes. Messages are shown by the system from the `notification` payload on the `alerts` or
 * `alerts-quiet` channel (ADR 0036), so nothing else is overridden.
 * https://firebase.google.com/docs/cloud-messaging/android/client#monitor-token-generation
 */
class OutageMessagingService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        PushHost.get(this).onNewToken(token)
    }
}
