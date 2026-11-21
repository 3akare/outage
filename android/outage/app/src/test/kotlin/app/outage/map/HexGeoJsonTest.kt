package app.outage.map

import app.outage.onboarding.MiniJson
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** ADR 0053: the hex grid handed to MapLibre is valid GeoJSON with [lng, lat] positions, closed rings and the drawn state. */
class HexGeoJsonTest {
    private val map = LagosFixtures.demo(1_000_000L)
    private val spotId = map.areas.first { it.slug == "ikeja" }.centreCell

    @Suppress("UNCHECKED_CAST")
    private fun features(json: String) = (MiniJson.parse(json) as Map<String, Any?>)["features"] as List<Map<String, Any?>>

    @Test
    fun everyDemoCellBecomesOneClosedPolygonInLngLatOrder() {
        val fs = features(HexGeoJson.cells(map.cells, emptyMap(), spotId))
        assertEquals(map.cells.size, fs.size)
        for ((f, c) in fs.zip(map.cells)) {
            @Suppress("UNCHECKED_CAST")
            val ring = ((f["geometry"] as Map<String, Any?>)["coordinates"] as List<List<List<Double>>>)[0]
            assertEquals(c.ring.size + 1, ring.size)
            assertEquals(ring.first(), ring.last())
            // Lagos is about 3.4 E, 6.5 N: longitude first.
            assertEquals(c.ring[0].lng, ring[0][0], 1e-6)
            assertEquals(c.ring[0].lat, ring[0][1], 1e-6)
            assertTrue(ring.all { it[0] in 2.6..4.5 && it[1] in 6.2..6.8 })
        }
    }

    @Test
    fun propertiesCarryIdAreaStateAndSpot() {
        val yaba = map.cell(spotId)!!
        val fs = features(HexGeoJson.cells(listOf(yaba), mapOf(yaba.id to CellState.CONFIRMED), yaba.id))
        @Suppress("UNCHECKED_CAST")
        val p = fs.single()["properties"] as Map<String, Any?>
        assertEquals(yaba.id, p[HexGeoJson.PROP_ID])
        assertEquals("ikeja", p[HexGeoJson.PROP_AREA])
        assertEquals("CONFIRMED", p[HexGeoJson.PROP_STATE])
        assertEquals(true, p[HexGeoJson.PROP_SPOT])
    }

    @Test
    fun cellsWithoutARingAreLeftOutAndQuotesAreEscaped() {
        val odd = MapCell("a\"b", "x\\y", CellState.NORMAL, null, null, emptyList(), listOf(LatLng(6.5, 3.4), LatLng(6.51, 3.41), LatLng(6.5, 3.42)))
        val none = odd.copy(id = "empty", ring = emptyList())
        val fs = features(HexGeoJson.cells(listOf(odd, none), emptyMap(), null))
        @Suppress("UNCHECKED_CAST")
        assertEquals("a\"b", (fs.single()["properties"] as Map<String, Any?>)["id"])
    }

    @Test
    fun spotPointIsLngLatOrEmpty() {
        assertEquals(0, features(HexGeoJson.point(null)).size)
        @Suppress("UNCHECKED_CAST")
        val g = features(HexGeoJson.point(LatLng(6.5068, 3.3755))).single()["geometry"] as Map<String, Any?>
        assertEquals(listOf(3.3755, 6.5068), g["coordinates"])
    }
}
