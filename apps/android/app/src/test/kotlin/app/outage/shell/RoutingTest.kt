package app.outage.shell

import java.util.Random
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** app-shell R1, R3.3, properties AS1 to AS3. */
class RoutingTest {
    // AS1 (R1.1): not onboarded gives Onboarding, whatever the link says.
    @Test
    fun AS1_start_routing_not_onboarded_opens_onboarding() {
        for (link in listOf(null, Route.Home, Route.Log, Route.Settings, Route.Feature("alarm"))) {
            val router = Routes.start(onboardingNeeded = true, link = link)
            assertEquals(listOf<Route>(Route.Onboarding), router.stack)
        }
    }

    // AS1 (R1.2): onboarded and no link gives Home.
    @Test
    fun AS1_start_routing_onboarded_opens_home() {
        assertEquals(listOf<Route>(Route.Home), Routes.start(false, null).stack)
        assertEquals(listOf<Route>(Route.Home), Routes.start(false, Route.Home).stack)
    }

    // AS1 (R1.3): a link opens its destination with Home underneath.
    @Test
    fun AS1_start_routing_deep_link_keeps_home_in_back_stack() {
        for (dest in listOf(Route.Log, Route.Area, Route.Settings, Route.Feature("alarm"))) {
            val router = Routes.start(false, dest)
            assertEquals(listOf(Route.Home, dest), router.stack)
            assertEquals(dest, router.current)
            assertTrue(router.back())
            assertEquals(Route.Home, router.current)
        }
    }

    @Test
    fun AS1_start_routing_parses_known_routes() {
        assertEquals(Route.Home, Routes.fromIntent("home"))
        assertEquals(Route.Log, Routes.fromIntent("log"))
        assertEquals(Route.Area, Routes.fromIntent("area"))
        assertEquals(Route.Settings, Routes.fromIntent("settings"))
        assertEquals(Route.Feature("alarm"), Routes.fromIntent("feature:alarm"))
        assertEquals(Route.Settings, Routes.fromIntent("  Settings "))
    }

    // AS2 (R3.3)
    @Test
    fun AS2_router_back_from_any_tab_returns_home() {
        for (tab in listOf(Route.Log, Route.Area, Route.Settings)) {
            val router = Router(Route.Home)
            router.tab(tab)
            assertEquals(listOf(Route.Home, tab), router.stack)
            assertTrue(router.back())
            assertEquals(Route.Home, router.current)
        }
    }

    @Test
    fun AS2_router_back_on_home_returns_false() {
        val router = Router(Route.Home)
        assertFalse(router.back())
        assertEquals(listOf<Route>(Route.Home), router.stack)
    }

    @Test
    fun AS2_router_back_tab_resets_the_stack() {
        val router = Router(Route.Home)
        router.tab(Route.Settings)
        router.go(Route.Feature("battery"))
        assertEquals(listOf(Route.Home, Route.Settings, Route.Feature("battery")), router.stack)
        router.tab(Route.Log)
        assertEquals(listOf(Route.Home, Route.Log), router.stack)
        router.tab(Route.Home)
        assertEquals(listOf<Route>(Route.Home), router.stack)
    }

    @Test
    fun AS2_router_back_pops_one_pushed_screen_at_a_time() {
        val router = Router(Route.Home)
        router.tab(Route.Settings)
        router.go(Route.Feature("battery"))
        assertTrue(router.back())
        assertEquals(Route.Settings, router.current)
        assertTrue(router.back())
        assertEquals(Route.Home, router.current)
        assertFalse(router.back())
    }

    // AS2: random operation sequences keep the stack valid and never throw.
    @Test
    fun AS2_router_back_random_operations_keep_home_at_the_bottom() {
        val rnd = Random(20261114L)
        val tabs = listOf(Route.Home, Route.Log, Route.Area, Route.Settings)
        repeat(500) {
            val router = Router(Route.Home)
            repeat(40) {
                when (rnd.nextInt(3)) {
                    0 -> router.tab(tabs[rnd.nextInt(tabs.size)])
                    1 -> router.go(Route.Feature("k" + rnd.nextInt(5)))
                    else -> router.back()
                }
                assertEquals(Route.Home, router.stack.first())
                assertTrue(router.stack.isNotEmpty())
            }
            while (router.back()) { /* drain */ }
            assertEquals(listOf<Route>(Route.Home), router.stack)
        }
    }

    // AS3 (R1.3): unknown or malicious strings never crash and give null, so Home opens.
    @Test
    fun AS3_unknown_routes_never_throw_and_give_home() {
        val rnd = Random(42L)
        val known = setOf("home", "log", "area", "settings")
        val alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:/_-. %\u0000\n\t\u00e9\u4e2d'\"<>;\\"
        repeat(5000) {
            val len = rnd.nextInt(200)
            val sb = StringBuilder()
            repeat(len) { sb.append(alphabet[rnd.nextInt(alphabet.length)]) }
            val s = sb.toString()
            val route = Routes.fromIntent(s)
            val trimmed = s.trim().lowercase()
            val validFeature = trimmed.startsWith("feature:") && Regex("[a-z0-9_-]{1,32}").matches(trimmed.removePrefix("feature:"))
            val expectNull = trimmed !in known && !(validFeature && s.length <= 64)
            if (expectNull) assertNull("input: " + s, route)
            // Whatever came back, start never throws and ends on Home when onboarded.
            val router = Routes.start(false, route)
            assertEquals(Route.Home, router.stack.first())
        }
    }

    @Test
    fun AS3_unknown_routes_fixed_cases() {
        for (s in listOf(null, "", " ", "onboarding", "feature:", "feature:../x", "feature:A b", "feature:" + "a".repeat(33),
            "javascript:alert(1)", "home\u0000", "HOME;", "a".repeat(10_000), "feature:" + "a".repeat(100))) {
            assertNull("input: " + s, Routes.fromIntent(s))
        }
        assertNull(Routes.fromIntent("onboarding"))
    }
}
