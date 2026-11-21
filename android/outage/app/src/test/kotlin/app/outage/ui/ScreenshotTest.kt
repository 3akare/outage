package app.outage.ui

import android.graphics.Bitmap
import android.graphics.Canvas
import androidx.compose.ui.res.stringResource
import app.outage.R
import androidx.activity.ComponentActivity
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.test.onAllNodesWithText
import app.outage.alarm.AlarmState
import app.outage.log.LogInput
import app.outage.log.LogRecorder
import app.outage.log.LogStore
import app.outage.log.PowerLogService
import app.outage.sensor.SensorKind
import app.outage.sensor.SensorState
import app.outage.shell.AreaStatus
import app.outage.shell.HomeUiState
import app.outage.shell.StatusLevel
import java.io.File
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * Screenshots of the new screens on the JVM (ADR 0059). Each test draws a screen with Robolectric native graphics and
 * writes a PNG to docs/visual. The files are checked in so a reviewer sees the screens without a device. The Map tab is
 * not here: it draws with MapLibre native code, which does not run on the JVM (ADR 0059). Now is drawn from HomeContent with
 * the same title strings HomeScreen uses, because HomeScreen needs a live view model.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34], qualifiers = "w411dp-h891dp-xxhdpi")
class ScreenshotTest {
    @get:Rule
    val rule = createAndroidComposeRule<ComponentActivity>()

    private fun save(name: String) {
        // captureToImage needs a real window redraw, which Robolectric does not do; draw the activity's root view instead.
        rule.waitForIdle()
        val view = rule.activity.window.decorView
        val bmp = Bitmap.createBitmap(view.width, view.height, Bitmap.Config.ARGB_8888)
        view.draw(Canvas(bmp))
        val dir = File("../../../docs/visual").also { it.mkdirs() }
        val file = File(dir, "android-$name.png")
        file.outputStream().use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
        assertTrue(file.length() > 5_000)
    }

    @Test
    fun now_with_a_spot() {
        val now = System.currentTimeMillis()
        val state = HomeUiState(
            sensor = SensorState(SensorKind.ARMED),
            area = AreaStatus(StatusLevel.NORMAL, now - 120_000),
            ageMinutes = 2, offline = false, todayPowerHours = 14.5, alarm = AlarmState.OFF, simulated = false,
        )
        rule.setContent { OutageTheme { DayPage { LargeTitle("Yaba, Lagos Mainland", supporting = stringResource(R.string.now_your_spot), top = 20.dp); HomeContent(state, {}, {}, {}, hasSpot = true) } } }
        save("now")
    }

    @Test
    fun now_without_a_spot() {
        rule.setContent { OutageTheme { DayPage { LargeTitle(stringResource(R.string.nav_now), supporting = stringResource(R.string.now_no_spot), top = 20.dp); HomeContent(HomeUiState.Initial, {}, {}, {}, hasSpot = false) } } }
        save("now-empty")
    }

    @Test
    fun place_picker_lga_ward_and_empty_search() {
        // Parse the bundled places first, so the picker opens on its first step at once.
        assertTrue("lagos-places.json is not in the test assets", app.outage.places.PlacesAssets.places(rule.activity) != null)
        rule.setContent { OutageTheme { PlacePicker(onPicked = {}, onExit = {}) } }
        rule.waitUntil(10_000) { rule.onAllNodesWithText("Agege").fetchSemanticsNodes().isNotEmpty() }
        save("spot-picker-lga")
        // Ikeja is below the fold, so search for it like a person would.
        rule.onAllNodes(hasSetTextAction())[0].performTextInput("Ikeja")
        rule.waitUntil(10_000) { rule.onAllNodesWithText("Ikeja").fetchSemanticsNodes().isNotEmpty() }
        rule.onAllNodesWithText("Ikeja")[1].performClick()
        rule.waitUntil(10_000) { rule.onAllNodesWithText("Aguda").fetchSemanticsNodes().isNotEmpty() }
        save("spot-picker-ward")
        // The empty state when nothing matches.
        rule.onAllNodes(hasSetTextAction())[0].performTextInput("zzz")
        rule.waitUntil(10_000) { rule.onAllNodesWithText("matches", substring = true).fetchSemanticsNodes().isNotEmpty() }
        save("spot-picker-no-match")
    }

    @Test
    fun history_with_data() {
        val h = 3_600_000L
        val now = System.currentTimeMillis()
        val store = MemoryLogStore()
        for (d in 1..9) {
            val start = now - d * 24 * h
            store.add(LogInput.Event(d * 10L, "ARMED", start))
            store.add(LogInput.Event(d * 10L + 1, "UNPLUG", start + 6 * h))
            store.add(LogInput.Answer(d * 10L + 1, true, start + 6 * h + 60_000))
            store.add(LogInput.Event(d * 10L + 2, "REPLUG", start + 9 * h))
        }
        val vm = PowerLogViewModel(service(store, now))
        rule.setContent { OutageTheme { PowerLogScreen(vm) } }
        rule.waitUntil(10_000) { vm.view != null }
        rule.waitForIdle()
        save("history")
    }

    @Test
    fun history_empty() {
        val now = System.currentTimeMillis()
        val empty = PowerLogViewModel(service(MemoryLogStore(), now))
        rule.setContent { OutageTheme { PowerLogScreen(empty) } }
        rule.waitUntil(10_000) { empty.view != null }
        rule.waitForIdle()
        save("history-empty")
    }

    private fun service(store: LogStore, now: Long) =
        PowerLogService(store, LogRecorder(store, {}, { false }, { false }, { now }), null, { null }, { now })
}

private class MemoryLogStore : LogStore {
    private val inputs = LinkedHashMap<String, LogInput>()
    private val settings = HashMap<String, String>()
    override fun add(input: LogInput) { inputs[input.key] = input }
    override fun replaceAreaOutages(sinceMs: Long, outages: List<LogInput.AreaOutage>) {
        inputs.values.removeAll { it is LogInput.AreaOutage && it.startMs >= sinceMs }
        outages.forEach { add(it) }
    }
    override fun all(): List<LogInput> = inputs.values.toList()
    override fun getSetting(key: String): String? = settings[key]
    override fun putSetting(key: String, value: String?) { if (value == null) settings.remove(key) else settings[key] = value }
    override fun clear() { inputs.clear(); settings.clear() }
}
