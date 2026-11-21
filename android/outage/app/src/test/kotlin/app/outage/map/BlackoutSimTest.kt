package app.outage.map

import app.outage.demo.ReplayFrame
import app.outage.demo.ReplayParser
import app.outage.places.LagosStates
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/** The Map tab's simulated blackout and the Lagos opening view, matched to the website (web/public/js/places.js, app.js). */
class BlackoutSimTest {
    private val sim = BlackoutSim(LagosFixtures.places, LagosFixtures.geo)

    // Expected sets were taken from the website's targetBlocks (buildPlaces + targetBlocks on the same places).
    @Test fun anLgaGetsAllItsBlocksStartingNearItsMiddle() {
        val t = sim.targetBlocks("ikeja")
        assertEquals(71, t.size)
        assertEquals(LagosFixtures.places.lga("ikeja")!!.cells.toSet(), t.toSet())
        assertEquals("88588264e3fffff", t[0])
        assertSortedByDistanceFromTheFirst(t)
    }

    @Test fun aWardGetsItsOwnBlocks() {
        val t = sim.targetBlocks("ikeja-akiode")
        assertEquals(6, t.size)
        assertEquals("88588266b7fffff", t[0])
        assertEquals(
            setOf("88588264cbfffff", "88588264ddfffff", "88588266b1fffff", "88588266b3fffff", "88588266b5fffff", "88588266b7fffff"), t.toSet(),
        )
        assertSortedByDistanceFromTheFirst(t)
    }

    @Test fun aBlockGetsItselfAndTheBlocksNextDoor() {
        val t = sim.targetBlocks("ikeja", "8858826489fffff")
        assertEquals(7, t.size)
        assertEquals("8858826489fffff", t[0])
        assertEquals(setOf("8858826481fffff", "885882648bfffff", "885882648dfffff", "88588264c3fffff", "88588264c7fffff", "88588264d5fffff"), t.drop(1).toSet())
        assertSortedByDistanceFromTheFirst(t)
        assertTrue(t.drop(1).all { it in LagosFixtures.geo.cells })
    }

    private fun assertSortedByDistanceFromTheFirst(t: List<String>) {
        val c = LagosFixtures.geo.centre(t[0])!!
        val d = t.drop(1).map { LagosFixtures.geo.centre(it)!!.let { p -> Math.hypot(p.lat - c.lat, (p.lng - c.lng) * Math.cos(Math.toRadians(c.lat))) } }
        assertEquals(d.sorted(), d)
    }

    @Test fun anUnknownPlaceGivesNothing() {
        assertTrue(sim.targetBlocks("nowhere").isEmpty())
        assertTrue(sim.neighbours("not-a-cell").isEmpty())
    }

    @Test fun possibleSpreadsToTwoNeighboursAndTheRestStayOn() {
        val blocks = listOf("a", "b", "c", "d", "e")
        assertEquals(
            mapOf("a" to CellState.POSSIBLE, "b" to CellState.POSSIBLE, "c" to CellState.POSSIBLE, "d" to CellState.NORMAL, "e" to CellState.NORMAL),
            BlackoutSim.spread(blocks, CellState.POSSIBLE),
        )
        assertTrue(BlackoutSim.spread(blocks, CellState.CONFIRMED).values.all { it == CellState.CONFIRMED })
        assertEquals(emptyMap<String, CellState>(), BlackoutSim.spread(emptyList(), CellState.CONFIRMED))
    }

    @Test fun theReplayStartsAtTheFirstBusyFrameAndFollowsTheWebsitePacing() {
        val replay = ReplayParser.parse(File("../../../core/shared/fixtures/replay.json").readText())
        val first = BlackoutSim.firstFrame(replay)
        assertTrue(first >= 0)
        assertTrue(BlackoutSim.stateOf(replay.frames[first].state) in listOf(CellState.POSSIBLE, CellState.CONFIRMED))
        assertEquals(CellState.NORMAL, BlackoutSim.stateOf("SPOT_ONLY"))
        for (i in 0 until replay.frames.size - 1) assertTrue(BlackoutSim.gapMs(replay.frames[i], replay.frames[i + 1]) in 420L..2600L)
        val a = ReplayFrame(0, "NORMAL", emptyList(), null)
        assertEquals(2600L, BlackoutSim.gapMs(a, a.copy(tMs = 9000)))
        assertEquals(420L, BlackoutSim.gapMs(a, a.copy(tMs = 100)))
        assertEquals(900L, BlackoutSim.gapMs(a.copy(state = "POSSIBLE"), a.copy(tMs = 100)))
    }

    @Test fun theSharedStatesFileHasEveryLagosBlockAndAllTheStates() {
        val states = LagosStates.parse(LagosFixtures.statesText)
        assertEquals(4968, states.size)
        assertEquals(LagosFixtures.geo.cells.keys, states.keys)
        assertEquals(CellState.values().toSet(), states.values.toSet())
    }

    @Test fun theMapOpensOnLagosAndEveryLgaCornerIsInsideTheBox() {
        for (p in LagosFixtures.geo.lagosCorners()) assertTrue("$p outside LAGOS_BOUNDS", LAGOS_BOUNDS.contains(p))
        assertEquals(LAGOS_BOUNDS.corners().size, 4)
        assertTrue(LAGOS_BOUNDS.contains(LAGOS_BOUNDS.centre))
        // Lagos is about 1.7 degrees wide; at zoom 7 or higher the world cannot show.
        assertTrue(LAGOS_MIN_ZOOM >= 7.0)
        assertEquals(2.7, LAGOS_BOUNDS.west, 0.0)
        assertEquals(4.37, LAGOS_BOUNDS.east, 0.0)
        assertEquals(6.36, LAGOS_BOUNDS.south, 0.0)
        assertEquals(6.71, LAGOS_BOUNDS.north, 0.0)
    }

    @Test fun theBuildCopiesTheStatesFileAndTheMapSetsItsCameraBeforeTheStyleLoads() {
        val gradle = File("build.gradle.kts").readText()
        assertTrue(gradle.contains("lagos-states.json"))
        val map = File("src/main/kotlin/app/outage/ui/OutageMap.kt").readText()
        assertTrue(map.contains(".camera(") && map.contains("minZoomPreference(LAGOS_MIN_ZOOM)"))
        // Every state of the Map tab keeps the map on screen: loading and nothing-to-show use the map placeholder, not text only.
        val screen = File("src/main/kotlin/app/outage/ui/MapScreen.kt").readText()
        assertTrue(screen.contains("null -> MapPlaceholder(") && screen.contains("MapResult.Empty -> MapPlaceholder("))
    }
}
