package app.outage.demo

/**
 * One run of "Unplug your own phone" (demo-mode task 4, design sections 4 and 7). Plays the unplug track of the replay
 * file on its own injected clock. It holds no engine, no network, no Outbox, no real-event store and no sensor class
 * (DM3, checked by `DemoArchitectureTest`): every decision it shows was made by the real engine at build time (R4.4).
 * State lives in memory only and is dropped with the object (R5.4).
 */
class DemoSession(private val replay: ReplayFile, private val clock: () -> Long) {
    /** The judge's own events. `simulated` is true when they came from the "Simulate unplug" button (R4.9). */
    data class JudgeEvent(val type: String, val atMs: Long, val simulated: Boolean)

    /** One phone in the view. The judge's phone is the only one that may be real (DM5). */
    data class PhoneDot(val label: String, val off: Boolean, val simulated: Boolean, val isJudge: Boolean)

    enum class Step { WAITING, UNPLUGGED, REPLUGGED }

    data class View(
        /** "Simulated neighbors": always present (R2.1, DM1). */
        val banner: String,
        val step: Step,
        /** The engine's state from the last frame shown, or NORMAL before the judge unplugs. */
        val state: String,
        val phones: List<PhoneDot>,
        val drops: Int,
        val armed: Int,
        val explanation: Explanation?,
        /** Time from the judge's unplug to Confirmed on this screen, once shown. */
        val confirmedAfterMs: Long?,
        /** Ring the demo alarm now: the judge said yes in the demo prompt and the replug frames reached Restored (R4.8). */
        val alarmDue: Boolean,
        /** Wall time of the next frame to show, or null when nothing more is scheduled. The screen waits until then. */
        val nextAtMs: Long?,
    )

    private var unplug: JudgeEvent? = null
    private var replug: JudgeEvent? = null
    private var wantsAlarm = false
    private var alarmRung = false

    val judgeEvents: List<JudgeEvent> get() = listOfNotNull(unplug, replug)

    /** The judge's phone lost power (from the plug observer), or the simulate button was pressed. Ignored twice. */
    fun judgeUnplug(simulated: Boolean) {
        if (unplug != null) return
        unplug = JudgeEvent("UNPLUG", clock(), simulated)
    }

    /** The judge plugged back in. Only after an unplug. */
    fun judgeReplug(simulated: Boolean) {
        if (unplug == null || replug != null) return
        replug = JudgeEvent("REPLUG", clock(), simulated)
    }

    /** The demo prompt "Power just went? Yes, wake me when it's back / No" (R4.8). */
    fun answerPrompt(wakeMe: Boolean) {
        wantsAlarm = wakeMe
    }

    fun alarmRang() {
        alarmRung = true
    }

    /** Start over with the same file. Nothing carries over. */
    fun restart() {
        unplug = null
        replug = null
        wantsAlarm = false
        alarmRung = false
    }

    private fun shownFrames(now: Long): List<TrackFrame> {
        val u = unplug ?: return emptyList()
        val r = replug
        val frames = replay.track.frames
        // Unplug frames are due at the judge's unplug plus their offset. A replug shows any that were not due yet.
        val unplugShown = frames.filter { it.phase == Phase.UNPLUG && (r != null || u.atMs + it.offsetMs <= now) }
        val replugShown = if (r == null) emptyList() else frames.filter { it.phase == Phase.REPLUG && r.atMs + it.offsetMs <= now }
        return unplugShown + replugShown
    }

    private fun nextAt(now: Long): Long? {
        val u = unplug ?: return null
        val r = replug
        val due = replay.track.frames.mapNotNull { f ->
            when {
                f.phase == Phase.UNPLUG && r == null -> u.atMs + f.offsetMs
                f.phase == Phase.REPLUG && r != null -> r.atMs + f.offsetMs
                else -> null
            }
        }.filter { it > now }
        return due.minOrNull()
    }

    fun view(): View {
        val now = clock()
        val shown = shownFrames(now)
        val off = HashSet<String>()
        for (f in shown) for (e in f.events) {
            if (e.type == "UNPLUG") off += e.alias
            if (e.type == "REPLUG") off -= e.alias
        }
        val u = unplug
        val r = replug
        val judgeOff = u != null && r == null
        val judge = PhoneDot(JUDGE_LABEL, judgeOff, simulated = u?.simulated ?: r?.simulated ?: false, isJudge = true)
        val neighbors = replay.track.neighbors.map { PhoneDot(it.label, it.alias in off, simulated = true, isJudge = false) }
        val state = shown.lastOrNull()?.state ?: "NORMAL"
        val confirmedFrame = shown.firstOrNull { it.phase == Phase.UNPLUG && it.state == "CONFIRMED" }
        val step = when {
            r != null -> Step.REPLUGGED
            u != null -> Step.UNPLUGGED
            else -> Step.WAITING
        }
        return View(
            banner = replay.track.label,
            step = step,
            state = state,
            phones = listOf(judge) + neighbors,
            drops = off.size + if (judgeOff) 1 else 0,
            armed = replay.track.armed,
            explanation = shown.lastOrNull { it.explanation != null }?.explanation,
            confirmedAfterMs = confirmedFrame?.offsetMs,
            alarmDue = wantsAlarm && !alarmRung && state == "RESTORED",
            nextAtMs = nextAt(now),
        )
    }

    companion object {
        const val JUDGE_LABEL = "Your phone"
    }
}
