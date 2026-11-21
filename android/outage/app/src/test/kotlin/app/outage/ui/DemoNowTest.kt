package app.outage.ui

import app.outage.map.CellState
import app.outage.map.DemoSimState
import app.outage.shell.HomeUiState
import app.outage.shell.StatusLevel
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** In demo mode the Now tab answers for the simulated place; in real mode it never does. */
class DemoNowTest {
    private val chosen = DemoSimState(blocks = listOf("a"), name = "Ikeja")

    @Test fun onlyDemoModeWithAChosenPlaceShowsTheSimulatedAnswer() {
        assertTrue(showsSimulatedNow(true, chosen))
        assertFalse(showsSimulatedNow(false, chosen))
        assertFalse(showsSimulatedNow(true, DemoSimState()))
    }

    @Test fun theNowStateIsTheFirstBlocksState() {
        for ((s, level) in listOf(CellState.NORMAL to StatusLevel.NORMAL, CellState.POSSIBLE to StatusLevel.POSSIBLE, CellState.CONFIRMED to StatusLevel.CONFIRMED, CellState.RESTORED to StatusLevel.RESTORED)) {
            val h = simulatedHome(HomeUiState.Initial, chosen.copy(state = s), 5L)
            assertEquals(level, h.area?.level)
            assertTrue(h.simulated)
            assertTrue(h.area!!.simulated)
        }
        assertNull(simulatedHome(HomeUiState.Initial, chosen.copy(state = CellState.NO_DATA)).area)
    }
}
