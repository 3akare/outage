package app.outage.shell

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** material-redesign MD3 and MD4 (ADR 0050, ADR 0054). Reads the Compose sources, like the string-pack test, so it needs no device. */
class MaterialShellTest {
    private fun ui(name: String) = Res.kotlinDir("ui/$name").readText()

    @Test
    fun MD3_dock_is_now_map_insights_settings_and_the_app_opens_on_now() {
        val shell = ui("Shell.kt")
        val order = Regex("""Tab\(Route\.(\w+),""").findAll(shell).map { it.groupValues[1] }.toList()
        // Status first (ADR 0054): Now (the Home route) leads, the map is one tap away.
        assertEquals(listOf("Home", "Map", "Insights", "Settings"), order)
        // The router starts on Now (Route.Home) after first run (Routes.start).
        assertEquals(Route.Home, Routes.start(onboardingNeeded = false, link = null).current)
    }

    @Test
    fun MD4_first_run_asks_only_coarse_location_and_notifications() {
        val firstRun = ui("CommonScreens.kt").substringAfter("fun FirstRunScreen(")
        val asked = Regex("""Manifest\.permission\.(\w+)""").findAll(firstRun).map { it.groupValues[1] }.toSet()
        assertEquals(setOf("ACCESS_COARSE_LOCATION", "POST_NOTIFICATIONS"), asked)
        assertFalse(firstRun.contains("ACCESS_FINE_LOCATION"))
        // "Not now" exists, so the location question never blocks the first look.
        assertTrue(firstRun.contains("R.string.first_run_not_now"))
    }

    @Test
    fun MD4_first_run_location_is_turned_into_a_cell_and_dropped() {
        val app = Res.kotlinDir("OutageApp.kt").readText().substringAfter("graph.locateSpot = {").substringBefore("\n    }\n")
        assertTrue(app.contains("LocationSource.readOnce"))
        assertTrue(app.contains("Spot.resolve"))
        // Only the chosen cell is saved; a mocked position or a sample cell is never stored from first run.
        assertTrue(app.contains("saveSpot(push, choice, null)"))
        assertTrue(app.contains("choice.needsConfirm"))
        assertTrue(app.contains("!Spot.isRealCell(choice.cell)"))
    }
}
