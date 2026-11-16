package app.outage.alarm

/** Tunable limits (alerts-and-light-alarm requirements, Decisions). */
object AlarmLimits {
    const val PROMPT_TIMEOUT_MS = 10 * 60_000L
    const val MAX_RING_MS = 120_000L
    const val WAKE_TTL_MS = 24 * 3_600_000L
}

/** What the adapters must do. The policy only decides. */
sealed interface AlarmAction {
    data class ShowPrompt(val unplugSeq: Long) : AlarmAction
    data class RemovePrompt(val unplugSeq: Long) : AlarmAction
    data class SaveWake(val unplugSeq: Long, val expiresElapsedMs: Long) : AlarmAction
    data class QueueLabel(val unplugSeq: Long, val answer: String) : AlarmAction
    data class DropWake(val unplugSeq: Long) : AlarmAction
    data class Ring(val unplugSeq: Long) : AlarmAction
}

/**
 * The alarm decisions as a pure core (design 3.1). The clock and the boot counter are inputs; storage goes through
 * [WakeStore]. It imports nothing from `net`, so the alarm path needs no network (R3.3, L3).
 *
 * Rules held here and nowhere else:
 * - one prompt per distinct UNPLUG seq; a duplicate changes nothing (R1.4);
 * - the first answer wins; answers after REPLUG, timeout or a newer prompt are ignored (R2.3, R2.4);
 * - a wake rings at most once, only if unexpired and from the same boot (R3.2, R4.1, R4.2);
 * - a new UNPLUG supersedes an old wake that has not rung (the label stays).
 */
class AlarmPolicy(private val store: WakeStore, private val wakeTtlMs: Long = AlarmLimits.WAKE_TTL_MS) {

    fun onUnplug(unplugSeq: Long): List<AlarmAction> {
        if (store.promptStatus(unplugSeq) != null) return emptyList()
        val out = mutableListOf<AlarmAction>()
        for (old in store.shownPrompts()) {
            store.putPrompt(old, PromptStatus.CLOSED)
            out += AlarmAction.RemovePrompt(old)
        }
        store.latestWake()?.takeIf { it.state == WakeState.ARMED }?.let {
            store.setWakeState(it.unplugSeq, WakeState.DROPPED)
            out += AlarmAction.DropWake(it.unplugSeq)
        }
        store.putPrompt(unplugSeq, PromptStatus.SHOWN)
        out += AlarmAction.ShowPrompt(unplugSeq)
        return out
    }

    fun onAnswer(unplugSeq: Long, yes: Boolean, nowElapsedMs: Long, bootCount: Int): List<AlarmAction> {
        if (store.promptStatus(unplugSeq) != PromptStatus.SHOWN) return emptyList()
        store.putPrompt(unplugSeq, PromptStatus.ANSWERED)
        val out = mutableListOf<AlarmAction>(AlarmAction.RemovePrompt(unplugSeq), AlarmAction.QueueLabel(unplugSeq, if (yes) "YES" else "NO"))
        if (yes) {
            val expires = nowElapsedMs + wakeTtlMs
            store.putWake(Wake(unplugSeq, nowElapsedMs, bootCount, expires))
            out += AlarmAction.SaveWake(unplugSeq, expires)
        }
        return out
    }

    fun onPromptTimeout(unplugSeq: Long): List<AlarmAction> {
        if (store.promptStatus(unplugSeq) != PromptStatus.SHOWN) return emptyList()
        store.putPrompt(unplugSeq, PromptStatus.CLOSED)
        return listOf(AlarmAction.RemovePrompt(unplugSeq))
    }

    fun onReplug(nowElapsedMs: Long, bootCount: Int): List<AlarmAction> {
        val out = mutableListOf<AlarmAction>()
        for (open in store.shownPrompts()) {
            store.putPrompt(open, PromptStatus.CLOSED)
            out += AlarmAction.RemovePrompt(open)
        }
        val wake = store.latestWake()
        if (wake != null && wake.state == WakeState.ARMED) {
            if (wake.bootCount != bootCount || nowElapsedMs >= wake.expiresElapsedMs) {
                store.setWakeState(wake.unplugSeq, WakeState.DROPPED)
                out += AlarmAction.DropWake(wake.unplugSeq)
            } else {
                store.setWakeState(wake.unplugSeq, WakeState.FIRED)
                out += AlarmAction.Ring(wake.unplugSeq)
            }
        }
        return out
    }

    /** The phone rebooted: elapsed time cannot be trusted, so every armed wake is dropped (R4.2). */
    fun onReboot(): List<AlarmAction> {
        val wake = store.latestWake()
        if (wake == null || wake.state != WakeState.ARMED) return emptyList()
        store.setWakeState(wake.unplugSeq, WakeState.DROPPED)
        return listOf(AlarmAction.DropWake(wake.unplugSeq))
    }

    /** Drops an armed wake that has passed its expiry, without waiting for a REPLUG. */
    fun expire(nowElapsedMs: Long, bootCount: Int): List<AlarmAction> {
        val wake = store.latestWake()
        if (wake == null || wake.state != WakeState.ARMED) return emptyList()
        if (wake.bootCount == bootCount && nowElapsedMs < wake.expiresElapsedMs) return emptyList()
        store.setWakeState(wake.unplugSeq, WakeState.DROPPED)
        return listOf(AlarmAction.DropWake(wake.unplugSeq))
    }

    /** True while an unplug is unanswered (R1.7: the in-app prompt). */
    fun openPrompt(): Long? = store.shownPrompts().lastOrNull()
}
