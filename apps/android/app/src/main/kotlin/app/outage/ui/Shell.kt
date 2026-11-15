package app.outage.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
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

private val tabs = listOf(
    Tab(Route.Home, R.string.nav_home, R.drawable.ic_nav_home),
    Tab(Route.Area, R.string.nav_area, R.drawable.ic_nav_area),
    Tab(Route.Insights, R.string.nav_insights, R.drawable.ic_nav_insights),
    Tab(Route.Log, R.string.nav_log, R.drawable.ic_nav_log),
    Tab(Route.Settings, R.string.nav_settings, R.drawable.ic_nav_settings),
)

/** The app frame: four destinations behind a bottom bar, "Coming soon" for unbuilt features (R3). */
@Composable
fun Shell(graph: ShellGraph, shell: ShellViewModel, debugPlaceholderAllowed: Boolean) {
    val home: HomeViewModel = viewModel(
        factory = viewModelFactory { initializer { HomeViewModel(graph.sources, graph.connectivity) } },
    )
    // One scroll state per destination, kept while the app runs (R3.4).
    val homeScroll = rememberScrollState()
    val settingsScroll = rememberScrollState()

    val stack = shell.stack
    val current = shell.current
    BackHandler(enabled = stack.size > 1) { shell.back() }

    Scaffold(
        bottomBar = {
            if (current != Route.Onboarding) {
                val selected = stack.lastOrNull { r -> tabs.any { it.route == r } } ?: Route.Home
                NavigationBar {
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
                            label = { Text(stringResource(tab.labelRes)) },
                        )
                    }
                }
            }
        },
    ) { padding ->
        Box(Modifier.fillMaxSize().padding(padding)) {
            val back: () -> Unit = { shell.back() }
            when (current) {
                Route.Onboarding ->
                    graph.features.get(FeatureRegistry.ONBOARDING)?.screen?.invoke()
                        ?: if (debugPlaceholderAllowed) OnboardingPlaceholder(onDone = shell::onboardingDone)
                        else ComingSoonScreen(R.string.onboarding_title, null)
                Route.Home -> HomeScreen(home, homeScroll) { shell.go(Route.Feature(FeatureRegistry.ALARM)) }
                Route.Log -> graph.features.get(FeatureRegistry.LOG)?.screen?.invoke() ?: ComingSoonScreen(R.string.nav_log, null)
                Route.Area -> graph.features.get(FeatureRegistry.AREA)?.screen?.invoke() ?: ComingSoonScreen(R.string.nav_area, null)
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
