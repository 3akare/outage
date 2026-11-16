package app.outage.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.outage.R
import app.outage.demo.Explanation
import app.outage.demo.ReplayPlayer
import kotlinx.coroutines.delay
import java.util.Locale

/** The banner every Judge mode screen carries (demo-mode R2.1). It sits outside the scroll, so it cannot be hidden. */
@Composable
fun DemoBanner(text: String) {
    Box(
        Modifier.fillMaxWidth().background(LocalStatusColors.current.possible.container).padding(horizontal = Tokens.space16, vertical = Tokens.space8),
    ) {
        Text(text, color = LocalStatusColors.current.possible.onContainer, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleSmall)
    }
}

/** State colours from the design tokens (ADR 0028), the same as the map and the web player. */
@Composable
fun stateColor(state: String): Color {
    return when (state) {
        "POSSIBLE", "SPOT_ONLY" -> Tokens.Colors.possible
        "CONFIRMED" -> Tokens.Colors.confirmed
        "RESTORED" -> Tokens.Colors.restored
        else -> Tokens.Colors.normal
    }
}

@Composable
fun stateText(state: String): String = stringResource(
    when (state) {
        "POSSIBLE" -> R.string.demo_state_possible
        "CONFIRMED" -> R.string.demo_state_confirmed
        "RESTORED" -> R.string.demo_state_restored
        "SPOT_ONLY" -> R.string.demo_state_spot_only
        else -> R.string.demo_state_normal
    },
)

/** Power on, Possible, Confirmed, Restored, with the current one highlighted (ADR 0029 tracker). */
@Composable
fun StepTracker(state: String) {
    val steps = listOf("NORMAL", "POSSIBLE", "CONFIRMED", "RESTORED")
    val current = if (state == "SPOT_ONLY") "NORMAL" else state
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Tokens.space8)) {
        steps.forEach { s ->
            val on = s == current
            Box(
                Modifier.weight(1f).background(if (on) stateColor(s) else MaterialTheme.colorScheme.surfaceVariant, MaterialTheme.shapes.small)
                    .padding(vertical = Tokens.space8),
                contentAlignment = Alignment.Center,
            ) {
                Text(stateText(s), style = MaterialTheme.typography.labelMedium, color = if (on) Color(0xFF11181F) else MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

/** One dot per phone, coloured by on or off. Labels go to accessibility so the row stays small. */
@Composable
fun PhoneDots(dots: List<Triple<String, Boolean, Boolean>>) {
    Column(verticalArrangement = Arrangement.spacedBy(Tokens.space8)) {
        dots.chunked(6).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(Tokens.space8)) {
                row.forEach { (label, off, isJudge) ->
                    val desc = label + ": " + stringResource(if (off) R.string.demo_phone_off else R.string.demo_phone_on)
                    Box(
                        Modifier.size(if (isJudge) 36.dp else 28.dp)
                            .background(if (off) stateColor("CONFIRMED") else stateColor("NORMAL"), CircleShape)
                            .semantics { contentDescription = desc },
                    )
                }
            }
        }
    }
}

/** The engine's numbers, as stored in the file (demo-mode R3.4, R4.5). */
@Composable
fun ExplanationCard(e: Explanation?) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(Tokens.space16), verticalArrangement = Arrangement.spacedBy(Tokens.space4)) {
            Text(stringResource(R.string.demo_how_sure), style = MaterialTheme.typography.titleMedium)
            if (e == null) {
                Text(stringResource(R.string.demo_no_decision_yet), style = MaterialTheme.typography.bodyMedium)
                return@Column
            }
            Text(stringResource(R.string.demo_k_of_n, e.k, e.n, e.windowMs / 1000), style = MaterialTheme.typography.bodyMedium)
            Text(stringResource(R.string.demo_usual_rate, fmt(e.lambdaPerSec * 3600)), style = MaterialTheme.typography.bodyMedium)
            Text(stringResource(R.string.demo_chance, fmt(e.p)), style = MaterialTheme.typography.bodyMedium)
            Text(
                stringResource(R.string.demo_thresholds, e.possibleMinK, fmt(e.possibleMaxP), e.confirmedMinK, fmt(e.confirmedMaxP), e.minArmedForConfirm),
                style = MaterialTheme.typography.bodySmall,
            )
            e.restore?.let { r ->
                Text(stringResource(R.string.demo_restore_check, r.replugs, r.drops, r.quorum, r.windowMs / 1000), style = MaterialTheme.typography.bodyMedium)
            }
        }
    }
}

private fun fmt(v: Double): String = if (v != 0.0 && v < 0.001) String.format(Locale.ROOT, "%.1e", v) else String.format(Locale.ROOT, "%.3f", v)

/** Judge mode, "Watch a recorded outage" (demo-mode task 5, R3). Plays the bundled replay file offline. */
@Composable
fun DemoReplayScreen(player: ReplayPlayer, onBack: () -> Unit) {
    var view by remember { mutableStateOf(player.view()) }
    LaunchedEffect(player) {
        player.play()
        while (true) {
            player.tick()
            view = player.view()
            val next = view.nextAtMs
            delay(if (next == null) 250L else (next - System.currentTimeMillis()).coerceIn(16L, 250L))
        }
    }
    Column(Modifier.fillMaxSize()) {
        DemoBanner(view.banner)
        SubScreenHeader(R.string.demo_replay_title, onBack)
        Column(
            Modifier.fillMaxSize().padding(Tokens.space16).verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(Tokens.space12),
        ) {
            // R2.4, R6.5: say how the outage was recorded.
            Text(
                if (view.source == "SYNTHETIC") stringResource(R.string.demo_source_synthetic)
                else stringResource(R.string.demo_source_recorded, view.recordedDevices),
                style = MaterialTheme.typography.bodyMedium,
            )
            StepTracker(view.frame.state)
            Text(stateText(view.frame.state), style = MaterialTheme.typography.headlineSmall, color = stateColor(view.frame.state))
            if (view.frame.state == "SPOT_ONLY") Text(stringResource(R.string.demo_spot_only_legend), style = MaterialTheme.typography.bodyMedium)
            PhoneDots(view.phones.mapIndexed { i, p -> Triple(stringResource(R.string.demo_neighbor_n, i + 1), p.alias in view.off, false) })
            Text(stringResource(R.string.demo_count, view.off.size, view.armed.size.coerceAtLeast(view.off.size)), style = MaterialTheme.typography.bodyLarge)
            Text(stringResource(R.string.demo_step_of, view.index + 1, view.count), style = MaterialTheme.typography.bodySmall)
            Row(horizontalArrangement = Arrangement.spacedBy(Tokens.space8)) {
                Button(onClick = { if (view.playing) player.pause() else player.play(); view = player.view() }, modifier = Modifier.heightIn(min = 48.dp)) {
                    Text(stringResource(if (view.playing) R.string.demo_pause else R.string.demo_play))
                }
                OutlinedButton(onClick = { player.restart(); view = player.view() }, modifier = Modifier.heightIn(min = 48.dp)) {
                    Text(stringResource(R.string.demo_restart))
                }
                OutlinedButton(onClick = { player.setSpeed(if (view.speed >= 4) 1 else view.speed * 2); view = player.view() }, modifier = Modifier.heightIn(min = 48.dp)) {
                    Text(stringResource(R.string.demo_speed, view.speed))
                }
            }
            ExplanationCard(view.explanation)
        }
    }
}
