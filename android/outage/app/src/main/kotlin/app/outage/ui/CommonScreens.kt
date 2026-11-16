package app.outage.ui

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.IconButton
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import kotlinx.coroutines.launch
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import app.outage.R

/** Material 3 top app bar with a back arrow, for screens pushed above a destination. The arrow is a 48 dp target (R6.4). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SubScreenHeader(titleRes: Int, onBack: () -> Unit) {
    TopAppBar(
        title = { Text(stringResource(titleRes)) },
        navigationIcon = {
            IconButton(onClick = onBack) {
                Image(
                    painter = painterResource(R.drawable.ic_back),
                    contentDescription = stringResource(R.string.back),
                    modifier = Modifier.size(24.dp),
                    colorFilter = ColorFilter.tint(MaterialTheme.colorScheme.onSurface),
                )
            }
        },
        colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.surface),
    )
}

/** Large title for a top-level destination (Insights, Settings), the Material 3 large top app bar look without scroll behaviour. */
@Composable
fun DestinationTitle(titleRes: Int, trailing: @Composable () -> Unit = {}) {
    Row(Modifier.fillMaxWidth().padding(start = 16.dp, end = 8.dp, top = 16.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(stringResource(titleRes), style = MaterialTheme.typography.headlineMedium, modifier = Modifier.weight(1f))
        trailing()
    }
}

/** Shown for any slot whose feature is not built yet (R3.2). Never crashes. */
@Composable
fun ComingSoonScreen(titleRes: Int, onBack: (() -> Unit)?) {
    Column(Modifier.fillMaxSize()) {
        if (onBack != null) SubScreenHeader(titleRes, onBack)
        Column(
            modifier = Modifier.fillMaxSize().padding(24.dp).verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.Center,
        ) {
            if (onBack == null) Text(stringResource(titleRes), style = MaterialTheme.typography.titleLarge)
            Text(stringResource(R.string.coming_soon), style = MaterialTheme.typography.headlineSmall)
            Text(stringResource(R.string.coming_soon_body), style = MaterialTheme.typography.bodyLarge)
        }
    }
}

@Composable
fun AboutScreen(onBack: () -> Unit) {
    Column(Modifier.fillMaxSize()) {
        SubScreenHeader(R.string.settings_about, onBack)
        Column(
            modifier = Modifier.fillMaxSize().padding(16.dp).verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(stringResource(R.string.about_what), style = MaterialTheme.typography.bodyLarge)
            Text(stringResource(R.string.privacy_cell), style = MaterialTheme.typography.bodyLarge)
            Text(stringResource(R.string.privacy_anonymous), style = MaterialTheme.typography.bodyLarge)
            Text(stringResource(R.string.privacy_sensors), style = MaterialTheme.typography.bodyLarge)
            Text(stringResource(R.string.privacy_delete), style = MaterialTheme.typography.bodyLarge)
        }
    }
}

/** What first run found when it looked for the spot. [area] is the place name to show, never a coordinate. */
sealed interface SpotOutcome {
    data class Saved(val area: String?) : SpotOutcome
    data object NotFound : SpotOutcome
    data object Denied : SpotOutcome
    data object Skipped : SpotOutcome
}

/**
 * First run (ADR 0050): one screen, like a new phone app. "Use my location" records consent, asks for coarse location
 * once, turns it into a map cell and drops it (onboarding O2, ADR 0037), then asks for notifications where the phone
 * needs it. "Not now" skips the location. Either way the app opens on the map. Nothing else blocks the first look.
 * [finish] records consent; [locate] reads the position once and saves the cell.
 */
@Composable
fun FirstRunScreen(finish: () -> Boolean, locate: suspend () -> SpotOutcome, onDone: (SpotOutcome) -> Unit, onTryJudge: (() -> Unit)? = null) {
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    var outcome by remember { mutableStateOf<SpotOutcome>(SpotOutcome.Skipped) }
    // https://developer.android.com/training/permissions/requesting (POST_NOTIFICATIONS is a runtime permission from API 33)
    val askNotifications = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { onDone(outcome) }
    fun next(o: SpotOutcome) {
        outcome = o
        busy = false
        if (Build.VERSION.SDK_INT >= 33) askNotifications.launch(Manifest.permission.POST_NOTIFICATIONS) else onDone(o)
    }
    val askLocation = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (!granted) next(SpotOutcome.Denied) else scope.launch { next(locate()) }
    }
    // The Earth turns behind the welcome, as on the web (ADR 0051).
    val ctx = LocalContext.current
    val globe = remember { GlobeData.load(ctx) }
    BoxWithConstraints(Modifier.fillMaxSize()) {
    GlobeView(globe, emptyList(), emptyMap(), null, null, emptyList(), null, topInset = 0.dp, bottomInset = maxHeight * 0.5f, summary = "", onTap = {})
    Box(Modifier.fillMaxSize().background(Brush.verticalGradient(0f to Color.Transparent, 0.34f to Color(0x59030508), 0.58f to Color(0xF0030508))))
    // At least the screen's height, so the text sits at the bottom under the globe; it scrolls when the text is large.
    Column(
        modifier = Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).heightIn(min = maxHeight).padding(horizontal = 24.dp, vertical = 32.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp, Alignment.Bottom),
    ) {
        Text(stringResource(R.string.first_run_title), style = MaterialTheme.typography.headlineMedium)
        Text(stringResource(R.string.first_run_body), style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainer), shape = MaterialTheme.shapes.large) {
            Row(Modifier.padding(16.dp), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                Image(painterResource(R.drawable.ic_status_person_pin), null, Modifier.size(24.dp), colorFilter = ColorFilter.tint(MaterialTheme.colorScheme.primary))
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(stringResource(R.string.first_run_location_title), style = MaterialTheme.typography.titleSmall)
                    Text(stringResource(R.string.first_run_privacy), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
        if (busy) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                CircularProgressIndicator(Modifier.size(24.dp), strokeWidth = 3.dp)
                Text(stringResource(R.string.spot_locating), style = MaterialTheme.typography.bodyLarge)
            }
        }
        Button(
            onClick = {
                if (busy || !finish()) return@Button
                busy = true
                askLocation.launch(Manifest.permission.ACCESS_COARSE_LOCATION)
            },
            enabled = !busy,
            modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp),
        ) { Text(stringResource(R.string.first_run_use_location), style = MaterialTheme.typography.titleMedium) }
        TextButton(
            onClick = { if (!busy && finish()) next(SpotOutcome.Skipped) },
            enabled = !busy,
            modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
        ) { Text(stringResource(R.string.first_run_not_now)) }
        // demo-mode R1.1, R1.2: Judge mode from the first screen, with no consent, permission or network.
        if (onTryJudge != null) {
            OutlinedButton(onClick = onTryJudge, enabled = !busy, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) {
                Text(stringResource(R.string.demo_try))
            }
        }
    }
    }
}
