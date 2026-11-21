package app.outage.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import app.outage.R
import app.outage.demo.ReplayFile
import app.outage.map.BlackoutSim
import app.outage.map.CellState
import app.outage.map.DemoPick
import app.outage.map.DemoSimState
import app.outage.places.Places
import app.outage.places.PlacesGeo
import app.outage.shell.AreaStatus
import app.outage.shell.HomeUiState
import app.outage.shell.StatusLevel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** The recorded blackout replay while [enabled] (demo mode); null until read or when off. */
@Composable
fun rememberDemoReplay(enabled: Boolean): ReplayFile? {
    val context = LocalContext.current
    var replay by remember { mutableStateOf<ReplayFile?>(null) }
    LaunchedEffect(enabled) { if (enabled && replay == null) replay = withContext(Dispatchers.IO) { loadReplayAsset(context) } }
    return replay
}

/**
 * The website's "Where to simulate": local government, then ward, then block, then "Use this place". Picking works on [pick];
 * [onUse] gets the pick once a local government is chosen.
 */
@Composable
fun DemoPlacePicker(places: Places, pick: DemoPick, onPick: (DemoPick) -> Unit, onUse: () -> Unit, modifier: Modifier = Modifier) {
    val wards = remember(pick.lga, places) { pick.wards(places) }
    val blocks = remember(pick.ward, places) { pick.blocks(places) }
    Column(modifier, verticalArrangement = Arrangement.spacedBy(10.dp)) {
        PickField(
            stringResource(R.string.sim_lga_label, places.lgas.size), pick.lga?.let { places.lga(it)?.name }, stringResource(R.string.sim_choose_one),
            true, null, places.lgas.map { it.slug to it.name },
        ) { onPick(pick.withLga(it)) }
        PickField(
            if (pick.lga != null) stringResource(R.string.sim_ward_label_n, wards.size) else stringResource(R.string.sim_ward_label),
            pick.ward?.let { places.ward(it)?.name?.substringBefore(',') }, stringResource(R.string.sim_whole_lga),
            pick.lga != null, "", wards.map { it.slug to it.name.substringBefore(',') },
        ) { onPick(pick.withWard(it)) }
        PickField(
            if (pick.ward != null) stringResource(R.string.sim_block_label_n, blocks.size) else stringResource(R.string.sim_block_label),
            pick.cell?.let { c -> stringResource(R.string.sim_block_option, blocks.indexOf(c) + 1, blocks.size) }, stringResource(R.string.sim_whole_ward),
            pick.ward != null, "", blocks.mapIndexed { i, id -> id to stringResource(R.string.sim_block_option, i + 1, blocks.size) },
        ) { onPick(pick.withCell(it)) }
        InkButton(stringResource(R.string.sim_use_place), onUse, Modifier.fillMaxWidth(), enabled = pick.lga != null)
    }
}

/** One drop-down: a label over a field that opens a menu. [clearValue] adds the "whole ..." entry that clears the choice. */
@Composable
private fun PickField(label: String, value: String?, empty: String, enabled: Boolean, clearValue: String?, options: List<Pair<String, String>>, onChoose: (String) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(label, style = DayType.footnote, color = Day.muted)
        Box {
            Row(
                Modifier.fillMaxWidth().heightIn(min = 48.dp).clip(RoundedCornerShape(Tokens.cornerM)).background(Day.fill).clickable(enabled = enabled) { open = true }.padding(horizontal = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(value ?: empty, Modifier.weight(1f), style = DayType.body, color = if (enabled) Day.ink else Day.muted, maxLines = 1)
                Glyph(R.drawable.ic_sym_chevron, Day.muted, 18.dp)
            }
            DropdownMenu(open, { open = false }, Modifier.heightIn(max = 360.dp)) {
                if (clearValue != null) DropdownMenuItem({ Text(empty) }, { open = false; onChoose(clearValue) })
                for ((v, t) in options) DropdownMenuItem({ Text(t) }, { open = false; onChoose(v) })
            }
        }
    }
}

/** The target for the current pick, or empty before a local government is chosen. */
fun demoTarget(sim: BlackoutSim?, pick: DemoPick): List<String> = sim?.let(pick::target).orEmpty()

/** Whether the Now tab should answer for the simulated place (demo mode and a place chosen). */
fun showsSimulatedNow(demo: Boolean, s: DemoSimState): Boolean = demo && s.chosen

@Composable
fun rememberBlackoutSim(places: Places?, geo: PlacesGeo?): BlackoutSim? = remember(places, geo) { if (places != null && geo != null) BlackoutSim(places, geo) else null }

private fun levelOf(s: CellState): StatusLevel? = when (s) {
    CellState.NORMAL -> StatusLevel.NORMAL
    CellState.POSSIBLE -> StatusLevel.POSSIBLE
    CellState.CONFIRMED -> StatusLevel.CONFIRMED
    CellState.RESTORED -> StatusLevel.RESTORED
    CellState.NO_DATA -> null
}

/** The Now tab's state for the simulated place: the first block's state, marked simulated, fresh as of now. */
fun simulatedHome(real: HomeUiState, s: DemoSimState, nowMs: Long = System.currentTimeMillis()): HomeUiState =
    real.copy(area = levelOf(s.state)?.let { AreaStatus(it, nowMs, simulated = true) }, ageMinutes = 0, offline = false, simulated = true)

/** On the Now tab in demo mode: "Simulate a blackout" for the chosen place and the three drop-downs, like the website. */
@Composable
fun DemoNowControls(vm: DemoSimViewModel, sim: DemoSimState) {
    val places = rememberPlaces()
    val geo = rememberPlacesGeo()
    val replay = rememberDemoReplay(true)
    val blackoutSim = rememberBlackoutSim(places, geo)
    Gap(4.dp)
    if (sim.chosen && replay != null) {
        Column(Modifier.padding(horizontal = Gutter, vertical = 8.dp)) {
            InkButton(
                stringResource(if (sim.ranOnce) R.string.map_simulate_again else R.string.sim_blackout_now),
                { vm.start(replay, sim.blocks, sim.name) }, Modifier.fillMaxWidth(), enabled = !sim.running,
            )
        }
    }
    if (places != null) {
        GroupHeader(stringResource(R.string.sim_where))
        DayCard {
            DemoPlacePicker(places, sim.pick, { vm.sim.setPick(it) }, {
                val blocks = demoTarget(blackoutSim, sim.pick)
                if (blocks.isNotEmpty()) vm.sim.use(sim.pick, blocks, sim.pick.name(places))
            }, Modifier.padding(16.dp))
        }
    }
}
