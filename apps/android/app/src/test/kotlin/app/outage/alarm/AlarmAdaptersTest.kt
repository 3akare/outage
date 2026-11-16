package app.outage.alarm

import android.app.NotificationManager
import app.outage.sensor.Confidence
import app.outage.sensor.EventType
import app.outage.sensor.Plug
import app.outage.sensor.SensorClock
import app.outage.sensor.SensorEvent
import app.outage.sensor.Source
import app.outage.sensor.TimeQuality
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** alerts-and-light-alarm task 4: L3 (no network in the alarm path), L11 (channel config), and the core glue. */
class AlarmAdaptersTest {
    private class Clock(var now: Long = 1_000, var boot: Int = 1) : SensorClock {
        override fun elapsedMs() = now
        override fun bootCount() = boot
    }

    private class Fx : AlarmEffects {
        val calls = mutableListOf<String>()
        override fun showPrompt(unplugSeq: Long) { calls += "show$unplugSeq" }
        override fun removePrompt(unplugSeq: Long) { calls += "remove$unplugSeq" }
        override fun queueLabel(unplugSeq: Long, answer: String) { calls += "label$unplugSeq$answer" }
        override fun ring(unplugSeq: Long) { calls += "ring$unplugSeq" }
        override fun stopRing() { calls += "stop" }
    }

    private fun ev(type: EventType, seq: Long, recorded: Long, reason: String? = null) = SensorEvent(
        seq, type, 0, recorded, TimeQuality.OK, Confidence.HIGH, null, 50, Plug.AC, null, reason, Source.RECEIVER, null, null,
    )

    private val clock = Clock()
    private val fx = Fx()
    private val store = MemoryWakeStore()
    private val core = AlarmCore(store, clock, fx)

    @Test
    fun yes_then_replug_rings_and_records_latency() {
        core.onSensorEvent(ev(EventType.UNPLUG, 3, 900))
        core.answer(3, true)
        assertTrue(core.waiting())
        clock.now = 5_000
        core.onSensorEvent(ev(EventType.REPLUG, 4, 4_800))
        assertEquals(listOf("show3", "remove3", "label3YES", "ring3"), fx.calls)
        assertEquals(200L, store.wake(3)?.ringLatencyMs)
        assertFalse(core.waiting())
    }

    @Test
    fun battery_full_and_plain_disarm_show_no_prompt() {
        core.onSensorEvent(ev(EventType.BATTERY_FULL, 1, 10))
        core.onSensorEvent(ev(EventType.DISARMED, 2, 10, reason = "NON_DETECTION_PLUG"))
        core.onSensorEvent(ev(EventType.ARMED, 3, 10))
        assertTrue(fx.calls.isEmpty())
    }

    @Test
    fun reboot_disarm_drops_the_wake() {
        core.onSensorEvent(ev(EventType.UNPLUG, 1, 10)); core.answer(1, true)
        core.onSensorEvent(ev(EventType.DISARMED, 2, 20, reason = "REBOOT"))
        clock.now = 9_000
        core.onSensorEvent(ev(EventType.REPLUG, 3, 8_900))
        assertTrue(fx.calls.none { it.startsWith("ring") })
        assertNull(store.wake(99))
    }

    /** L3: the alarm path names no network class, so it cannot depend on the server or an upload. */
    @Test
    fun L3_alarm_has_no_network() {
        val dir = listOf(File("src/main/kotlin/app/outage/alarm"), File("app/src/main/kotlin/app/outage/alarm")).first { it.isDirectory }
        val banned = listOf("app.outage.net", "java.net.", "android.net.", "okhttp", "retrofit", "HttpURLConnection", "firebase", "WorkManager")
        val files = dir.listFiles { f -> f.extension == "kt" }!!
        assertTrue(files.size >= 8)
        for (f in files) {
            val imports = f.readLines().filter { it.startsWith("import ") }
            for (b in banned) assertFalse("${f.name} imports $b", imports.any { it.contains(b) })
        }
        // The core builds and runs with only a store, a clock and effects: nothing network-shaped is needed.
        val c = AlarmCore(MemoryWakeStore(), Clock(), Fx())
        c.onSensorEvent(ev(EventType.UNPLUG, 1, 1)); c.answer(1, true); c.onSensorEvent(ev(EventType.REPLUG, 2, 2))
    }

    @Test
    fun L11_channel_config() {
        val byId = ChannelSpecs.all.associateBy { it.id }
        val check = byId.getValue("power-check")
        assertFalse(check.sound); assertFalse(check.vibrate)
        assertTrue(check.importance <= NotificationManager.IMPORTANCE_DEFAULT)
        val alarm = byId.getValue("light-alarm")
        assertTrue(alarm.alarmUsage)
        assertEquals(NotificationManager.IMPORTANCE_HIGH, alarm.importance)
        assertEquals(ChannelSpecs.all.size, byId.size)
        // The push channels the Worker names in messages must exist here.
        val planner = listOf(File("../../../../workers/api/src/alerts/planner.ts"), File("../../workers/api/src/alerts/planner.ts"), File("workers/api/src/alerts/planner.ts"))
            .firstOrNull { it.isFile }?.readText()
        if (planner != null) {
            for (m in Regex("CHANNEL_[A-Z]+ = '([a-z-]+)'").findAll(planner)) assertTrue(m.groupValues[1], m.groupValues[1] in byId)
        }
        assertTrue("alerts" in byId && "alerts-quiet" in byId)
    }
}
