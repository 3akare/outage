package app.outage.onboarding

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Spot (onboarding R3, test O2, ADR 0056), the Alarm check list data and changeSpot after the first run. */
class SpotAndChecksTest {
    private val cellA = "88a5a9d8e1fffff"

    // O2: after any spot path nothing persisted holds a latitude or a longitude, only the cell.
    @Test fun O2_no_coordinates_stored() {
        val store = MemoryStore()
        val flow = OnboardingFlow.open(store, Gen.noneSet)
        assertTrue(flow.firstRun(1, 1000))
        assertTrue(flow.changeSpot(cellA, "Opebi, Ikeja", " LA11 "))
        assertEquals(cellA, store.load()!!.cell)
        assertEquals("Opebi, Ikeja", store.load()!!.areaName)
        assertEquals("LA11", store.load()!!.postcodePrefix)
        // The app saves no postcode at all (ADR 0056): a change with none clears the old prefix.
        assertTrue(flow.changeSpot(cellA, "Opebi, Ikeja", null))
        val saved = store.saved!!.values.joinToString("|")
        assertFalse(saved.contains("LA11"))
        assertFalse(Regex("\\d+\\.\\d{3,}").containsMatchIn(saved))
        // the first run stays finished
        assertTrue(store.load()!!.completed)
        assertEquals(OnboardingStep.FINISH, store.load()!!.step)
    }

    @Test fun changeSpotNeedsConsentAndARealCell() {
        val flow = OnboardingFlow.open(MemoryStore(), Gen.noneSet)
        assertFalse(flow.changeSpot(cellA, "Yaba", null))
        flow.firstRun(1, 1)
        assertFalse(flow.changeSpot("sim-0,0", null, null))
        assertTrue(flow.changeSpot(cellA, null, null))
    }

    @Test fun alarmCheckListsEveryFactAndHidesRegisteredWhenTrue() {
        val bad = AlarmCheckFacts(notificationsOk = false, volumeOk = false, fullScreenOk = false, batteryExempt = false, registered = false)
        val items = AlarmCheck.items(bad)
        assertEquals(listOf("notifications", "volume", "fullscreen", "battery", "registered"), items.map { it.key })
        assertTrue(items.none { it.ok })
        val good = AlarmCheck.items(bad.copy(true, true, true, true, true))
        assertEquals(listOf("notifications", "volume", "fullscreen", "battery"), good.map { it.key })
        assertTrue(good.all { it.ok })
        assertFalse(AlarmCheck.canSound(bad))
        assertNotNull(AlarmCheck.toOnboardingFacts(bad))
        assertTrue(AlarmCheck.toOnboardingFacts(bad.copy(true, true, true, true)).allSet)
    }
}
