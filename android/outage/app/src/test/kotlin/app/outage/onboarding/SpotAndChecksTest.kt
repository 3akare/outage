package app.outage.onboarding

import app.outage.map.AreaMap
import app.outage.map.CellState
import app.outage.map.LatLng
import app.outage.map.MapArea
import app.outage.map.MapCell
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Spot (onboarding R3, test O2), first-result-wins, the Alarm check list data and changeSpot after the first run. */
class SpotAndChecksTest {
    private val cellA = "88a5a9d8e1fffff"
    private val cellB = "88a5a9d8e3fffff"

    private fun hex(id: String, lat: Double, lng: Double): MapCell = MapCell(
        id, "yaba", CellState.NORMAL, null, null, emptyList(),
        (0 until 6).map { i ->
            val a = Math.toRadians(60.0 * i)
            LatLng(lat + 0.004 * Math.sin(a), lng + 0.004 * Math.cos(a))
        },
    )

    private val map: AreaMap = AreaMap(
        "lagos", 0L, false,
        listOf(MapArea("yaba", "Yaba", cellA, listOf(cellA, cellB))),
        listOf(hex(cellA, 6.5158, 3.3711), hex(cellB, 6.5158, 3.3711 + 0.0072)),
    )

    @Test fun positionInsideACellGivesThatCellAndItsAreaName() {
        val c = Spot.resolve(map, 6.5159, 3.3712, mocked = false)!!
        assertEquals(cellA, c.cell)
        assertEquals("Yaba", c.areaName)
        assertFalse(c.needsConfirm)
    }

    @Test fun mockedPositionAsksForConfirmation() {
        assertTrue(Spot.resolve(map, 6.5158, 3.3711, mocked = true)!!.needsConfirm)
    }

    @Test fun positionFarFromEveryCellGivesNull() {
        assertNull(Spot.resolve(map, 9.0, 7.0, mocked = false))
        assertNull(Spot.resolve(map, Double.NaN, 3.0, mocked = false))
    }

    @Test fun mapPickTakesOnlyKnownCells() {
        assertEquals(cellB, Spot.choose(map, cellB)!!.cell)
        assertNull(Spot.choose(map, "88ffffffffffff0"))
        assertEquals(2, Spot.cellsOf(map, "yaba").size)
        assertFalse(Spot.isRealCell("sim-0,0"))
    }

    // O2: after any spot path nothing persisted holds a latitude or a longitude, only the cell.
    @Test fun O2_no_coordinates_stored() {
        val store = MemoryStore()
        val flow = OnboardingFlow.open(store, Gen.noneSet)
        assertTrue(flow.firstRun(1, 1000))
        val choice = Spot.resolve(map, 6.51591234, 3.37121234, mocked = false)!!
        assertTrue(flow.changeSpot(choice.cell, choice.areaName, " 1001 "))
        val saved = store.saved!!.values.joinToString("|")
        assertFalse(saved.contains("6.5159"))
        assertFalse(saved.contains("3.3712"))
        assertEquals(cellA, store.load()!!.cell)
        assertEquals("1001", store.load()!!.postcodePrefix)
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

    @Test fun firstResultWins() {
        val r = FirstResult<Int>()
        assertNull(r.result())
        assertTrue(r.offer(1))
        assertFalse(r.offer(2))
        assertEquals(1, r.result())
        assertEquals(8_000L, FirstResult.TIMEOUT_MS)
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
