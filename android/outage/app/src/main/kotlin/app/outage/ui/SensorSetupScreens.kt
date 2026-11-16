package app.outage.ui

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
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
    FeaturePage(R.string.setup_battery_title) {
        DayCard {
            CheckRow(stringResource(if (exempt) R.string.alarm_check_battery_ok else R.string.alarm_check_battery_off), exempt)
        }
        Gap()
        ActionStack {
            InkButton(stringResource(R.string.battery_allow_button), { ctx.startActivity(exemptionIntent(ctx)); exempt = isExempt(ctx) }, Modifier.fillMaxWidth())
        }
        if (maker != null) {
            GroupHeader(
                if (maker.label == GuideLabel.VERIFIED) stringResource(R.string.battery_verified_steps, maker.name)
                else stringResource(R.string.battery_general_steps),
            )
            maker.stepGroups.forEach { g ->
                Gap(4.dp)
                DayCard(padding = 20.dp) {
                    Text(g.title, style = DayType.title3, color = Day.ink, modifier = Modifier.padding(bottom = 10.dp))
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        g.steps.forEachIndexed { i, s -> StepLine(i + 1, s) }
                    }
                }
                Gap(8.dp)
            }
        }
    }
}

/** One numbered step: the number in a small grey disc, then the words. */
@Composable
private fun StepLine(n: Int, text: String) {
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Box(Modifier.size(24.dp).clip(CircleShape).background(Day.fill), contentAlignment = Alignment.Center) {
            Text(n.toString(), style = DayType.caption.copy(fontFeatureSettings = "tnum"), color = Day.ink)
        }
        Text(text, style = DayType.callout, color = Day.ink2, modifier = Modifier.weight(1f))
    }
}

/** Settings "sensor": one switch. Off stops the sensor and keeps it off across app opens. */
@Composable
fun SensorToggleScreen(isOn: () -> Boolean, setOn: (Boolean) -> Unit) {
    var on by remember { mutableStateOf(isOn()) }
    FeaturePage(R.string.settings_sensor) {
        DayCard {
            SwitchRow(R.string.sensor_toggle_label, on, R.drawable.ic_sym_bolt to Tokens.Colors.tileGreen) { on = it; setOn(it) }
        }
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
