package app.outage.map

import java.util.Random
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** spec app-map-insights properties AM1 to AM4 and the demo map rules (R1, R2, R5). */
class MapTest {
    private val ring = "[[6.51,3.37],[6.51,3.38],[6.52,3.385],[6.53,3.38],[6.53,3.37],[6.52,3.365]]"

    private fun json(vararg cells: String) =
        """{"city":"lagos","generatedMs":1000,"simulated":false,
          "areas":[{"slug":"yaba","name":"Yaba","centreCell":"a","cells":["a","b","c"]}],
          "cells":[${cells.joinToString(",")}]}"""

    private fun cell(id: String, state: String, extra: String = "") =
        """{"id":"$id","area":"yaba","state":"$state","sinceMs":500,"restoredMs":null,
            "history30d":[{"startMs":1,"endMs":2,"level":"CONFIRMED"}],"ring":$ring$extra}"""

    @Test
    fun parser_reads_cells_areas_and_history() {
        val m = AreaMapParser.parse(json(cell("a", "CONFIRMED"), cell("b", "NORMAL")))
        assertEquals("lagos", m.city)
        assertEquals(1000L, m.generatedMs)
        assertFalse(m.simulated)
        assertEquals("Yaba", m.area("yaba")!!.name)
        val a = m.cell("a")!!
        assertEquals(CellState.CONFIRMED, a.state)
        assertEquals(500L, a.sinceMs)
        assertEquals(6, a.ring.size)
        assertEquals(1, a.history.size)
        assertEquals(CellState.CONFIRMED, a.history[0].level)
    }

    @Test
    fun am1_floor_a_cell_under_three_phones_is_no_data_with_no_details() {
        val m = AreaMapParser.parse(json(cell("a", "CONFIRMED", ""","members":2"""), cell("b", "CONFIRMED", ""","members":3""")))
        val a = m.cell("a")!!
        assertEquals(CellState.NO_DATA, a.state)
        assertNull(a.sinceMs)
        assertTrue(a.history.isEmpty())
        assertEquals(CellState.CONFIRMED, m.cell("b")!!.state)
        assertEquals(CellState.NO_DATA, CellStates.withFloor(CellState.NORMAL, 0))
        assertEquals(CellState.NORMAL, CellStates.withFloor(CellState.NORMAL, null))
    }

    @Test
    fun am1_model_has_no_count_field() {
        val names = MapCell::class.java.declaredFields.map { it.name.lowercase() }
        assertTrue(names.none { it.contains("member") || it.contains("count") || it.contains("device") })
    }

    @Test
    fun parser_unknown_state_is_no_data_and_bad_shape_is_null() {
        assertEquals(CellState.NO_DATA, AreaMapParser.parse(json(cell("a", "WEIRD"))).cell("a")!!.state)
        assertNull(AreaMapParser.parseOrNull("{}"))
        assertNull(AreaMapParser.parseOrNull("not json"))
        assertNull(AreaMapParser.parseOrNull(json("""{"id":"a","area":"yaba","state":"NORMAL","ring":[[1.0,2.0]]}""")))
    }

    @Test
    fun restored_returns_to_normal_after_24_hours() {
        val c = MapCell("a", "yaba", CellState.RESTORED, null, 1_000L, emptyList(), emptyList())
        assertEquals(CellState.RESTORED, CellStates.effective(c, 1_000L + CellStates.RESTORED_HOLD_MS - 1))
        assertEquals(CellState.NORMAL, CellStates.effective(c, 1_000L + CellStates.RESTORED_HOLD_MS))
    }

    @Test
    fun projection_round_trip() {
        val p = MapProjection(6.5158, 3.3711)
        val rnd = Random(1)
        repeat(200) {
            val ll = LatLng(6.4 + rnd.nextDouble() * 0.2, 3.2 + rnd.nextDouble() * 0.3)
            val back = p.unproject(p.project(ll))
            assertEquals(ll.lat, back.lat, 1e-9)
            assertEquals(ll.lng, back.lng, 1e-9)
        }
        val o = p.project(LatLng(6.5158, 3.3711))
        assertEquals(0.0, o.x, 1e-12)
        assertEquals(0.0, o.y, 1e-12)
        // North is up: higher latitude gives smaller y. East is right.
        assertTrue(p.project(LatLng(6.6, 3.3711)).y < 0)
        assertTrue(p.project(LatLng(6.5158, 3.4)).x > 0)
    }

    private val map = DemoAreaMap.build(1_700_000_000_000L)
    private val grid = HexGrid.build(map)
    private val vp = MapViewport(grid.bounds!!, 1080.0, 1600.0)

    @Test
    fun am2_zoom_about_a_point_keeps_it_fixed_and_scale_in_bounds() {
        val rnd = Random(7)
        var t = MapTransform.fitTo(vp)
        repeat(500) {
            val cx = 200 + rnd.nextDouble() * 600
            val cy = 400 + rnd.nextDouble() * 800
            val before = t.toWorld(cx, cy)
            val f = 0.5 + rnd.nextDouble() * 1.5
            val next = t.zoomAbout(cx, cy, f, vp)
            assertTrue(next.scale >= vp.minScale - 1e-9 && next.scale <= vp.maxScale + 1e-9)
            val unclamped = next.scale == (t.scale * f)
            val after = next.toWorld(cx, cy)
            // The point stays fixed whenever the pan clamp did not have to move the map.
            if (unclamped && next == MapTransform(next.scale, cx - (cx - t.offsetX) * (next.scale / t.scale), cy - (cy - t.offsetY) * (next.scale / t.scale))) {
                assertEquals(before.x, after.x, 1e-6)
                assertEquals(before.y, after.y, 1e-6)
            }
            t = next
        }
    }

    @Test
    fun am2_zoom_fixed_point_exact_when_not_clamped() {
        val t = MapTransform.fitTo(vp)
        val c = vp.viewW / 2 to vp.viewH / 2
        val before = t.toWorld(c.first, c.second)
        val z = t.zoomAbout(c.first, c.second, 2.0, vp)
        val after = z.toWorld(c.first, c.second)
        assertEquals(before.x, after.x, 1e-6)
        assertEquals(before.y, after.y, 1e-6)
        assertEquals(t.scale * 2, z.scale, 1e-9)
    }

    @Test
    fun zoom_bounds_hold_for_extreme_factors() {
        val t = MapTransform.fitTo(vp)
        assertEquals(vp.maxScale, t.zoomAbout(10.0, 10.0, 1e9, vp).scale, 1e-9)
        assertEquals(vp.minScale, t.zoomAbout(10.0, 10.0, 1e-9, vp).scale, 1e-9)
    }

    @Test
    fun pan_is_clamped_so_the_map_stays_in_view() {
        val t = MapTransform.fitTo(vp).panBy(1e7, -1e7, vp)
        val centre = t.toWorld(vp.viewW / 2, vp.viewH / 2)
        val b = vp.bounds
        assertTrue(centre.x in b.minX..b.maxX)
        assertTrue(centre.y in b.minY..b.maxY)
        // A small pan is not clamped and moves by the drag amount.
        val start = MapTransform.fitTo(vp)
        val moved = start.panBy(5.0, -3.0, vp)
        assertEquals(start.offsetX + 5.0, moved.offsetX, 1e-9)
        assertEquals(start.offsetY - 3.0, moved.offsetY, 1e-9)
    }

    @Test
    fun am3_pan_then_recentre_returns_to_the_start() {
        val start = MapTransform.fitTo(vp)
        val moved = start.zoomAbout(300.0, 500.0, 3.0, vp).panBy(-120.0, 80.0, vp)
        assertTrue(moved != start)
        assertEquals(start, MapTransform.fitTo(vp))
        // Panning back by the same drag undoes an unclamped pan.
        val z = start.zoomAbout(540.0, 800.0, 2.0, vp)
        assertEquals(z, z.panBy(30.0, 20.0, vp).panBy(-30.0, -20.0, vp))
    }

    @Test
    fun focus_view_centres_on_the_spot() {
        val spot = grid.shape(map.area("yaba")!!.centreCell)!!.centre
        val t = MapTransform.focusOn(spot, 0.03, vp)
        val s = t.toScreen(spot)
        assertEquals(vp.viewW / 2, s.x, 1e-6)
        assertEquals(vp.viewH / 2, s.y, 1e-6)
    }

    @Test
    fun am4_hit_test_returns_the_cell_containing_the_point_or_none() {
        val b = grid.bounds!!
        val rnd = Random(42)
        var hits = 0
        var misses = 0
        repeat(2000) {
            val p = WorldPoint(b.minX - 0.01 + rnd.nextDouble() * (b.width + 0.02), b.minY - 0.01 + rnd.nextDouble() * (b.height + 0.02))
            val expected = grid.shapes.filter { it.contains(p) }.map { it.cell.id }
            val got = grid.hitTest(p)?.id
            if (got == null) { assertTrue(expected.isEmpty()); misses++ } else { assertTrue(got in expected); hits++ }
        }
        assertTrue(hits > 100 && misses > 10)
        grid.shapes.forEach { assertEquals(it.cell.id, grid.hitTest(it.centre)!!.id) }
        assertNull(grid.hitTest(WorldPoint(50.0, 50.0)))
    }

    @Test
    fun visible_set_follows_the_view() {
        assertEquals(grid.shapes.size, grid.visible(grid.bounds!!).size)
        val far = WorldBounds(100.0, 100.0, 101.0, 101.0)
        assertTrue(grid.visible(far).isEmpty())
        val one = grid.shapes[0].bounds
        assertNotNull(grid.visible(one).firstOrNull { it.cell.id == grid.shapes[0].cell.id })
    }

    @Test
    fun demo_map_is_simulated_mixed_and_about_twenty_cells() {
        assertTrue(map.simulated)
        assertTrue(map.cells.size in 18..24)
        assertTrue(map.cells.map { it.id }.all { it.startsWith("sim-") })
        assertEquals(map.cells.size, map.cells.map { it.id }.toSet().size)
        val states = map.cells.map { it.state }.toSet()
        assertEquals(CellState.values().toSet(), states)
        assertTrue(map.cells.all { it.ring.size == 6 })
        assertNotNull(map.area("yaba"))
        assertTrue(map.areas.all { a -> a.cellIds.all { map.cell(it) != null } && a.centreCell in a.cellIds })
        map.cells.filter { it.state == CellState.NO_DATA }.forEach { assertTrue(it.history.isEmpty() && it.sinceMs == null) }
    }

    @Test
    fun demo_hexes_tile_without_overlap() {
        // Neighbouring centres are about sqrt(3) * edge apart and no centre sits inside another hex.
        for (a in grid.shapes) for (b in grid.shapes) if (a !== b) assertFalse(a.contains(b.centre))
    }
}
