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
    fun MD4_first_run_asks_only_notifications_and_picks_the_area_by_lga_and_ward() {
        val firstRun = ui("CommonScreens.kt").substringAfter("fun FirstRunScreen(")
        val asked = Regex("""Manifest\.permission\.(\w+)""").findAll(firstRun).map { it.groupValues[1] }.toSet()
        assertEquals(setOf("POST_NOTIFICATIONS"), asked)
        // ADR 0056: the spot comes from the LGA and ward picker, never from a position.
        assertTrue(firstRun.contains("PlacePicker("))
        // "Not now" exists, so the area question never blocks the first look.
        assertTrue(firstRun.contains("R.string.first_run_not_now"))
    }

    @Test
    fun MD4_no_location_is_read_anywhere() {
        val manifest = java.io.File("src/main/AndroidManifest.xml").readText()
        assertFalse(manifest.contains("LOCATION\""))
        val sources = Res.kotlinDir("").walkTopDown().filter { it.extension == "kt" }.map { it.readText() }.joinToString("\n")
        for (bad in listOf("LocationManager", "ACCESS_COARSE_LOCATION", "ACCESS_FINE_LOCATION", "FusedLocation", "getLastKnownLocation")) {
            assertFalse(bad, sources.contains(bad))
        }
        // The spot is saved as the cell and "Ward, LGA" only: no postcode reaches the store.
        val app = Res.kotlinDir("OutageApp.kt").readText().substringAfter("private fun saveSpot(").substringBefore("\n    }\n")
        assertTrue(app.contains("flow.changeSpot(pick.cell, pick.areaName, null)"))
    }
}
