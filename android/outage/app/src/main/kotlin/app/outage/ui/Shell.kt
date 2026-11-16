package app.outage.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.AlertDialog
import androidx.compose.ui.unit.dp
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import kotlinx.coroutines.launch
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import app.outage.BuildConfig
import app.outage.R
import app.outage.shell.Route
import app.outage.shell.ShellGraph

private class Tab(val route: Route, val labelRes: Int, val iconRes: Int)

// Home sits in the middle of the bar, between Insights and Settings (ADR 0050). The app still opens on Home.
private val tabs = listOf(
    Tab(Route.Insights, R.string.nav_insights, R.drawable.ic_sym_insights),
    Tab(Route.Home, R.string.nav_home, R.drawable.ic_sym_home),
    Tab(Route.Settings, R.string.nav_settings, R.drawable.ic_sym_settings),
)

/** The app frame: three destinations behind a bottom bar (Insights, Home, Settings, ADR 0050), "Coming soon" for unbuilt features (R3). */
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
        snackbarHost = { SnackbarHost(snackbar) },
        bottomBar = {
            // No dock before first run is done, also while Judge mode is open on top of it (demo-mode R1.2).
            if (Route.Onboarding !in stack) {
                val selected = stack.lastOrNull { r -> tabs.any { it.route == r } } ?: Route.Home
                NavigationBar(containerColor = MaterialTheme.colorScheme.surfaceContainer) {
                    tabs.forEach { tab ->
                        NavigationBarItem(
                            selected = tab.route == selected,
                            onClick = { shell.tab(tab.route) },
                            icon = {
                                Image(
                                    painter = painterResource(tab.iconRes),
                                    contentDescription = null,
                                    colorFilter = androidx.compose.ui.graphics.ColorFilter.tint(
                                        androidx.compose.material3.LocalContentColor.current,
                                    ),
                                )
                            },
                            label = { Text(stringResource(tab.labelRes), style = MaterialTheme.typography.labelMedium) },
                        )
                    }
                }
            }
        },
    ) { padding ->
        // Home draws its map under the status bar, like a maps app; every other screen keeps clear of it.
        val top = if (current == Route.Home) 0.dp else padding.calculateTopPadding()
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
                    band = graph.band,
                    // The power map fills Home; the feed sits in the sheet above it (ADR 0050).
                    map = { graph.features.get(FeatureRegistry.AREA)?.screen?.invoke() ?: ComingSoonScreen(R.string.nav_home, null) },
                    // Home Watch card in the feed, only when a home is paired (home-watch R4).
                    homeCard = { graph.features.get(FeatureRegistry.HOME_CARD)?.screen?.invoke() },
                )
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
                        feature != null -> feature.screen()
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
                )
            },
            confirmButton = { TextButton(onClick = shell::dismissDeleteResult) { Text(stringResource(R.string.ok)) } },
        )
    }
}

private fun titleForKey(key: String): Int = if (key == FeatureRegistry.ALARM) R.string.alarm_title else R.string.coming_soon
