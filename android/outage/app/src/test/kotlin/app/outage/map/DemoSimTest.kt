package app.outage.map

import app.outage.demo.ReplayParser
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/** The LGA > ward > block choice and the shared state that drives both the Map tab and the Now tab in demo mode. */
class DemoSimTest {
    private val places = LagosFixtures.places
    private val sim = BlackoutSim(places, LagosFixtures.geo)
    private val replay = ReplayParser.parse(File("../../../core/shared/fixtures/replay.json").readText())

    @Test fun nothingIsChosenUntilALocalGovernmentIs() {
        assertTrue(DemoPick().target(sim).isEmpty())
        assertEquals(places.lga("ikeja")!!.cells.toSet(), DemoPick(lga = "ikeja").target(sim).toSet())
    }

    @Test fun pickingAWardGivesItsBlocksAndABlockGivesItAndItsNeighbours() {
        val ward = DemoPick().withLga("ikeja").withWard("ikeja-akiode")
        assertEquals(6, ward.target(sim).size)
        assertEquals(places.ward("ikeja-akiode")!!.cells.size, ward.blocks(places).size)
        val block = ward.withCell("88588266b7fffff")
        val t = block.target(sim)
        assertEquals("88588266b7fffff", t[0])
        assertEquals(sim.targetBlocks("ikeja-akiode", "88588266b7fffff"), t)
        assertTrue(t.size > 1)
    }

    @Test fun changingTheLgaClearsTheWardAndBlockAndChangingTheWardClearsTheBlock() {
        val p = DemoPick("ikeja", "ikeja-akiode", "88588266b7fffff")
        assertNull(p.withWard("ikeja-oke-ira").cell)
        val other = p.withLga("surulere")
        assertNull(other.ward)
        assertNull(other.cell)
        assertEquals(places.lga("ikeja")!!.wardSlugs.size, DemoPick(lga = "ikeja").wards(places).size)
        assertNull(p.withWard("").ward)
    }

    @Test fun theNowStateFollowsTheReplayOnTheChosenBlocks() = runBlocking {
        val s = DemoSim()
        val blocks = DemoPick(lga = "ikeja", ward = "ikeja-akiode").target(sim)
        s.use(DemoPick(lga = "ikeja", ward = "ikeja-akiode"), blocks, "Akiode")
        assertTrue(s.state.value.chosen)
        assertTrue(s.state.value.pending)
        assertEquals(CellState.NORMAL, s.state.value.state)
        val seen = ArrayList<CellState>()
        s.run(replay, blocks, "Akiode") { seen.add(s.state.value.state) }
        // The first block's state, which is the Now answer, went through an outage and ended where the replay ends.
        assertTrue(CellState.CONFIRMED in seen || CellState.POSSIBLE in seen)
        val end = BlackoutSim.stateOf(replay.frames.last().state)
        assertEquals(end, s.state.value.state)
        assertEquals(BlackoutSim.spread(blocks, end), s.state.value.overlay)
        assertTrue(s.state.value.ranOnce)
        assertFalse(s.state.value.running)
        assertEquals("Akiode", s.state.value.name)
    }

    @Test fun runningNeedsBlocksAndUsingANewPlaceClearsTheOldReplay() = runBlocking {
        val s = DemoSim()
        s.run(replay, emptyList(), null) { }
        assertFalse(s.state.value.chosen)
        s.run(replay, listOf("88588266b7fffff"), "x") { }
        assertTrue(s.state.value.ranOnce)
        s.use(DemoPick(lga = "ikeja"), listOf("a"), "Ikeja")
        assertTrue(s.state.value.overlay.isEmpty())
        assertFalse(s.state.value.ranOnce)
        s.consumePending()
        assertFalse(s.state.value.pending)
    }
}
