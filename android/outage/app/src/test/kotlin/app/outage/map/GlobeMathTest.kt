package app.outage.map

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import kotlin.math.abs

/** ADR 0051: the globe's maths, the same rules as web/ui/globe/globe.ts. GL1 to GL4. */
class GlobeMathTest {
    private val deg = GlobeCamera::deg

    @Test
    fun GL1_the_point_under_the_camera_is_the_centre_and_faces_us() {
        val cam = GlobeCamera(deg(6.5), deg(3.4), 300.0)
        val p = cam.project(deg(6.5), deg(3.4), 200.0, 400.0)
        assertEquals(200.0, p.x, 1e-9)
        assertEquals(400.0, p.y, 1e-9)
        assertEquals(1.0, p.facing, 1e-9)
    }

    @Test
    fun GL1_the_far_side_is_hidden_and_north_is_up() {
        val cam = GlobeCamera(0.0, 0.0, 100.0)
        assertFalse(cam.project(0.0, deg(180.0), 0.0, 0.0).visible)
        assertTrue(cam.project(deg(10.0), 0.0, 0.0, 0.0).y < 0) // north is above the centre on screen
        assertTrue(cam.project(0.0, deg(10.0), 0.0, 0.0).x > 0) // east is to the right
    }

    @Test
    fun GL2_a_flight_starts_and_ends_on_its_cameras_and_goes_the_short_way() {
        val from = GlobeCamera(deg(10.0), deg(170.0), 150.0)
        val to = GlobeCamera(deg(6.5), deg(-170.0), 400_000.0)
        val f = GlobeFlight(from, to)
        assertEquals(from.radiusPx, f.at(0.0).radiusPx, 1e-6)
        assertEquals(to.radiusPx, f.at(1.0).radiusPx, 1e-3)
        // 170 to -170 is 20 degrees east across the date line, not 340 west.
        assertEquals(deg(190.0), f.at(1.0).lon, 1e-9)
        for (i in 0..20) assertTrue(abs(f.at(i / 20.0).lon - from.lon) <= deg(20.0) + 1e-9)
    }

    @Test
    fun GL3_taps_hit_the_block_they_are_in() {
        val xs = doubleArrayOf(0.0, 10.0, 10.0, 0.0)
        val ys = doubleArrayOf(0.0, 0.0, 10.0, 10.0)
        assertTrue(GlobeMath.inside(5.0, 5.0, xs, ys))
        assertFalse(GlobeMath.inside(15.0, 5.0, xs, ys))
    }

    @Test
    fun GL3_drag_pans_and_never_tips_over_the_pole() {
        val cam = GlobeCamera(0.0, 0.0, 100.0)
        assertEquals(-0.5, cam.dragBy(50.0, 0.0).lon, 1e-9)
        assertEquals(GlobeCamera.MAX_TILT, cam.dragBy(0.0, 1_000.0).lat, 1e-9)
    }

    @Test
    fun GL4_land_dots_fade_out_at_street_level_and_the_data_is_shared_with_the_web() {
        assertEquals(1.0, GlobeMath.dotFade(1.0), 1e-9)
        assertEquals(0.0, GlobeMath.dotFade(100.0), 1e-9)
        val gradle = File("build.gradle.kts").readText()
        assertTrue(gradle.contains("../../../core/shared/geo"))
        val web = File("../../../web/ui/globe/globe.ts").readText()
        assertTrue(web.contains("@outage/shared/geo/land-dots.json"))
    }
}
