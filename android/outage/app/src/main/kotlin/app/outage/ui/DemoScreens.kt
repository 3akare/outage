package app.outage.ui

import android.content.Context
import android.media.RingtoneManager
import android.os.Handler
import android.os.Looper
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import app.outage.R
import app.outage.demo.DemoSession
import app.outage.demo.JudgeFlow
import app.outage.demo.ReplayFile
import app.outage.demo.ReplayParser
import app.outage.sensor.AndroidPlugObserver
import app.outage.sensor.DemoFlag
import app.outage.sensor.Plug
import app.outage.sensor.PlugObserver
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** Everything the Judge screens draw. Rebuilt from [JudgeFlow] on each change or tick. */
data class JudgeUi(
    val loaded: Boolean,
    val flow: JudgeFlow?,
    val page: JudgeFlow.Page,
    val session: DemoSession.View?,
    val instruction: JudgeFlow.Instruction,
    val promptOpen: Boolean,
    val alarmRang: Boolean,
    val usbOnly: Boolean,
    val version: Long,
)

/**
 * Judge mode (demo-mode task 6). Reads only the bundled replay asset, in memory; writes nothing (R5). The real
 * sensor keeps recording; [DemoFlag] only hides the real "Power just went?" prompt while this is open (R5.5).
 */
class DemoViewModel(private val loadReplay: suspend () -> ReplayFile?, private val clock: () -> Long = System::currentTimeMillis) : ViewModel() {
    private var flow: JudgeFlow? = null
    private var alarmRang = false
    private var version = 0L
    private val _ui = MutableStateFlow(JudgeUi(false, null, JudgeFlow.Page.HOME, null, JudgeFlow.Instruction.SIMULATE_ONLY, false, false, false, 0))
    val ui: StateFlow<JudgeUi> = _ui.asStateFlow()

    init {
        // https://developer.android.com/topic/libraries/architecture/coroutines#viewmodelscope
        viewModelScope.launch {
            val replay = withContext(Dispatchers.IO) { loadReplay() }
            flow = JudgeFlow(replay, clock)
            publish()
        }
    }

    private fun publish() {
        val f = flow
        version++
        _ui.value = JudgeUi(
            loaded = f != null,
            flow = f,
            page = f?.page ?: JudgeFlow.Page.HOME,
            session = f?.session?.view(),
            instruction = f?.instruction() ?: JudgeFlow.Instruction.SIMULATE_ONLY,
            promptOpen = f?.promptOpen ?: false,
            alarmRang = alarmRang,
            usbOnly = f?.charger?.let { it.charging && !it.wallPlug } ?: false,
            version = version,
        )
    }

    fun open(p: JudgeFlow.Page) { flow?.open(p); alarmRang = false; publish() }
    fun back(): Boolean = (flow?.back() ?: false).also { publish() }
    fun onPlug(plug: Plug) { flow?.onCharger(JudgeFlow.Charger(plug != Plug.NONE, plug.detection)); publish() }
    fun simulateUnplug() { flow?.simulateUnplug(); publish() }
    fun simulateReplug() { flow?.simulateReplug(); publish() }
    fun answerPrompt(yes: Boolean) { flow?.answerPrompt(yes); publish() }

    /** Called by the screen loop. Returns true when the demo alarm should ring now (R4.8). */
    fun tick(): Boolean {
        val ring = flow?.takeAlarm() ?: false
        if (ring) alarmRang = true
        publish()
        return ring
    }

    fun discard() { flow?.discard(); alarmRang = false; publish() }
}

/** Reads `replay.json` from the app assets (copied from `core/shared/fixtures/` at build time). */
fun loadReplayAsset(context: Context): ReplayFile? = try {
    // https://developer.android.com/reference/android/content/res/AssetManager#open(java.lang.String)
    context.assets.open(ReplayParser.ASSET_NAME).bufferedReader().use { ReplayParser.parse(it.readText()) }
} catch (_: Exception) {
    null
}

/**
 * The demo alarm: the phone's default alarm sound for 5 seconds, with the "Demo" text on screen (R4.8). A stand-in
 * for the Light Alarm sound path until it is merged (ADR 0046).
 * https://developer.android.com/reference/android/media/RingtoneManager#getRingtone(android.content.Context,%20android.net.Uri)
 */
private fun ringDemoAlarm(context: Context) {
    val tone = runCatching { RingtoneManager.getRingtone(context, RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)) }.getOrNull() ?: return
    runCatching { tone.play() }
    Handler(Looper.getMainLooper()).postDelayed({ runCatching { tone.stop() } }, 5_000)
}

/** The whole Judge mode feature: its own pages behind one shell route, so leaving it discards everything (R1.4, R5.4). */
@Composable
fun JudgeScreen(vm: DemoViewModel, plugs: PlugObserver = AndroidPlugObserver(LocalContext.current), onLeave: () -> Unit) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val lifecycle = LocalLifecycleOwner.current.lifecycle

    // R5.5: the real prompt stays hidden while Judge mode is open; cleared on leave or after 30 s in the background.
    DisposableEffect(Unit) {
        DemoFlag.enter()
        val obs = LifecycleEventObserver { _, e ->
            when (e) {
                Lifecycle.Event.ON_STOP -> DemoFlag.backgrounded(System.currentTimeMillis())
                Lifecycle.Event.ON_START -> DemoFlag.foregrounded()
                else -> Unit
            }
        }
        lifecycle.addObserver(obs)
        onDispose {
            lifecycle.removeObserver(obs)
            DemoFlag.leave()
            vm.discard()
        }
    }
    BackHandler(enabled = ui.page != JudgeFlow.Page.HOME) { vm.back() }

    val flow = ui.flow
    when {
        !ui.loaded -> Column(Modifier.fillMaxSize()) { DemoBanner(stringResource(R.string.demo_banner)) }
        flow == null || !flow.available -> JudgeError(onLeave)
        ui.page == JudgeFlow.Page.REPLAY -> DemoReplayScreen(flow.player!!) { vm.back() }
        ui.page == JudgeFlow.Page.UNPLUG -> {
            // The plug observer runs only while this page is visible (R4.2, sensor-android R13.1).
            DisposableEffect(plugs) {
                plugs.start { p -> vm.onPlug(p) }
                onDispose { plugs.stop() }
            }
            LaunchedEffect(Unit) {
                while (true) {
                    if (vm.tick()) ringDemoAlarm(context)
                    delay(100)
                }
            }
            UnplugPage(ui, vm)
        }
        ui.page == JudgeFlow.Page.HOW -> HowItWorksPage { vm.back() }
        else -> JudgeHomePage(vm, onLeave)
    }
}

@Composable
private fun JudgeError(onLeave: () -> Unit) {
    Column(Modifier.fillMaxSize()) {
        DemoBanner(stringResource(R.string.demo_banner))
        SubScreenHeader(R.string.demo_home_title, onLeave)
        Text(stringResource(R.string.demo_replay_error), Modifier.padding(Tokens.space16), style = MaterialTheme.typography.bodyLarge)
    }
}

@Composable
private fun JudgeHomePage(vm: DemoViewModel, onLeave: () -> Unit) {
    Column(Modifier.fillMaxSize()) {
        DemoBanner(stringResource(R.string.demo_banner))
        SubScreenHeader(R.string.demo_home_title, onLeave)
        Column(
            Modifier.fillMaxSize().padding(Tokens.space16).verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(Tokens.space12),
        ) {
            Text(stringResource(R.string.demo_home_body), style = MaterialTheme.typography.bodyLarge)
            Button(onClick = { vm.open(JudgeFlow.Page.REPLAY) }, modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp)) {
                Text(stringResource(R.string.demo_watch_replay))
            }
            Button(onClick = { vm.open(JudgeFlow.Page.UNPLUG) }, modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp)) {
                Text(stringResource(R.string.demo_unplug_my_phone))
            }
            OutlinedButton(onClick = { vm.open(JudgeFlow.Page.HOW) }, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) {
                Text(stringResource(R.string.demo_how_it_works))
            }
            TextButton(onClick = onLeave, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text(stringResource(R.string.demo_leave)) }
        }
    }
}

@Composable
private fun UnplugPage(ui: JudgeUi, vm: DemoViewModel) {
    val s = ui.session ?: return
    Column(Modifier.fillMaxSize()) {
        DemoBanner(s.banner)
        SubScreenHeader(R.string.demo_unplug_title) { vm.back() }
        Column(
            Modifier.fillMaxSize().padding(Tokens.space16).verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(Tokens.space12),
        ) {
            val instruction = when (ui.instruction) {
                JudgeFlow.Instruction.PLUG_IN_FIRST -> R.string.demo_plug_in_first
                JudgeFlow.Instruction.UNPLUG_NOW -> R.string.demo_unplug_now
                JudgeFlow.Instruction.PLUG_BACK -> R.string.demo_plug_back
                JudgeFlow.Instruction.DONE -> R.string.demo_state_restored
                JudgeFlow.Instruction.SIMULATE_ONLY -> R.string.demo_simulate_note
            }
            Text(stringResource(instruction), style = MaterialTheme.typography.headlineSmall)
            if (ui.usbOnly) Text(stringResource(R.string.demo_usb_note), style = MaterialTheme.typography.bodyMedium)
            StepTracker(s.state)
            if (s.step != DemoSession.Step.WAITING) Text(stringResource(R.string.demo_your_drop), style = MaterialTheme.typography.bodyMedium)
            PhoneDots(
                s.phones.map { p ->
                    Triple(if (p.isJudge) stringResource(R.string.demo_your_phone) else p.label, p.off, p.isJudge)
                },
            )
            Text(stringResource(R.string.demo_count, s.drops, s.armed), style = MaterialTheme.typography.bodyLarge)
            s.confirmedAfterMs?.let { Text(stringResource(R.string.demo_confirmed_after, it), style = MaterialTheme.typography.bodyMedium) }
            if (ui.alarmRang) Text(stringResource(R.string.demo_alarm_text), style = MaterialTheme.typography.titleMedium)
            ExplanationCard(s.explanation)
            // R4.9: labelled simulated buttons, for emulators and judges without a charger.
            Text(stringResource(R.string.demo_simulate_note), style = MaterialTheme.typography.bodySmall)
            when (s.step) {
                DemoSession.Step.WAITING -> OutlinedButton(onClick = vm::simulateUnplug, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) {
                    Text(stringResource(R.string.demo_simulate_unplug))
                }
                DemoSession.Step.UNPLUGGED -> OutlinedButton(onClick = vm::simulateReplug, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) {
                    Text(stringResource(R.string.demo_simulate_replug))
                }
                DemoSession.Step.REPLUGGED -> OutlinedButton(onClick = { vm.open(JudgeFlow.Page.UNPLUG) }, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) {
                    Text(stringResource(R.string.demo_restart))
                }
            }
        }
    }
    if (ui.promptOpen) {
        // The demo prompt, labelled by the banner behind it (R4.8). The real prompt is suppressed meanwhile (R5.5).
        AlertDialog(
            onDismissRequest = { vm.answerPrompt(false) },
            title = { Text(stringResource(R.string.demo_prompt_title)) },
            text = { Text(stringResource(R.string.demo_banner)) },
            confirmButton = { TextButton(onClick = { vm.answerPrompt(true) }) { Text(stringResource(R.string.demo_prompt_yes)) } },
            dismissButton = { TextButton(onClick = { vm.answerPrompt(false) }) { Text(stringResource(R.string.demo_prompt_no)) } },
        )
    }
}

@Composable
private fun HowItWorksPage(onBack: () -> Unit) {
    Column(Modifier.fillMaxSize()) {
        DemoBanner(stringResource(R.string.demo_banner))
        SubScreenHeader(R.string.demo_how_it_works, onBack)
        Column(Modifier.fillMaxSize().padding(Tokens.space16), verticalArrangement = Arrangement.spacedBy(Tokens.space12)) {
            Text(stringResource(R.string.demo_how_1), style = MaterialTheme.typography.bodyLarge)
            Text(stringResource(R.string.demo_how_2), style = MaterialTheme.typography.bodyLarge)
            Text(stringResource(R.string.demo_how_3), style = MaterialTheme.typography.bodyLarge)
        }
    }
}
