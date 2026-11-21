package app.outage.map

import app.outage.demo.ReplayFile
import app.outage.places.Places
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

/** The three drop-downs of the website's "Where to simulate": a local government, then a ward, then a block. Slugs and bare H3 ids. */
data class DemoPick(val lga: String? = null, val ward: String? = null, val cell: String? = null) {
    fun withLga(slug: String?) = DemoPick(slug?.ifEmpty { null })
    fun withWard(slug: String?) = copy(ward = slug?.ifEmpty { null }, cell = null)
    fun withCell(id: String?) = copy(cell = id?.ifEmpty { null })

    /** The place the blackout runs on, as web/public/js/app.js "usepick" passes it: the ward if set, else the LGA. */
    val slug: String? get() = ward ?: lga

    /** Wards of the chosen LGA, in the order of the places file (the web's second drop-down). */
    fun wards(places: Places) = lga?.let(places::wardsOf).orEmpty()

    /** Blocks of the chosen ward (the web's third drop-down). */
    fun blocks(places: Places) = ward?.let { places.ward(it)?.cells }.orEmpty()

    /** The blocks the blackout runs on; empty until a local government is chosen. */
    fun target(sim: BlackoutSim): List<String> = slug?.let { sim.targetBlocks(it, cell) }.orEmpty()

    /** The name shown on the Now tab for this pick. */
    fun name(places: Places): String? = when {
        ward != null -> places.ward(ward)?.let { w -> if (cell != null) w.name.substringBefore(',') + ", " + (places.lga(w.lgaSlug)?.name ?: "") else places.areaName(w) }
        lga != null -> places.lga(lga)?.name
        else -> null
    }
}

/**
 * What the chosen simulated place looks like right now, shared by the Map tab and the Now tab in demo mode. [blocks] are bare
 * H3 indexes (the spot first); [overlay] is what each shows while the replay runs; [state] is the first block's state, the Now answer.
 */
data class DemoSimState(
    val pick: DemoPick = DemoPick(),
    val blocks: List<String> = emptyList(),
    val name: String? = null,
    val state: CellState = CellState.NORMAL,
    val overlay: Map<String, CellState> = emptyMap(),
    val running: Boolean = false,
    val ranOnce: Boolean = false,
    /** True from "Use this place" until the Map tab has shown the choice on the map. */
    val pending: Boolean = false,
) {
    val chosen: Boolean get() = blocks.isNotEmpty()
}

/** The state holder behind [DemoSimState]. Pure Kotlin; the ViewModel owns the coroutine that calls [run]. */
class DemoSim {
    private val _state = MutableStateFlow(DemoSimState())
    val state: StateFlow<DemoSimState> = _state.asStateFlow()

    fun setPick(pick: DemoPick) = _state.update { it.copy(pick = pick) }

    /** "Use this place": remember the blocks and name, stop showing an old replay. */
    fun use(pick: DemoPick, blocks: List<String>, name: String?, baseline: CellState = CellState.NORMAL) =
        _state.update { DemoSimState(pick = pick, blocks = blocks, name = name, state = baseline, pending = blocks.isNotEmpty()) }

    fun consumePending() = _state.update { it.copy(pending = false) }

    /** Plays [replay] on [blocks]: the blocks go on, then follow the replay's frames, the first block's state is the Now answer. */
    suspend fun run(replay: ReplayFile, blocks: List<String>, name: String?, wait: suspend (Long) -> Unit = { delay(it) }) {
        if (blocks.isEmpty()) return
        _state.update { it.copy(blocks = blocks, name = name ?: it.name, overlay = BlackoutSim.spread(blocks, CellState.NORMAL), state = CellState.NORMAL, running = true, ranOnce = false, pending = false) }
        try {
            wait(1000)
            var i = BlackoutSim.firstFrame(replay).coerceAtLeast(0)
            while (i < replay.frames.size) {
                val s = BlackoutSim.stateOf(replay.frames[i].state)
                _state.update { it.copy(overlay = BlackoutSim.spread(blocks, s), state = s) }
                if (i + 1 < replay.frames.size) wait(BlackoutSim.gapMs(replay.frames[i], replay.frames[i + 1]))
                i++
            }
            _state.update { it.copy(ranOnce = true) }
        } finally {
            _state.update { it.copy(running = false) }
        }
    }
}
