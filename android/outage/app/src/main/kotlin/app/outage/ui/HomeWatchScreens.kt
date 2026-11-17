package app.outage.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.input.TextFieldLineLimits
import androidx.compose.foundation.text.input.TextFieldState
import androidx.compose.foundation.text.input.rememberTextFieldState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.LocalLifecycleOwner
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

/** The tile colour of a home: green with power, red without, grey when the station is quiet. */
private fun lineTile(line: HomeLine?) = when (line) {
    is HomeLine.PowerOn -> Tokens.Colors.tileGreen
    is HomeLine.PowerOff -> Tokens.Colors.tileRed
    else -> Tokens.Colors.tileGrey
}

/** One home as a grouped-list row: tile, the line, and its age when it is cached (R4.4). */
@Composable
private fun HomeRow(card: HomeCard, nowMs: Long, onClick: (() -> Unit)? = null) {
    val (title, sub) = homeLineText(card.line, card.name, nowMs)
    val age = if (card.stale && card.fetchedAtMs != null) stringResource(R.string.home_age, Fmt.ageMinutes(nowMs, card.fetchedAtMs)) else null
    DayRow(
        title, listOfNotNull(sub, age).joinToString("\n").ifEmpty { null },
        tile = R.drawable.ic_sym_home_watch to lineTile(card.line), chevron = onClick != null, onClick = onClick,
    )
}

/** Home Watch on Now: one row per paired home. Nothing shows until a pair exists. */
@Composable
fun HomeWatchCard(vm: HomeWatchViewModel, onOpen: () -> Unit) {
    val state by vm.state.collectAsStateWithLifecycle()
    RefreshWhileShown { vm.refresh() }
    if (state.cards.isEmpty()) return
    val now = System.currentTimeMillis()
    GroupHeader(stringResource(R.string.settings_home_watch))
    DayCard {
        state.cards.forEachIndexed { i, card ->
            if (i > 0) RowDivider(TileInset)
            HomeRow(card, now, onOpen)
        }
    }
}

/** A labelled text field inside a grouped card: the label small above, the text at body size. */
@Composable
private fun FieldRow(label: String, state: TextFieldState) {
    Column(Modifier.fillMaxWidth().heightIn(min = 60.dp).padding(horizontal = 16.dp, vertical = 10.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(label, style = DayType.footnote, color = Day.muted)
        // State-based text field: https://developer.android.com/develop/ui/compose/text/user-input
        BasicTextField(
            state = state,
            lineLimits = TextFieldLineLimits.SingleLine,
            textStyle = DayType.body.copy(color = Day.ink),
            cursorBrush = SolidColor(Day.focus),
            modifier = Modifier.fillMaxWidth().semantics { contentDescription = label },
        )
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
    DayPage(title = stringResource(R.string.settings_home_watch), onBack = onBack) {
        PageText(stringResource(R.string.home_intro))
        ServerNotes(state)
        if (state.cards.isNotEmpty()) {
            Gap()
            DayCard {
                state.cards.forEachIndexed { i, card ->
                    if (i > 0) RowDivider(TileInset)
                    HomeRow(card, now)
                    DayRow(stringResource(R.string.home_remove_pair), titleColor = LocalStatusColors.current.confirmed.color) { vm.removeViewerPair(card.pairId) }
                }
            }
        }
        if (state.cards.size < HomeWatchModel.MAX_VIEWER_PAIRS) {
            GroupHeader(stringResource(R.string.home_enter_code_title))
            DayCard {
                FieldRow(stringResource(R.string.home_code_label), code)
                RowDivider()
                FieldRow(stringResource(R.string.home_name_label), name)
            }
            claimText(state.claim)?.let { GroupFooter(it) }
            Gap()
            ActionStack {
                InkButton(
                    stringResource(R.string.home_pair_button),
                    onClick = { vm.claim(code.text.toString(), name.text.toString()) },
                    modifier = Modifier.fillMaxWidth(),
                    enabled = !state.noServer,
                    busy = state.claim == ClaimStatus.BUSY,
                )
            }
        }
        Gap(20.dp)
        DayCard {
            DayRow(stringResource(R.string.home_setup_spare), tile = R.drawable.ic_sym_plug to Tokens.Colors.tileGreen, chevron = true, onClick = onOpenStation)
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
    if (state.noServer) PageText(stringResource(R.string.home_no_server), color = LocalStatusColors.current.confirmed.color, style = DayType.subhead)
    else if (state.notRegistered) PageText(stringResource(R.string.home_not_registered), color = Day.muted, style = DayType.subhead)
}

/** Settings > Station mode: the spare phone side. "Pair with my phone", the code, every pair with remove, the SIM hint (R1.1, R9.1). */
@Composable
fun StationPairScreen(vm: HomeWatchViewModel, onBack: () -> Unit) {
    val state by vm.state.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) { vm.loadStationPairs() }
    DayPage(title = stringResource(R.string.settings_station), onBack = onBack) {
        PageText(stringResource(R.string.station_intro))
        PageText(stringResource(R.string.home_sim_hint), color = Day.muted, style = DayType.subhead)
        ServerNotes(state)
        Gap()
        val shown = vm.offerShown()
        if (shown != null && state.offerExpiresAtMs != null) {
            // The code, set big in tabular figures so it is easy to read across a room.
            DayCard(padding = 24.dp) {
                Text(
                    shown.chunked(5).joinToString(" "), style = DayType.title1Num.copy(fontSize = DayType.largeTitle.fontSize), color = Day.ink,
                    textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth(),
                )
                Text(
                    stringResource(R.string.station_code_valid_until, Fmt.time(state.offerExpiresAtMs!!)), style = DayType.subhead, color = Day.muted,
                    textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth().padding(top = 6.dp),
                )
            }
            Gap()
        }
        ActionStack {
            InkButton(
                stringResource(R.string.station_pair_button),
                onClick = { vm.requestOffer() },
                modifier = Modifier.fillMaxWidth(),
                enabled = !state.noServer,
                busy = state.station == StationStatus.BUSY,
            )
        }
        when (state.station) {
            StationStatus.FULL -> GroupFooter(stringResource(R.string.home_claim_full))
            StationStatus.FAILED -> GroupFooter(stringResource(R.string.station_offer_failed))
            else -> Unit
        }
        GroupHeader(stringResource(R.string.station_pairs_title))
        DayCard {
            val pairs = state.stationPairs
            if (pairs.isNullOrEmpty()) DayRow(stringResource(R.string.station_pairs_none), titleColor = Day.muted)
            pairs?.forEachIndexed { i, p ->
                if (i > 0) RowDivider()
                DayRow(stringResource(R.string.station_pair_row, i + 1, Fmt.day(p.createdMs)), trailing = {
                    TextAction(stringResource(R.string.home_remove_pair), { vm.removeStationPair(p.pairId) }, color = LocalStatusColors.current.confirmed.color)
                })
            }
        }
    }
}

