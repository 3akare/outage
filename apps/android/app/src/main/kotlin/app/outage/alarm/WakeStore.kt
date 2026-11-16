package app.outage.alarm

/** `ARMED` = waiting for power, `FIRED` = rang once, `DROPPED` = expired, superseded or lost to a reboot. */
enum class WakeState { ARMED, FIRED, DROPPED }

/** The stored result of "Yes, wake me when it's back" (alerts-and-light-alarm design 3.2). Times are elapsed-realtime. */
data class Wake(
    val unplugSeq: Long,
    val createdElapsedMs: Long,
    val bootCount: Int,
    val expiresElapsedMs: Long,
    val state: WakeState = WakeState.ARMED,
    /** Time from the REPLUG event to the start of the ring (R3.10). Null until it rings. */
    val ringLatencyMs: Long? = null,
)

/** `SHOWN` = open question, `ANSWERED` = a first answer arrived, `CLOSED` = REPLUG, timeout or replaced by a newer prompt. */
enum class PromptStatus { SHOWN, ANSWERED, CLOSED }

/**
 * The alarm layer's memory (design 3.2). It lives in SQLite on the phone so a new process, started by the notification
 * action, still knows which unplug is open and which wake is armed. No network, no upload class (L3).
 */
interface WakeStore {
    fun promptStatus(unplugSeq: Long): PromptStatus?
    fun putPrompt(unplugSeq: Long, status: PromptStatus)
    /** The open prompts, newest last. */
    fun shownPrompts(): List<Long>
    fun putWake(wake: Wake)
    fun wake(unplugSeq: Long): Wake?
    /** The wake of the highest unplug seq. */
    fun latestWake(): Wake?
    fun setWakeState(unplugSeq: Long, state: WakeState)
    fun recordRingLatency(unplugSeq: Long, latencyMs: Long)
    /** Delete-my-data (R4.3). */
    fun clear()
}

class MemoryWakeStore : WakeStore {
    private val prompts = LinkedHashMap<Long, PromptStatus>()
    private val wakes = HashMap<Long, Wake>()

    override fun promptStatus(unplugSeq: Long) = prompts[unplugSeq]
    override fun putPrompt(unplugSeq: Long, status: PromptStatus) { prompts[unplugSeq] = status }
    override fun shownPrompts() = prompts.filterValues { it == PromptStatus.SHOWN }.keys.sorted()
    override fun putWake(wake: Wake) { wakes[wake.unplugSeq] = wake }
    override fun wake(unplugSeq: Long) = wakes[unplugSeq]
    override fun latestWake() = wakes.keys.maxOrNull()?.let { wakes[it] }
    override fun setWakeState(unplugSeq: Long, state: WakeState) { wakes[unplugSeq]?.let { wakes[unplugSeq] = it.copy(state = state) } }
    override fun recordRingLatency(unplugSeq: Long, latencyMs: Long) { wakes[unplugSeq]?.let { wakes[unplugSeq] = it.copy(ringLatencyMs = latencyMs) } }
    override fun clear() { prompts.clear(); wakes.clear() }
}
