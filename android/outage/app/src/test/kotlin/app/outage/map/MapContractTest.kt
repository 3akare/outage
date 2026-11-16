package app.outage.map

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * spec app-map-insights task 1: the Worker (Vitest `map-json.test.ts`) and the app both read
 * `core/shared/fixtures/map/map.json`, so the parser cannot drift from the route's shape.
 */
class MapContractTest {
    private val text = File("../../../core/shared/fixtures/map/map.json").readText()

    @Test
    fun the_shared_fixture_parses_with_every_state_the_worker_emits() {
        val map = AreaMapParser.parse(text)
        assertEquals("lagos", map.city)
        assertFalse(map.simulated)
        assertEquals(7, map.cells.size)
        assertEquals(
            setOf(CellState.CONFIRMED, CellState.RESTORED, CellState.NORMAL, CellState.NO_DATA),
            map.cells.map { it.state }.toSet(),
        )
        assertTrue(map.cells.all { it.ring.size == 6 })
        assertNotNull(map.area("yaba"))
    }

    @Test
    fun a_no_data_cell_in_the_fixture_has_no_times_and_no_history() {
        val noData = AreaMapParser.parse(text).cells.filter { it.state == CellState.NO_DATA }
        assertTrue(noData.isNotEmpty())
        for (c in noData) {
            assertNull(c.sinceMs)
            assertNull(c.restoredMs)
            assertTrue(c.history.isEmpty())
        }
    }
}
