package app.outage.map

import app.outage.places.LagosStates
import app.outage.places.Places
import app.outage.places.PlacesGeo
import java.io.File

/** The real bundled Lagos files, read from the fixtures the build copies into the app's assets. */
object LagosFixtures {
    val dir = File("../../../core/shared/fixtures/places")
    val places: Places by lazy { Places.parse(File(dir, "lagos-places.json").readText()) }
    val geo: PlacesGeo by lazy { PlacesGeo.parse(File(dir, "lagos-geo.json").readText()) }
    val statesText: String by lazy { File(dir, "lagos-states.json").readText() }
    val states: Map<String, CellState> by lazy { LagosStates.parse(statesText) }
    val data: LagosDemoData by lazy { LagosDemoData(places, geo, states) }
    fun demo(nowMs: Long = 1_700_000_000_000L): AreaMap = DemoAreaMap.build(nowMs, data)
}
