package app.outage.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.input.TextFieldLineLimits
import androidx.compose.foundation.text.input.rememberTextFieldState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.repeatOnLifecycle
import androidx.lifecycle.viewModelScope
import app.outage.R
import app.outage.home.ClaimStatus
import app.outage.home.HomeCard
import app.outage.home.HomeLine
import app.outage.home.HomeWatchModel
import app.outage.home.HomeWatchUi
import app.outage.home.StationStatus
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

private const val HOME_REFRESH_MS = 60_000L

/** Runs [HomeWatchModel] off the main thread and publishes its state (home-watch task 8). */
class HomeWatchViewModel(private val model: HomeWatchModel) : ViewModel() {
    private val _state = MutableStateFlow(model.ui)
    val state: StateFlow<HomeWatchUi> = _state.asStateFlow()

    private fun run(block: HomeWatchModel.() -> Unit) {
        // https://developer.android.com/topic/libraries/architecture/coroutines#viewmodelscope
        viewModelScope.launch(Dispatchers.IO) {
            model.block()
            _state.value = model.ui
        }
    }

    fun refresh() = run { refresh() }
    fun claim(code: String, name: String) = run { claim(code, name) }
    fun resetClaim() = run { resetClaim() }
    fun removeViewerPair(pairId: String) = run { removeViewerPair(pairId) }
    fun requestOffer() = run { requestOffer() }
    fun loadStationPairs() = run { loadStationPairs() }
    fun removeStationPair(pairId: String) = run { removeStationPair(pairId) }
    fun offerShown(): String? = model.offerShown()
}

/** Refresh on open and once a minute while shown (R4.3; no push yet, ADR 0045). */
@Composable
private fun RefreshWhileShown(action: () -> Unit) {
    // https://developer.android.com/topic/libraries/architecture/coroutines#repeatOnLifecycle
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    LaunchedEffect(lifecycle) {
        lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
            while (true) {
                action()
                delay(HOME_REFRESH_MS)
            }
        }
    }
}

/** The text of one card line (R4.2). Times are in the phone's own zone (R4.1). Never a cell or a map (R4.5). */
@Composable
fun homeLineText(line: HomeLine?, name: String, nowMs: Long): Pair<String, String?> = when (line) {
    is HomeLine.PowerOn -> stringResource(R.string.home_on_since, line.name, Fmt.since(line.sinceMs, nowMs)) to null
    is HomeLine.PowerOff -> stringResource(R.string.home_off_since, line.name, Fmt.since(line.sinceMs, nowMs)) to null
    is HomeLine.Offline -> stringResource(R.string.home_station_offline) to when {
        line.lastKnownOn == null || line.lastKnownSinceMs == null -> null
        line.lastKnownOn -> stringResource(R.string.home_last_known_on, Fmt.since(line.lastKnownSinceMs, nowMs))
        else -> stringResource(R.string.home_last_known_off, Fmt.since(line.lastKnownSinceMs, nowMs))
    }
    is HomeLine.Waiting, null -> stringResource(R.string.home_waiting, name) to null
}

@Composable
private fun HomeCardView(card: HomeCard, nowMs: Long, onRemove: (() -> Unit)?) {
    Card(Modifier.fillMaxWidth()) {
        HomeCardBody(card, nowMs)
        if (onRemove != null) {
            TextButton(onClick = onRemove, modifier = Modifier.padding(horizontal = 8.dp).heightIn(min = 48.dp)) {
                Text(stringResource(R.string.home_remove_pair))
            }
        }
    }
}

/** The Home tab card under the map: one line per paired home. Nothing shows until a pair exists. */
@Composable
fun HomeWatchCard(vm: HomeWatchViewModel, onOpen: () -> Unit) {
    val state by vm.state.collectAsStateWithLifecycle()
    RefreshWhileShown { vm.refresh() }
    if (state.cards.isEmpty()) return
    val now = System.currentTimeMillis()
    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        state.cards.forEach { card -> Card(onClick = onOpen, modifier = Modifier.fillMaxWidth()) { HomeCardBody(card, now) } }
    }
}

@Composable
private fun HomeCardBody(card: HomeCard, nowMs: Long) {
    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        val (title, sub) = homeLineText(card.line, card.name, nowMs)
        Text(title, style = MaterialTheme.typography.titleMedium)
        sub?.let { Text(it, style = MaterialTheme.typography.bodyMedium) }
        // R4.4: a cached state shows its age when the phone could not refresh it.
        if (card.stale && card.fetchedAtMs != null) {
            Text(stringResource(R.string.home_age, Fmt.ageMinutes(nowMs, card.fetchedAtMs)), style = MaterialTheme.typography.bodySmall)
        }
    }
}

/** Settings > Home Watch: the viewer side. Enter the station's code, see each home, remove a pair (R1.4, R4, R1.10, R9.2). */
@Composable
fun HomeWatchScreen(vm: HomeWatchViewModel, onBack: () -> Unit, onOpenStation: () -> Unit) {
    val state by vm.state.collectAsStateWithLifecycle()
    RefreshWhileShown { vm.refresh() }
    val code = rememberTextFieldState()
    val name = rememberTextFieldState(initialText = stringResource(R.string.home_default_name))
    val now = System.currentTimeMillis()
    Column(Modifier.fillMaxSize()) {
        SubScreenHeader(R.string.settings_home_watch, onBack)
        Column(
            Modifier.fillMaxSize().padding(16.dp).verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(stringResource(R.string.home_intro), style = MaterialTheme.typography.bodyLarge)
            ServerNotes(state)
            state.cards.forEach { card -> HomeCardView(card, now) { vm.removeViewerPair(card.pairId) } }
            if (state.cards.size < HomeWatchModel.MAX_VIEWER_PAIRS) {
                Text(stringResource(R.string.home_enter_code_title), style = MaterialTheme.typography.titleMedium)
                // State-based text field: https://developer.android.com/develop/ui/compose/text/user-input
                OutlinedTextField(
                    state = code,
                    label = { Text(stringResource(R.string.home_code_label)) },
                    lineLimits = TextFieldLineLimits.SingleLine,
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    state = name,
                    label = { Text(stringResource(R.string.home_name_label)) },
                    lineLimits = TextFieldLineLimits.SingleLine,
                    modifier = Modifier.fillMaxWidth(),
                )
                Button(
                    onClick = { vm.claim(code.text.toString(), name.text.toString()) },
                    enabled = state.claim != ClaimStatus.BUSY && !state.noServer,
                    modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp),
                ) { Text(stringResource(R.string.home_pair_button)) }
                claimText(state.claim)?.let { Text(it, style = MaterialTheme.typography.bodyMedium) }
            }
            HorizontalDivider()
            OutlinedButton(onClick = onOpenStation, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) {
                Text(stringResource(R.string.home_setup_spare))
            }
        }
    }
}

@Composable
private fun claimText(s: ClaimStatus): String? = when (s) {
    ClaimStatus.IDLE, ClaimStatus.BUSY -> null
    ClaimStatus.DONE -> stringResource(R.string.home_claim_done)
    ClaimStatus.NOT_FOUND -> stringResource(R.string.home_claim_not_found)
    ClaimStatus.FULL -> stringResource(R.string.home_claim_full)
    ClaimStatus.FAILED -> stringResource(R.string.home_claim_failed)
}

@Composable
private fun ServerNotes(state: HomeWatchUi) {
    if (state.noServer) Text(stringResource(R.string.home_no_server), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.error)
    else if (state.notRegistered) Text(stringResource(R.string.home_not_registered), style = MaterialTheme.typography.bodyMedium)
}

/** Settings > Station mode: the spare phone side. "Pair with my phone", the code, every pair with remove, the SIM hint (R1.1, R9.1). */
@Composable
fun StationPairScreen(vm: HomeWatchViewModel, onBack: () -> Unit) {
    val state by vm.state.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) { vm.loadStationPairs() }
    Column(Modifier.fillMaxSize()) {
        SubScreenHeader(R.string.settings_station, onBack)
        Column(
            Modifier.fillMaxSize().padding(16.dp).verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(stringResource(R.string.station_intro), style = MaterialTheme.typography.bodyLarge)
            Text(stringResource(R.string.home_sim_hint), style = MaterialTheme.typography.bodyMedium)
            ServerNotes(state)
            Button(
                onClick = { vm.requestOffer() },
                enabled = state.station != StationStatus.BUSY && !state.noServer,
                modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp),
            ) { Text(stringResource(R.string.station_pair_button)) }
            val shown = vm.offerShown()
            if (shown != null && state.offerExpiresAtMs != null) {
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(shown.chunked(5).joinToString(" "), style = MaterialTheme.typography.headlineLarge, fontFamily = FontFamily.Monospace)
                        Text(stringResource(R.string.station_code_valid_until, Fmt.time(state.offerExpiresAtMs!!)), style = MaterialTheme.typography.bodyMedium)
                    }
                }
            }
            when (state.station) {
                StationStatus.FULL -> Text(stringResource(R.string.home_claim_full))
                StationStatus.FAILED -> Text(stringResource(R.string.station_offer_failed))
                else -> Unit
            }
            HorizontalDivider()
            Text(stringResource(R.string.station_pairs_title), style = MaterialTheme.typography.titleMedium)
            val pairs = state.stationPairs
            if (pairs.isNullOrEmpty()) Text(stringResource(R.string.station_pairs_none), style = MaterialTheme.typography.bodyMedium)
            pairs?.forEachIndexed { i, p ->
                Row(Modifier.fillMaxWidth().heightIn(min = 48.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(stringResource(R.string.station_pair_row, i + 1, Fmt.day(p.createdMs)), Modifier.weight(1f))
                    TextButton(onClick = { vm.removeStationPair(p.pairId) }, modifier = Modifier.heightIn(min = 48.dp)) {
                        Text(stringResource(R.string.home_remove_pair))
                    }
                }
            }
        }
    }
}
