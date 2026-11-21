package app.outage.sensor

/**
 * The sensor state machine (sensor-android design section 4, station-mode design section 4, ADR 0032 and ADR 0033).
 * Pure: the time and the power facts are inputs. Two drivers feed it: the foreground-service receiver (primary) and the
 * charging job (backup). Dedupe is by state, not by time: a second report of the same transition arrives in a state that
 * no longer accepts it, so it emits nothing.
 */
enum class Phase { IDLE, NOT_CHARGING, ARMED, DROPPED, FULL, GAP }

/** Everything the machine remembers. Persisted in the store's state rows so a pending drop survives process death. */
data class MachineState(
    val phase: Phase = Phase.IDLE,
    /** Elapsed time of the pending UNPLUG, for the REPLUG scheduling delay. Only meaningful in DROPPED. */
    val dropElapsedMs: Long? = null,
)

sealed interface Input {
    data object Start : Input
    data object UserStopped : Input
    data object JobStarted : Input
    data class JobStopped(val stopReason: Int?) : Input
    data object PowerConnected : Input
    data object PowerDisconnected : Input
    data object Heartbeat : Input
    /** A new process found a non-idle persisted state: the old process died, or the phone rebooted. */
    data class Recovered(val bootChanged: Boolean) : Input
}

data class Output(
    val state: MachineState,
    val events: List<EventDraft> = emptyList(),
    /** The job backup must be scheduled again (always true after a job stop while the sensor is on). */
    val reschedule: Boolean = false,
    /** station-mode R3.6: a disconnect broadcast while the plug still reads as connected. */
    val broadcastMismatch: Boolean = false,
)

object SensorStateMachine {
    /**
     * One step. `receiverActive` is true while the foreground-service receiver is registered: then a job stop that is not
     * a charging stop is not a gap, because the receiver still watches the plug (ADR 0033).
     */
    fun step(state: MachineState, input: Input, facts: Facts, nowElapsedMs: Long, receiverActive: Boolean): Output {
        fun draft(type: EventType, source: Source, confidence: Confidence = Confidence.HIGH, stopReason: String? = null,
                  reason: String? = null, delay: Long? = null, at: Long = nowElapsedMs) =
            EventDraft(type, at, confidence, facts.batteryPct, facts.plug, source, stopReason, reason, delay)

        val phase = state.phase
        if (phase == Phase.IDLE && input != Input.Start) return Output(state)

        return when (input) {
            Input.Start -> when {
                phase != Phase.IDLE -> Output(state)
                facts.plug.detection -> Output(MachineState(Phase.ARMED), listOf(draft(EventType.ARMED, Source.RECEIVER)), reschedule = true)
                else -> Output(MachineState(Phase.NOT_CHARGING), reschedule = true)
            }

            Input.UserStopped -> {
                val ev = if (phase == Phase.ARMED || phase == Phase.FULL) {
                    listOf(draft(EventType.DISARMED, Source.RECEIVER, reason = Reason.USER_STOPPED))
                } else emptyList()
                Output(MachineState(Phase.IDLE), ev)
            }

            Input.JobStarted, Input.PowerConnected -> {
                val source = if (input == Input.JobStarted) Source.JOB else Source.RECEIVER
                if (!facts.plug.detection) return Output(state)
                when (phase) {
                    Phase.ARMED -> Output(state)
                    Phase.DROPPED -> {
                        // The receiver sees the plug change itself, so its delay is 0; the job's delay is the time
                        // since the drop (the job start lag dominates it). Unknown after process death.
                        val delay = if (source == Source.RECEIVER) 0L else state.dropElapsedMs?.let { (nowElapsedMs - it).coerceAtLeast(0) }
                        Output(MachineState(Phase.ARMED), listOf(draft(EventType.REPLUG, source, delay = delay)))
                    }
                    else -> Output(MachineState(Phase.ARMED), listOf(draft(EventType.ARMED, source)))
                }
            }

            is Input.JobStopped -> {
                val name = StopReasons.name(input.stopReason)
                if (phase != Phase.ARMED) return Output(state, reschedule = true)
                val d = decideStop(input.stopReason, facts)
                when {
                    d.type == EventType.UNPLUG ->
                        Output(MachineState(Phase.DROPPED, nowElapsedMs), listOf(draft(EventType.UNPLUG, Source.JOB, d.confidence, name)), reschedule = true)
                    d.type == EventType.BATTERY_FULL ->
                        Output(MachineState(Phase.FULL), listOf(draft(EventType.BATTERY_FULL, Source.JOB, d.confidence, name)), reschedule = true)
                    // The receiver is primary: a timeout or quota stop of the backup job is not a gap.
                    receiverActive -> Output(state, reschedule = true)
                    d.reason == Reason.NON_DETECTION_PLUG ->
                        Output(MachineState(Phase.NOT_CHARGING), listOf(draft(EventType.DISARMED, Source.JOB, d.confidence, name, d.reason)), reschedule = true)
                    else ->
                        Output(MachineState(Phase.GAP), listOf(draft(EventType.DISARMED, Source.JOB, d.confidence, name, d.reason)), reschedule = true)
                }
            }

            Input.PowerDisconnected -> when {
                facts.plug.detection -> Output(state, broadcastMismatch = phase == Phase.ARMED || phase == Phase.FULL)
                phase != Phase.ARMED && phase != Phase.FULL -> {
                    // GAP or NOT_CHARGING: no armed sensor, so no UNPLUG; the phone is simply off detection power now.
                    if (phase == Phase.GAP) Output(MachineState(Phase.NOT_CHARGING)) else Output(state)
                }
                facts.plug == Plug.NONE ->
                    // station-mode R3.2: a receiver unplug counts at any battery level, also from FULL.
                    Output(MachineState(Phase.DROPPED, nowElapsedMs), listOf(draft(EventType.UNPLUG, Source.RECEIVER)))
                else ->
                    Output(MachineState(Phase.NOT_CHARGING), listOf(draft(EventType.DISARMED, Source.RECEIVER, reason = Reason.NON_DETECTION_PLUG)))
            }

            Input.Heartbeat ->
                when (phase) {
                    Phase.ARMED -> Output(state, listOf(draft(EventType.ARMED, Source.RECEIVER)))
                    // Not armed (on battery, full, or a plug that is not a detection plug): nothing to send. The battery
                    // heartbeat went with Home Watch (ADR 0055).
                    else -> Output(state)
                }

            is Input.Recovered -> {
                val why = if (input.bootChanged) Reason.REBOOT else Reason.PROCESS_DEATH
                val events = mutableListOf<EventDraft>()
                if (phase == Phase.ARMED || phase == Phase.FULL) {
                    events += draft(EventType.DISARMED, Source.RECEIVER, Confidence.LOW, reason = why)
                }
                val keepDrop = phase == Phase.DROPPED && !input.bootChanged
                val next = when {
                    keepDrop && facts.plug.detection -> {
                        // Power came back while no process ran: the exact time is unknown, so LOW and no delay.
                        events += draft(EventType.REPLUG, Source.RECEIVER, Confidence.LOW)
                        MachineState(Phase.ARMED)
                    }
                    keepDrop -> state
                    facts.plug.detection -> {
                        events += draft(EventType.ARMED, Source.RECEIVER)
                        MachineState(Phase.ARMED)
                    }
                    else -> MachineState(Phase.NOT_CHARGING)
                }
                Output(next, events, reschedule = true)
            }
        }
    }
}
