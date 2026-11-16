package app.outage.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import app.outage.R
import app.outage.demo.Explanation
import app.outage.demo.ReplayPlayer
import kotlinx.coroutines.delay
import java.util.Locale

/** The banner every Judge mode screen carries (demo-mode R2.1). It sits outside the scroll, so it cannot be hidden. */
@Composable
fun DemoBanner(text: String) {
    Box(Modifier.fillMaxWidth().background(Day.ink).padding(horizontal = Gutter, vertical = Tokens.space12)) {
        Text(text, color = Day.onInk, style = DayType.footnote)
    }
}

private fun family(state: String, s: StatusColors): StateColors = when (state) {
    "POSSIBLE", "SPOT_ONLY" -> s.possible
    "CONFIRMED" -> s.confirmed
    "RESTORED" -> s.restored
    else -> s.normal
}

/** State colours from the design tokens (ADR 0028), the same as the map and the web player. */
@Composable
fun stateColor(state: String): Color = family(state, LocalStatusColors.current).color

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

/** The status hero of the demo: the state's tint on top with the mark and [headline], the details below on white. */
@Composable
fun DemoHero(state: String, headline: String, body: @Composable ColumnScope.() -> Unit) {
    val f = family(state, LocalStatusColors.current)
    DayCard {
        Column(Modifier.fillMaxWidth().background(f.container).padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Mark(f.color, 32.dp)
            Text(headline, style = DayType.title1, color = f.color)
        }
        Column(Modifier.fillMaxWidth().padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp), content = body)
    }
}

/** On, Maybe, Out, Back, with the current step lit in its colour (ADR 0029 tracker). */
@Composable
fun StepTracker(state: String) {
    val steps = listOf("NORMAL", "POSSIBLE", "CONFIRMED", "RESTORED")
    val current = steps.indexOf(if (state == "SPOT_ONLY") "NORMAL" else state)
    val s = LocalStatusColors.current
    StepTrack(current, steps.map { stateText(it) }, listOf(s.map.normal, s.map.possible, s.map.confirmed, s.map.restored))
}

/** One dot per phone, coloured by on or off. Labels go to accessibility so the row stays small. */
@Composable
fun PhoneDots(dots: List<Triple<String, Boolean, Boolean>>) {
    val map = LocalStatusColors.current.map
    Column(verticalArrangement = Arrangement.spacedBy(Tokens.space8)) {
        dots.chunked(8).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(Tokens.space8)) {
                row.forEach { (label, off, isJudge) ->
                    val desc = label + ": " + stringResource(if (off) R.string.demo_phone_off else R.string.demo_phone_on)
                    Box(
                        Modifier.size(if (isJudge) 32.dp else 24.dp)
                            .background(if (off) map.confirmed else map.normal, CircleShape)
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
    DayCard(padding = 20.dp) {
        Column(verticalArrangement = Arrangement.spacedBy(Tokens.space8)) {
            Text(stringResource(R.string.demo_how_sure), style = DayType.headline, color = Day.ink)
            if (e == null) {
                Text(stringResource(R.string.demo_no_decision_yet), style = DayType.subhead, color = Day.muted)
                return@Column
            }
            Text(stringResource(R.string.demo_k_of_n, e.k, e.n, e.windowMs / 1000), style = DayType.subhead, color = Day.ink2)
            Text(stringResource(R.string.demo_usual_rate, fmt(e.lambdaPerSec * 3600)), style = DayType.subhead, color = Day.ink2)
            Text(stringResource(R.string.demo_chance, fmt(e.p)), style = DayType.subhead, color = Day.ink2)
            Text(
                stringResource(R.string.demo_thresholds, e.possibleMinK, fmt(e.possibleMaxP), e.confirmedMinK, fmt(e.confirmedMaxP), e.minArmedForConfirm),
                style = DayType.footnote, color = Day.muted,
            )
            e.restore?.let { r ->
                Text(stringResource(R.string.demo_restore_check, r.replugs, r.drops, r.quorum, r.windowMs / 1000), style = DayType.subhead, color = Day.ink2)
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
    Column(Modifier.fillMaxSize().background(Day.page)) {
        DemoBanner(view.banner)
        DayPage(title = stringResource(R.string.demo_replay_title), onBack = onBack) {
            DemoHero(view.frame.state, stateText(view.frame.state)) {
                // R2.4, R6.5: say how the outage was recorded.
                Text(
                    if (view.source == "SYNTHETIC") stringResource(R.string.demo_source_synthetic)
                    else stringResource(R.string.demo_source_recorded, view.recordedDevices),
                    style = DayType.subhead, color = Day.muted,
                )
                if (view.frame.state == "SPOT_ONLY") Text(stringResource(R.string.demo_spot_only_legend), style = DayType.subhead, color = Day.ink2)
                Text(stringResource(R.string.demo_count, view.off.size, view.armed.size.coerceAtLeast(view.off.size)), style = DayType.callout, color = Day.ink2)
                StepTracker(view.frame.state)
                PhoneDots(view.phones.mapIndexed { i, p -> Triple(stringResource(R.string.demo_neighbor_n, i + 1), p.alias in view.off, false) })
                Text(stringResource(R.string.demo_step_of, view.index + 1, view.count), style = DayType.footnote, color = Day.muted)
            }
            Gap()
            Row(Modifier.fillMaxWidth().padding(horizontal = Gutter), horizontalArrangement = Arrangement.spacedBy(Tokens.space8)) {
                InkButton(stringResource(if (view.playing) R.string.demo_pause else R.string.demo_play), { if (view.playing) player.pause() else player.play(); view = player.view() }, Modifier.weight(1f))
                FillButton(stringResource(R.string.demo_restart), { player.restart(); view = player.view() }, Modifier.weight(1f))
                FillButton(stringResource(R.string.demo_speed, view.speed), { player.setSpeed(if (view.speed >= 4) 1 else view.speed * 2); view = player.view() }, Modifier.weight(1f))
            }
            Gap()
            ExplanationCard(view.explanation)
        }
    }
}
