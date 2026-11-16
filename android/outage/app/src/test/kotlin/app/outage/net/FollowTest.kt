package app.outage.net

import app.outage.onboarding.MiniJson
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Follow request against the strict shape in core/shared/src/follow.ts (alerts-and-light-alarm R6.2, R7.3, ADR 0035).
 * The fixture is built in code because the secrets guard rejects a fixture file with a token field.
 */
class FollowTest {
    private val id = "abcdefghijklmnopqrstuvwxyz".map { if (it in "abcdefghijklmnopqrstuvwxyz234567") it else 'a' }.joinToString("").take(26)
    private val cell = "88a5a9d8e1fffff"
    private val token = "fcm-token_0123456789:abcdef.ghij"

    @Suppress("UNCHECKED_CAST")
    private fun parse(json: String) = MiniJson.parse(json) as Map<String, Any?>

    @Test fun followBodyHasExactlyTheSevenKeys() {
        val body = FollowJson.follow(id, token, FollowPrefs(cell, setOf(PushKind.RESTORED, PushKind.CONFIRMED), QuietWindow(22 * 60, 6 * 60)), 60)!!
        val m = parse(body)
        assertEquals(setOf("installId", "cell", "fcmToken", "kinds", "quietStartMin", "quietEndMin", "tzOffsetMin"), m.keys)
        assertEquals(listOf("CONFIRMED", "RESTORED"), m["kinds"])
        assertEquals(1320, (m["quietStartMin"] as Number).toInt())
        assertEquals(360, (m["quietEndMin"] as Number).toInt())
        assertEquals(60, (m["tzOffsetMin"] as Number).toInt())
    }

    @Test fun noWindowSendsBothNulls() {
        val m = parse(FollowJson.follow(id, token, FollowPrefs(cell, setOf(PushKind.CONFIRMED), null), -300)!!)
        assertNull(m["quietStartMin"])
        assertNull(m["quietEndMin"])
        assertEquals(-300, (m["tzOffsetMin"] as Number).toInt())
    }

    @Test fun bodiesTheWorkerWouldRejectAreNotBuilt() {
        val ok = FollowPrefs(cell, setOf(PushKind.CONFIRMED), null)
        assertNull(FollowJson.follow(id, token, ok.copy(kinds = emptySet()), 0))
        assertNull(FollowJson.follow(id, token, ok.copy(cell = "sim-0,0"), 0))
        assertNull(FollowJson.follow(id, "short", ok, 0))
        assertNull(FollowJson.follow(id, "bad token with spaces 123456", ok, 0))
        assertNull(FollowJson.follow("NOTANID", token, ok, 0))
        assertNull(FollowJson.follow(id, token, ok, 841))
        assertNotNull(FollowJson.follow(id, token, ok, 840))
    }

    @Test fun unfollowBody() {
        assertEquals(setOf("installId", "cell"), parse(FollowJson.unfollow(id, cell)!!).keys)
        assertNull(FollowJson.unfollow(id, "nope"))
    }

    @Test fun quietTimesWrapAroundMidnight() {
        assertEquals(23 * 60 + 30, QuietWindow.shift(0, -30))
        assertEquals(0, QuietWindow.shift(23 * 60 + 30, 30))
        assertEquals("06:30", QuietWindow.hhmm(390))
        assertTrue(runCatching { QuietWindow(1440, 0) }.isFailure)
    }

    @Test fun apiMapsAnswers() {
        fun api(code: Int?) = FollowApi("https://x.test/", HttpPost { _, _, _ -> code?.let { it to "{}" } })
        assertEquals(FollowResult.OK, api(200).follow("{}", "t"))
        assertEquals(FollowResult.RETRY, api(null).follow("{}", "t"))
        assertEquals(FollowResult.RETRY, api(429).follow("{}", "t"))
        assertEquals(FollowResult.RETRY, api(503).unfollow("{}", "t"))
        assertEquals(FollowResult.REJECTED, api(400).follow("{}", "t"))
    }

    @Test fun apiPostsToTheRightPathWithTheInstallToken() {
        var seen: Triple<String, String, String?>? = null
        val a = FollowApi("https://x.test/", HttpPost { u, b, t -> seen = Triple(u, b, t); 200 to "{}" })
        a.follow("{\"a\":1}", "tok")
        assertEquals(Triple("https://x.test/v1/follow", "{\"a\":1}", "tok"), seen)
        a.unfollow("{}", "tok")
        assertEquals("https://x.test/v1/unfollow", seen!!.first)
        assertFalse(seen!!.second.contains("fcm"))
    }
}
