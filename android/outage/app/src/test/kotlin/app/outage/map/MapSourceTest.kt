package app.outage.map

import app.outage.shell.Res
import app.outage.shell.StringPack
import java.io.File
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** spec app-map-insights AM5, AM6, label placement (R1.8, R4, R5, R6.2). */
class MapSourceTest {
    private class FakeCache : MapCache {
        var stored: Pair<String, Long>? = null
        var writes = 0
        override fun read() = stored
        override fun write(json: String, fetchedMs: Long) { stored = json to fetchedMs; writes++ }
        override fun clear() { stored = null }
    }

    private val ring = "[[6.51,3.37],[6.51,3.38],[6.52,3.385],[6.53,3.38],[6.53,3.37],[6.52,3.365]]"
    private fun json(simulated: Boolean) =
        """{"city":"lagos","generatedMs":1,"simulated":$simulated,"areas":[],
          "cells":[{"id":"a","area":"yaba","state":"NORMAL","ring":$ring}]}"""

    @Test
    fun am5_every_state_has_its_own_pattern_and_existing_strings() {
        val strings = StringPack.parse(Res.values())
        val styles = CellState.entries.map { CellStyle.of(it) }
        assertEquals(CellState.entries.size, styles.map { it.pattern }.toSet().size)
        for (s in styles) {
            assertTrue(s.labelName, strings.containsKey(s.labelName))
            assertTrue(s.describeName, strings.containsKey(s.describeName))
        }
    }

    @Test
    fun am6_a_simulated_map_never_writes_the_cache() = runBlocking {
        val cache = FakeCache()
        val src = NetAreaMapSource("https://x.test", cache) { json(simulated = true) }
        val r = src.load("lagos", 5L) as MapResult.Loaded
        assertTrue(r.load.map.simulated)
        assertEquals(0, cache.writes)
        assertNull(cache.stored)
    }

    @Test
    fun real_map_is_cached_and_used_when_the_network_fails() = runBlocking {
        val cache = FakeCache()
        val ok = NetAreaMapSource("https://x.test/", cache) { url ->
            assertTrue(url, url.startsWith("https://x.test/api/map.json?city=lagos"))
            json(simulated = false)
        }
        val first = ok.load("lagos", 100L) as MapResult.Loaded
        assertFalse(first.load.fromCache)
        assertEquals(1, cache.writes)
        val down = NetAreaMapSource("https://x.test", cache) { null }
        val second = down.load("lagos", 900L) as MapResult.Loaded
        assertTrue(second.load.fromCache)
        assertEquals(100L, second.load.fetchedMs)
    }

    @Test
    fun bad_json_keeps_the_cache_and_never_throws() = runBlocking {
        val cache = FakeCache()
        cache.write(json(false), 7L)
        val r = NetAreaMapSource("https://x.test", cache) { "not json" }.load("lagos", 9L) as MapResult.Loaded
        assertTrue(r.load.fromCache)
        assertEquals(MapResult.Empty, NetAreaMapSource("https://x.test", FakeCache()) { throw IllegalStateException() }.load("lagos", 1L))
    }

    @Test
    fun demo_source_is_simulated_and_writes_nothing() = runBlocking {
        val r = DemoAreaMapSource().load("lagos", 1_000L) as MapResult.Loaded
        assertTrue(r.load.map.simulated)
        assertTrue(r.load.map.cell(r.load.spotCellId!!) != null)
    }

    @Test
    fun blank_api_base_chooses_demo() {
        assertTrue(AreaMapSources.choose("", FakeCache()) { null } is DemoAreaMapSource)
        assertTrue(AreaMapSources.choose("https://x.test", FakeCache()) { null } is NetAreaMapSource)
    }

    @Test
    fun file_cache_round_trips_and_clears() {
        val dir = File(System.getProperty("java.io.tmpdir"), "outage-map-cache-" + System.nanoTime())
        val c = FileMapCache(dir)
        assertNull(c.read())
        c.write("{}", 42L)
        assertEquals("{}" to 42L, c.read())
        c.clear()
        assertNull(c.read())
        dir.deleteRecursively()
    }

    @Test
    fun labels_that_overlap_or_leave_the_view_are_dropped_in_priority_order() {
        val boxes = listOf(
            LabelBox("a", 100.0, 100.0, 60.0, 14.0),
            LabelBox("b", 120.0, 105.0, 60.0, 14.0),
            LabelBox("c", 300.0, 100.0, 60.0, 14.0),
            LabelBox("d", 5.0, 5.0, 60.0, 14.0),
        )
        assertEquals(listOf("a", "c"), LabelPlacer.place(boxes, 400.0, 400.0).map { it.key })
    }
}
