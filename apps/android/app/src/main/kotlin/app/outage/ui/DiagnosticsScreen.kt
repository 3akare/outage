package app.outage.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import app.outage.R

/** Settings "diagnostics": one switch for the daily anonymous diagnostics upload (field-telemetry R1.1, R1.4). Off by default. */
@Composable
fun DiagnosticsScreen(isOn: () -> Boolean, setOn: (Boolean) -> Unit) {
    var on by remember { mutableStateOf(isOn()) }
    Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(stringResource(R.string.settings_diagnostics), style = MaterialTheme.typography.headlineSmall)
        SwitchRow(R.string.diag_switch, on) { on = it; setOn(it) }
        Text(stringResource(R.string.diag_body), style = MaterialTheme.typography.bodyMedium)
    }
}
