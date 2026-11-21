package app.outage.ui

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import app.outage.R
import app.outage.places.PlacePick

/** The spot as the screen sees it: the cell and "Ward, LGA". Never a coordinate, never a postcode. */
data class SpotState(val cell: String?, val areaName: String?, val needsRepick: Boolean = false)

/**
 * Settings, "Your spot" and the Now row "Choose your area" (ADR 0056). The spot is picked by local government and ward in
 * [PlacePicker], the same steps as first run; no location is read. [save] stores the cell and its name only. [below] is the
 * follow section, shown under the spot.
 */
@Composable
fun SpotScreen(
    current: () -> SpotState,
    save: (PlacePick) -> Boolean,
    below: @Composable (SpotState) -> Unit,
) {
    var spot by remember { mutableStateOf(current()) }
    var picking by rememberSaveable { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }
    val failed = stringResource(R.string.place_save_failed)

    if (picking) {
        PlacePicker(
            onPicked = { pick ->
                if (save(pick)) {
                    spot = current()
                    message = null
                    picking = false
                } else message = failed
            },
            onExit = { picking = false },
        )
        return
    }

    FeaturePage(R.string.spot_title) {
        DayCard {
            DayRow(
                when {
                    spot.cell == null -> stringResource(R.string.spot_none)
                    spot.areaName != null -> spot.areaName!!
                    else -> stringResource(R.string.spot_current_unnamed)
                },
                subtitle = if (spot.cell != null && spot.areaName != null) stringResource(R.string.spot_current_label) else null,
                tile = R.drawable.ic_sym_place to Tokens.Colors.tileBlue,
            )
        }
        if (spot.needsRepick) GroupFooter(stringResource(R.string.spot_repick))
        message?.let { GroupFooter(it) }
        Gap(12.dp)
        ActionStack {
            InkButton(
                stringResource(if (spot.cell == null || spot.needsRepick) R.string.spot_choose else R.string.spot_change),
                onClick = { message = null; picking = true },
                modifier = Modifier.fillMaxWidth(),
            )
        }
        GroupFooter(stringResource(R.string.spot_privacy))
        Gap(8.dp)
        below(spot)
    }
}
