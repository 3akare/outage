package app.outage.map

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Test

/** The app's Lagos box must equal the website's LAGOS_BOUNDS in web/public/js/map.js. */
class LagosBoundsTest {
    @Test
    fun matches_the_web_box() {
        val js = File("../../../web/public/js/map.js").readText()
        val m = Regex("""LAGOS_BOUNDS = \[\[([\d.]+), ([\d.]+)\], \[([\d.]+), ([\d.]+)\]\]""").find(js)!!
        val (w, s, e, n) = m.destructured
        assertEquals(w.toDouble(), LAGOS_BOUNDS.west, 0.0)
        assertEquals(s.toDouble(), LAGOS_BOUNDS.south, 0.0)
        assertEquals(e.toDouble(), LAGOS_BOUNDS.east, 0.0)
        assertEquals(n.toDouble(), LAGOS_BOUNDS.north, 0.0)
    }
}
