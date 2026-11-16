package app.outage.net

import app.outage.onboarding.OnboardingFlow

/** The two pushes a follower can ask for (alerts-and-light-alarm R6.3). The order here is the wire order. */
enum class PushKind { CONFIRMED, RESTORED }

/** Quiet hours as minutes of the day. The window may cross midnight (R7.1). Only the Worker's channel choice reads it (R7.4). */
data class QuietWindow(val startMin: Int, val endMin: Int) {
    init {
        require(startMin in 0..1439 && endMin in 0..1439)
    }

    /** "22:30". Display only. */
    fun startText(): String = hhmm(startMin)
    fun endText(): String = hhmm(endMin)

    companion object {
        const val STEP_MIN = 30
        fun hhmm(min: Int): String = "%02d:%02d".format(min / 60, min % 60)

        /** Move a time of day by [delta] minutes and wrap around midnight. */
        fun shift(min: Int, delta: Int): Int = ((min + delta) % 1440 + 1440) % 1440
    }
}

/** What the user chose on the follow screen. Phone only; the cell is the user's spot (no coordinates exist here). */
data class FollowPrefs(val cell: String, val kinds: Set<PushKind>, val quiet: QuietWindow?)

/**
 * Request bodies for `POST /v1/follow` and `/v1/unfollow` (alerts-and-light-alarm design 5.4, R6.2), written to match
 * the strict parser in `core/shared/src/follow.ts`. A body that the Worker would reject is not built (null), so a
 * bad value never leaves the phone. The shared fixture was not added as a file (ADR 0035), so the test builds the same
 * cases in code.
 */
object FollowJson {
    private val INSTALL_ID = Regex("^[a-z2-7]{26}$")

    /** Same alphabet and bounds as `FCM_TOKEN_PATTERN` in the shared package. */
    private val TOKEN = Regex("^[A-Za-z0-9_:.-]{20,4096}$")

    fun follow(installId: String, fcmToken: String, prefs: FollowPrefs, tzOffsetMin: Int): String? {
        if (!INSTALL_ID.matches(installId) || !TOKEN.matches(fcmToken) || !OnboardingFlow.isCell(prefs.cell)) return null
        if (prefs.kinds.isEmpty() || tzOffsetMin !in -840..840) return null
        val kinds = PushKind.entries.filter { it in prefs.kinds }
        return buildString {
            append("{\"installId\":\"").append(installId).append("\",\"cell\":\"").append(prefs.cell)
            append("\",\"fcmToken\":\"").append(fcmToken).append("\",\"kinds\":[")
            kinds.forEachIndexed { i, k -> if (i > 0) append(','); append('"').append(k.name).append('"') }
            append("],\"quietStartMin\":").append(prefs.quiet?.startMin ?: "null")
            append(",\"quietEndMin\":").append(prefs.quiet?.endMin ?: "null")
            append(",\"tzOffsetMin\":").append(tzOffsetMin).append('}')
        }
    }

    fun unfollow(installId: String, cell: String): String? {
        if (!INSTALL_ID.matches(installId) || !OnboardingFlow.isCell(cell)) return null
        return "{\"installId\":\"$installId\",\"cell\":\"$cell\"}"
    }
}

enum class FollowResult {
    OK,

    /** No Firebase config in this build (ADR 0036). Light Alarm is not affected. */
    NO_PUSH,

    /** The demo build has no Worker address. */
    NO_SERVER,

    /** No install ID yet: first events have not registered the phone. */
    NOT_REGISTERED,

    /** No spot chosen, so there is no cell to follow. */
    NO_SPOT,

    /** The network failed or the Worker asked to retry. */
    RETRY,

    /** The Worker said no (bad body, bad token). */
    REJECTED,
}

/** Follow and unfollow calls (event-ingest design 5, ADR 0035). Pure over [HttpPost]. */
class FollowApi(private val base: String, private val http: HttpPost) {
    private fun url(path: String) = base.trimEnd('/') + path

    fun follow(body: String, token: String): FollowResult = send("/v1/follow", body, token)
    fun unfollow(body: String, token: String): FollowResult = send("/v1/unfollow", body, token)

    private fun send(path: String, body: String, token: String): FollowResult {
        val (code, _) = http.post(url(path), body, token) ?: return FollowResult.RETRY
        return when {
            code in 200..299 -> FollowResult.OK
            code == 429 || code >= 500 -> FollowResult.RETRY
            else -> FollowResult.REJECTED
        }
    }
}
