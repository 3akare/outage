package app.outage.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Snackbar
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import app.outage.BuildConfig
import app.outage.R
import app.outage.shell.Route
import app.outage.shell.ShellGraph
import kotlinx.coroutines.launch

private class Tab(val route: Route, val labelRes: Int, val iconRes: Int)

// Status first (ADR 0054): Now answers "is my power on?", the map is one tap away, then Insights and Settings.
private val tabs = listOf(
    Tab(Route.Home, R.string.nav_now, R.drawable.ic_sym_home),
    Tab(Route.Map, R.string.nav_map, R.drawable.ic_sym_map),
    Tab(Route.Insights, R.string.nav_insights, R.drawable.ic_sym_insights),
    Tab(Route.Settings, R.string.nav_settings, R.drawable.ic_sym_settings),
)

/** The app frame: four destinations behind a white tab bar, "Coming soon" for unbuilt features (R3). */
@Composable
fun Shell(graph: ShellGraph, shell: ShellViewModel) {
    val home: HomeViewModel = viewModel(
        factory = viewModelFactory { initializer { HomeViewModel(graph.sources, graph.connectivity) } },
    )
    // One scroll state per destination, kept while the app runs (R3.4).
    val homeScroll = rememberScrollState()
    val settingsScroll = rememberScrollState()

    val stack = shell.stack
    val current = shell.current
    BackHandler(enabled = stack.size > 1) { shell.back() }
    SideEffect {
        graph.openFeature = { key -> shell.go(Route.Feature(key)) }
        graph.goBack = { shell.back() }
    }

    val snackbar = remember { SnackbarHostState() }
    val spotSaved = stringResource(R.string.first_run_spot_saved)
    val spotSavedIn = stringResource(R.string.first_run_spot_saved_in)
    val spotMissing = stringResource(R.string.spot_not_found)
    val spotDenied = stringResource(R.string.first_run_spot_later)
    val scope = rememberCoroutineScope()

    Scaffold(
        containerColor = Day.page,
        snackbarHost = {
            SnackbarHost(snackbar) { data ->
                Snackbar(containerColor = Day.ink, contentColor = Day.onInk, shape = androidx.compose.foundation.shape.RoundedCornerShape(Tokens.cornerM)) {
                    Text(data.visuals.message, style = DayType.subhead)
                }
            }
        },
        bottomBar = {
            // No tab bar before first run is done, also while Judge mode is open on top of it (demo-mode R1.2).
            if (Route.Onboarding !in stack) {
                val selected = stack.lastOrNull { r -> tabs.any { it.route == r } } ?: Route.Home
                TabBar(selected) { shell.tab(it) }
            }
        },
    ) { padding ->
        // The map runs under the status bar, like a maps app; every other screen keeps clear of it.
        val top = if (current == Route.Map) 0.dp else padding.calculateTopPadding()
        Box(Modifier.fillMaxSize().padding(top = top, bottom = padding.calculateBottomPadding())) {
            val back: () -> Unit = { shell.back() }
            when (current) {
                Route.Onboarding -> FirstRunScreen(
                    finish = { graph.completeFirstRun(System.currentTimeMillis()) || !graph.onboardingNeeded() },
                    locate = { graph.locateSpot() },
                    onDone = { outcome ->
                        shell.onboardingDone()
                        val message = when (outcome) {
                            is SpotOutcome.Saved -> outcome.area?.let { String.format(spotSavedIn, it) } ?: spotSaved
                            SpotOutcome.NotFound -> spotMissing
                            SpotOutcome.Denied, SpotOutcome.Skipped -> spotDenied
                        }
                        scope.launch { snackbar.showSnackbar(message) }
                    },
                    onTryJudge = { shell.go(Route.Feature(FeatureRegistry.JUDGE)) },
                )
                Route.Home -> HomeScreen(
                    home, homeScroll,
                    onOpenAlarm = { shell.go(Route.Feature(FeatureRegistry.ALARM)) },
                    onOpenSetup = { key -> shell.go(Route.Feature(key)) },
                    onOpenMap = { shell.tab(Route.Map) },
                    band = graph.band,
                    spotName = { graph.onboarding.load()?.areaName },
                )
                Route.Map -> graph.features.get(FeatureRegistry.AREA)?.screen?.invoke() ?: ComingSoonScreen(R.string.nav_map, null)
                Route.Insights -> graph.features.get(FeatureRegistry.INSIGHTS)?.screen?.invoke() ?: ComingSoonScreen(R.string.nav_insights, null)
                Route.Settings -> SettingsScreen(
                    versionName = BuildConfig.VERSION_NAME,
                    alias = graph.store.alias,
                    scroll = settingsScroll,
                    deleting = shell.deleting,
                    onOpen = { key -> shell.go(Route.Feature(key)) },
                    onDeleteConfirmed = shell::deleteMyData,
                )
                is Route.Feature -> {
                    val feature = graph.features.get(current.key)
                    when {
                        feature != null -> androidx.compose.runtime.CompositionLocalProvider(LocalBack provides back) { feature.screen() }
                        current.key == SettingsItems.ABOUT -> AboutScreen(back)
                        else -> ComingSoonScreen(SettingsItems.titleFor(current.key) ?: titleForKey(current.key), back)
                    }
                }
            }
        }
    }

    shell.deleteResult?.let { result ->
        AlertDialog(
            onDismissRequest = shell::dismissDeleteResult,
            containerColor = Day.card,
            text = {
                // "Deleted" only when the phone side is empty (R5.4).
                Text(
                    stringResource(
                        when {
                            !result.phoneEmpty -> R.string.delete_failed
                            !result.serverDone -> R.string.delete_done_server_pending
                            else -> R.string.delete_done
                        },
                    ),
                    style = DayType.body, color = Day.ink,
                )
            },
            confirmButton = { TextAction(stringResource(R.string.ok), shell::dismissDeleteResult) },
        )
    }
}

/** A white tab bar with a top hairline: thin icons over 12 sp labels, the picked tab in ink, the rest muted. */
@Composable
private fun TabBar(selected: Route, onPick: (Route) -> Unit) {
    Column(Modifier.fillMaxWidth().background(Day.card).navigationBarsPadding()) {
        Box(Modifier.fillMaxWidth().height(0.5.dp).background(Day.rule))
        Row(Modifier.fillMaxWidth().heightIn(min = 56.dp).selectableGroup(), horizontalArrangement = Arrangement.SpaceEvenly) {
            tabs.forEach { tab ->
                val on = tab.route == selected
                val tint = if (on) Day.ink else Day.muted
                Column(
                    Modifier.weight(1f).heightIn(min = 56.dp).selectable(selected = on, role = Role.Tab, onClick = { onPick(tab.route) }).padding(top = 8.dp, bottom = 6.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(3.dp),
                ) {
                    Glyph(tab.iconRes, tint, 24.dp)
                    Text(stringResource(tab.labelRes), style = if (on) DayType.caption.copy(fontWeight = androidx.compose.ui.text.font.FontWeight(600)) else DayType.caption, color = tint)
                }
            }
        }
    }
}

private fun titleForKey(key: String): Int = if (key == FeatureRegistry.ALARM) R.string.alarm_title else R.string.coming_soon
