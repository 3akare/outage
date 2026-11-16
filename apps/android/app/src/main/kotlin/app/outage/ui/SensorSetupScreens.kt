package app.outage.ui

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import app.outage.R
import app.outage.onboarding.AssetOemGuide
import app.outage.onboarding.GuideLabel

/**
 * Battery setup (Settings, "battery"): the maker's steps from oem-guide.json and a button for the system exemption
 * prompt. https://developer.android.com/reference/android/provider/Settings#ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS
 */
@Composable
fun BatterySetupScreen() {
    val ctx = LocalContext.current
    val maker = remember { runCatching { AssetOemGuide.load(ctx).match(Build.MANUFACTURER, Build.BRAND) }.getOrNull() }
    var exempt by remember { mutableStateOf(isExempt(ctx)) }
    Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(stringResource(R.string.setup_battery_title), style = MaterialTheme.typography.headlineSmall)
        Text(stringResource(if (exempt) R.string.alarm_check_battery_ok else R.string.alarm_check_battery_off))
        Button(onClick = { ctx.startActivity(exemptionIntent(ctx)); exempt = isExempt(ctx) }, modifier = Modifier.heightIn(min = 48.dp)) {
            Text(stringResource(R.string.battery_allow_button))
        }
        if (maker != null) {
            Text(
                if (maker.label == GuideLabel.VERIFIED) stringResource(R.string.battery_verified_steps, maker.name)
                else stringResource(R.string.battery_general_steps),
                style = MaterialTheme.typography.bodyMedium,
            )
            maker.stepGroups.forEach { g ->
                Text(g.title, style = MaterialTheme.typography.titleMedium)
                g.steps.forEachIndexed { i, s -> Text(stringResource(R.string.battery_step_item, i + 1, s)) }
            }
        }
    }
}

/** Settings "sensor": one switch. Off stops the sensor and keeps it off across app opens. */
@Composable
fun SensorToggleScreen(isOn: () -> Boolean, setOn: (Boolean) -> Unit) {
    var on by remember { mutableStateOf(isOn()) }
    Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
        Text(stringResource(R.string.sensor_toggle_label), style = MaterialTheme.typography.bodyLarge)
        Switch(checked = on, onCheckedChange = { on = it; setOn(it) })
    }
}

private fun isExempt(ctx: Context): Boolean =
    (ctx.getSystemService(Context.POWER_SERVICE) as PowerManager).isIgnoringBatteryOptimizations(ctx.packageName)

/** The direct prompt needs REQUEST_IGNORE_BATTERY_OPTIMIZATIONS; the list screen needs nothing, so it is the fallback. */
private fun exemptionIntent(ctx: Context): Intent {
    val direct = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + ctx.packageName))
    val list = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
    val use = if (direct.resolveActivity(ctx.packageManager) != null) direct else list
    return use.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
}
