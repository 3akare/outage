package app.outage.ui

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
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import app.outage.R
import app.outage.net.FollowPrefs
import app.outage.net.FollowResult
import app.outage.net.PushHost
import app.outage.net.PushKind
import app.outage.net.QuietWindow
import app.outage.sensor.PlugWatcher
import app.outage.sensor.Sensor
import app.outage.sensor.SelfTestResult

/**
 * Follow switch, push kinds and quiet hours (alerts-and-light-alarm R6.1, R6.2, R7). Shown under the spot. The
 * follow request carries the FCM token, the cell, the kinds and the quiet window to the Worker (R6.2). Without Firebase
 * config in the build, the switch explains that push is not set up; the Light Alarm is never involved.
 */
@Composable
fun FollowSection(spot: SpotState) {
    val ctx = LocalContext.current
    val host = remember { PushHost.get(ctx) }
    val saved = remember { host.store.read() }
    var on by remember { mutableStateOf(saved != null) }
    var confirmed by remember { mutableStateOf(saved?.kinds?.contains(PushKind.CONFIRMED) ?: true) }
    var restored by remember { mutableStateOf(saved?.kinds?.contains(PushKind.RESTORED) ?: true) }
    var quietOn by remember { mutableStateOf(saved?.quiet != null) }
    var start by remember { mutableStateOf(saved?.quiet?.startMin ?: 22 * 60) }
    var end by remember { mutableStateOf(saved?.quiet?.endMin ?: 6 * 60) }
    var status by remember { mutableStateOf<Int?>(null) }
    var working by remember { mutableStateOf(false) }

    fun apply(nextOn: Boolean = on) {
        val cell = spot.cell
        if (cell == null) { status = R.string.follow_need_spot; on = false; return }
        if (!nextOn) {
            working = true
            host.unfollow { r -> working = false; status = if (r == FollowResult.OK) R.string.follow_ok_saved else resultText(r) }
            return
        }
        val kinds = buildSet { if (confirmed) add(PushKind.CONFIRMED); if (restored) add(PushKind.RESTORED) }
        if (kinds.isEmpty()) { status = null; return }
        working = true
        host.follow(FollowPrefs(cell, kinds, if (quietOn) QuietWindow(start, end) else null)) { r ->
            working = false
            status = if (r == FollowResult.OK) R.string.follow_ok_saved else resultText(r)
            // A call that could not be made leaves the switch off so the screen never claims alerts that are not set up.
            if (r == FollowResult.NO_PUSH || r == FollowResult.NO_SERVER) on = false
        }
    }

    Column(Modifier.fillMaxWidth().padding(top = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(stringResource(R.string.follow_title), style = MaterialTheme.typography.titleLarge)
        SwitchRow(R.string.follow_switch, on) { on = it; apply(it) }
        if (on) {
            SwitchRow(R.string.follow_kind_confirmed, confirmed) { confirmed = it; apply() }
            SwitchRow(R.string.follow_kind_restored, restored) { restored = it; apply() }
            SwitchRow(R.string.follow_quiet_switch, quietOn) { quietOn = it; apply() }
            if (quietOn) {
                Text(stringResource(R.string.follow_quiet_hint), style = MaterialTheme.typography.bodyMedium)
                TimeRow(R.string.follow_quiet_from, QuietWindow.hhmm(start), { start = QuietWindow.shift(start, -QuietWindow.STEP_MIN); apply() }, { start = QuietWindow.shift(start, QuietWindow.STEP_MIN); apply() })
                TimeRow(R.string.follow_quiet_to, QuietWindow.hhmm(end), { end = QuietWindow.shift(end, -QuietWindow.STEP_MIN); apply() }, { end = QuietWindow.shift(end, QuietWindow.STEP_MIN); apply() })
            }
        }
        if (working) Text(stringResource(R.string.follow_working), style = MaterialTheme.typography.bodyMedium)
        status?.let { Text(stringResource(it), style = MaterialTheme.typography.bodyMedium) }
        Text(stringResource(R.string.follow_google_note), style = MaterialTheme.typography.bodySmall)
    }
}

private fun resultText(r: FollowResult): Int = when (r) {
    FollowResult.OK -> R.string.follow_ok_saved
    FollowResult.NO_PUSH -> R.string.follow_no_push
    FollowResult.NO_SERVER -> R.string.follow_no_server
    FollowResult.NOT_REGISTERED -> R.string.follow_not_registered
    FollowResult.NO_SPOT -> R.string.follow_need_spot
    FollowResult.RETRY -> R.string.follow_retry
    FollowResult.REJECTED -> R.string.follow_rejected
}

@Composable
private fun TimeRow(labelRes: Int, time: String, earlier: () -> Unit, later: () -> Unit) {
    Row(Modifier.fillMaxWidth().heightIn(min = 48.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(stringResource(labelRes, time), style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
        OutlinedButton(onClick = earlier, modifier = Modifier.heightIn(min = 48.dp)) { Text(stringResource(R.string.follow_earlier)) }
        OutlinedButton(onClick = later, modifier = Modifier.heightIn(min = 48.dp)) { Text(stringResource(R.string.follow_later)) }
    }
}

/**
 * Settings, "Charger test" (onboarding R8): unplug and replug while the screen is open. The sensor is put in self-test
 * mode, so nothing reaches the Outbox, the prompt or the alarm (O6). Three results are shown, as the spec asks.
 */
@Composable
fun SelfTestScreen() {
    val ctx = LocalContext.current
    var running by remember { mutableStateOf(false) }
    var result by remember { mutableStateOf<SelfTestResult?>(null) }
    val watcher = remember {
        PlugWatcher(ctx.applicationContext) { plug -> Sensor.peek()?.plugChanged(plug) }
    }
    DisposableEffect(Unit) { onDispose { if (running) { watcher.stop(); Thread { Sensor.peek()?.endSelfTest() }.start() } } }

    Column(
        Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(stringResource(R.string.selftest_title), style = MaterialTheme.typography.headlineSmall)
        Text(stringResource(R.string.selftest_intro), style = MaterialTheme.typography.bodyLarge)
        if (running) {
            Text(stringResource(R.string.selftest_step), style = MaterialTheme.typography.bodyLarge)
            Button(
                onClick = {
                    watcher.stop()
                    running = false
                    Thread { result = Sensor.get(ctx).endSelfTest() }.start()
                },
                modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
            ) { Text(stringResource(R.string.selftest_done)) }
        } else {
            Button(
                onClick = {
                    result = null
                    running = true
                    Thread { Sensor.get(ctx).beginSelfTest(); watcher.start() }.start()
                },
                modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
            ) { Text(stringResource(if (result == null) R.string.selftest_start else R.string.selftest_again)) }
        }
        result?.let { r ->
            ResultLine(r.removalSeen, R.string.selftest_removal_ok, R.string.selftest_removal_no)
            ResultLine(r.sensorArmed, R.string.selftest_armed_ok, R.string.selftest_armed_no)
            ResultLine(r.returnSeen, R.string.selftest_return_ok, R.string.selftest_return_no)
            r.jobDelayMs?.let { Text(stringResource(R.string.selftest_delay, (it / 1000).toInt()), style = MaterialTheme.typography.bodyMedium) }
            Text(stringResource(R.string.selftest_station), style = MaterialTheme.typography.bodyMedium)
        }
    }
}

@Composable
private fun ResultLine(ok: Boolean, okRes: Int, noRes: Int) {
    val text = stringResource(if (ok) okRes else noRes)
    Row(Modifier.fillMaxWidth().heightIn(min = 48.dp).semantics { contentDescription = text }, verticalAlignment = Alignment.CenterVertically) {
        Text(if (ok) "\u2713  " else "!  ", color = if (ok) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error)
        Text(text, style = MaterialTheme.typography.bodyLarge)
    }
}
