package app.outage.demo

/**
 * The Judge mode screens' logic (demo-mode task 6, design section 8): which page is open, the judge's charger, the demo
 * prompt and the demo alarm. Plain Kotlin on an injected clock so JUnit drives it. The plug comes in as two booleans,
 * so this package stays free of sensor classes (DM3).
 */
class JudgeFlow(private val replay: ReplayFile?, private val clock: () -> Long) {
    enum class Page { HOME, REPLAY, UNPLUG, HOW }

    /** The phone's charger as the plug observer last saw it. Null until it has reported, or when it cannot run. */
    data class Charger(val charging: Boolean, val wallPlug: Boolean)

    var page: Page = Page.HOME
        private set
    var charger: Charger? = null
        private set
    var promptOpen: Boolean = false
        private set
    private var promptAnswered = false

    /** Null when the replay file is missing or unreadable: every page then shows the error, simulate buttons hidden. */
    var session: DemoSession? = replay?.let { DemoSession(it, clock) }
        private set
    var player: ReplayPlayer? = replay?.let { ReplayPlayer(it, clock) }
        private set

    val available: Boolean get() = replay != null

    fun open(p: Page) {
        page = p
        if (p == Page.UNPLUG) restartUnplug()
    }

    /** Back inside Judge mode: to its home, and false at its home so the shell leaves Judge mode. */
    fun back(): Boolean {
        if (page == Page.HOME) return false
        player?.pause()
        page = Page.HOME
        return true
    }

    private fun restartUnplug() {
        session?.restart()
        promptOpen = false
        promptAnswered = false
    }

    /** From the plug observer. A real unplug or replug drives the session only on the Unplug page (R4.2, R4.7). */
    fun onCharger(now: Charger) {
        val before = charger
        charger = now
        val s = session ?: return
        if (page != Page.UNPLUG || before == null) return
        val step = s.view().step
        if (before.charging && !now.charging && step == DemoSession.Step.WAITING) unplugged(simulated = false)
        else if (!before.charging && now.charging && step == DemoSession.Step.UNPLUGGED) s.judgeReplug(simulated = false)
    }

    /** "Simulate unplug" (R4.9): the same as the charger, labelled simulated. */
    fun simulateUnplug() {
        if (session?.view()?.step == DemoSession.Step.WAITING) unplugged(simulated = true)
    }

    fun simulateReplug() {
        session?.judgeReplug(simulated = true)
    }

    private fun unplugged(simulated: Boolean) {
        session?.judgeUnplug(simulated)
        if (!promptAnswered) promptOpen = true
    }

    /** The demo prompt "Power just went?" (R4.8). */
    fun answerPrompt(wakeMe: Boolean) {
        session?.answerPrompt(wakeMe)
        promptAnswered = true
        promptOpen = false
    }

    /** True once, when the demo alarm should ring now. The caller rings it. */
    fun takeAlarm(): Boolean {
        val s = session ?: return false
        if (!s.view().alarmDue) return false
        s.alarmRang()
        return true
    }

    /** What the Unplug page asks the judge to do (design section 9). */
    enum class Instruction { PLUG_IN_FIRST, UNPLUG_NOW, PLUG_BACK, DONE, SIMULATE_ONLY }

    fun instruction(): Instruction {
        val s = session?.view() ?: return Instruction.SIMULATE_ONLY
        val c = charger
        return when (s.step) {
            DemoSession.Step.WAITING -> when {
                c == null -> Instruction.SIMULATE_ONLY
                c.charging -> Instruction.UNPLUG_NOW
                else -> Instruction.PLUG_IN_FIRST
            }
            DemoSession.Step.UNPLUGGED -> Instruction.PLUG_BACK
            DemoSession.Step.REPLUGGED -> Instruction.DONE
        }
    }

    /** Leaving Judge mode drops everything (R1.4, R5.4). */
    fun discard() {
        session = replay?.let { DemoSession(it, clock) }
        player = replay?.let { ReplayPlayer(it, clock) }
        page = Page.HOME
        promptOpen = false
        promptAnswered = false
    }
}
