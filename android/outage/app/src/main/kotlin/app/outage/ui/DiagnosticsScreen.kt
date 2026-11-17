package app.outage.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.res.stringResource
import app.outage.R

/** Settings "diagnostics": one switch for the daily anonymous diagnostics upload (field-telemetry R1.1, R1.4). Off by default. */
@Composable
fun DiagnosticsScreen(isOn: () -> Boolean, setOn: (Boolean) -> Unit) {
    var on by remember { mutableStateOf(isOn()) }
    FeaturePage(R.string.settings_diagnostics) {
        DayCard {
            SwitchRow(R.string.diag_switch, on, R.drawable.ic_sym_chart to Tokens.Colors.tileIndigo) { on = it; setOn(it) }
        }
        GroupFooter(stringResource(R.string.diag_body))
    }
}
