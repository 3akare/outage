package app.outage.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
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

    Column(Modifier.fillMaxWidth()) {
        GroupHeader(stringResource(R.string.follow_title))
        DayCard {
            SwitchRow(R.string.follow_switch, on, R.drawable.ic_sym_notifications to Tokens.Colors.tileRed) { on = it; apply(it) }
            if (on) {
                RowDivider(TileInset)
                SwitchRow(R.string.follow_kind_confirmed, confirmed) { confirmed = it; apply() }
                RowDivider()
                SwitchRow(R.string.follow_kind_restored, restored) { restored = it; apply() }
                RowDivider()
                SwitchRow(R.string.follow_quiet_switch, quietOn) { quietOn = it; apply() }
                if (quietOn) {
                    RowDivider()
                    StepperRow(
                        stringResource(R.string.follow_quiet_from), QuietWindow.hhmm(start), R.string.follow_earlier, R.string.follow_later, true, true,
                        { start = QuietWindow.shift(start, -QuietWindow.STEP_MIN); apply() }, { start = QuietWindow.shift(start, QuietWindow.STEP_MIN); apply() },
                    )
                    RowDivider()
                    StepperRow(
                        stringResource(R.string.follow_quiet_to), QuietWindow.hhmm(end), R.string.follow_earlier, R.string.follow_later, true, true,
                        { end = QuietWindow.shift(end, -QuietWindow.STEP_MIN); apply() }, { end = QuietWindow.shift(end, QuietWindow.STEP_MIN); apply() },
                    )
                }
            }
        }
        if (on && quietOn) GroupFooter(stringResource(R.string.follow_quiet_hint))
        if (working) GroupFooter(stringResource(R.string.follow_working))
        status?.let { GroupFooter(stringResource(it)) }
        GroupFooter(stringResource(R.string.follow_google_note))
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

    FeaturePage(R.string.selftest_title) {
        PageText(stringResource(R.string.selftest_intro))
        if (running) {
            Gap()
            DayCard(padding = 20.dp) {
                androidx.compose.material3.Text(stringResource(R.string.selftest_step), style = DayType.title3, color = Day.ink)
            }
        }
        Gap()
        ActionStack {
            if (running) {
                InkButton(
                    stringResource(R.string.selftest_done),
                    onClick = {
                        watcher.stop()
                        running = false
                        Thread { result = Sensor.get(ctx).endSelfTest() }.start()
                    },
                    modifier = Modifier.fillMaxWidth(),
                )
            } else {
                InkButton(
                    stringResource(if (result == null) R.string.selftest_start else R.string.selftest_again),
                    onClick = {
                        result = null
                        running = true
                        Thread { Sensor.get(ctx).beginSelfTest(); watcher.start() }.start()
                    },
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
        result?.let { r ->
            Gap()
            DayCard {
                CheckRow(stringResource(if (r.removalSeen) R.string.selftest_removal_ok else R.string.selftest_removal_no), r.removalSeen)
                RowDivider(50.dp)
                CheckRow(stringResource(if (r.sensorArmed) R.string.selftest_armed_ok else R.string.selftest_armed_no), r.sensorArmed)
                RowDivider(50.dp)
                CheckRow(stringResource(if (r.returnSeen) R.string.selftest_return_ok else R.string.selftest_return_no), r.returnSeen)
            }
            r.jobDelayMs?.let { GroupFooter(stringResource(R.string.selftest_delay, (it / 1000).toInt())) }
        }
    }
}
