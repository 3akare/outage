package app.outage.alarm

import app.outage.sensor.EventType
import app.outage.sensor.Reason
import app.outage.sensor.SensorClock
import app.outage.sensor.SensorEvent

/** What the alarm layer does to the outside world. Android classes implement it; tests use fakes (L3). */
interface AlarmEffects {
    fun showPrompt(unplugSeq: Long)
    fun removePrompt(unplugSeq: Long)
    /** Queues a LABEL in the sensor Outbox. Local only; the uploader sends it later. */
    fun queueLabel(unplugSeq: Long, answer: String)
    fun ring(unplugSeq: Long)
    fun stopRing()
}

/**
 * Glue between sensor events, [AlarmPolicy] and [AlarmEffects]. Pure: no Android type, no network (R3.3). The ring is
 * the last step, after the REPLUG is already in the Outbox, because the sensor writes the event before it tells
 * listeners (sensor-android R2).
 */
class AlarmCore(
    private val store: WakeStore,
    private val clock: SensorClock,
    private val effects: AlarmEffects,
    private val policy: AlarmPolicy = AlarmPolicy(store),
) {
    /** One sensor event. Only UNPLUG, REPLUG and a reboot disarm matter; BATTERY_FULL and other DISARMED are ignored (R1.6). */
    @Synchronized
    fun onSensorEvent(e: SensorEvent) {
        when {
            e.type == EventType.UNPLUG -> apply(policy.onUnplug(e.seq), e)
            e.type == EventType.REPLUG -> apply(policy.onReplug(clock.elapsedMs(), clock.bootCount()), e)
            e.type == EventType.DISARMED && e.reason == Reason.REBOOT -> apply(policy.onReboot(), e)
        }
    }

    @Synchronized
    fun answer(unplugSeq: Long, yes: Boolean) {
        apply(policy.onAnswer(unplugSeq, yes, clock.elapsedMs(), clock.bootCount()), null)
    }

    @Synchronized
    fun promptTimeout(unplugSeq: Long) = apply(policy.onPromptTimeout(unplugSeq), null)

    @Synchronized
    fun expire() = apply(policy.expire(clock.elapsedMs(), clock.bootCount()), null)

    @Synchronized
    fun stop() = effects.stopRing()

    /** The unplug still waiting for an answer, for the in-app prompt (R1.7). */
    fun openPrompt(): Long? = policy.openPrompt()

    /** Waiting for power: a wake is armed (Home control, app-shell R2.5). */
    fun waiting(): Boolean = store.latestWake()?.state == WakeState.ARMED

    private fun apply(actions: List<AlarmAction>, replug: SensorEvent?) {
        for (a in actions) {
            when (a) {
                is AlarmAction.ShowPrompt -> effects.showPrompt(a.unplugSeq)
                is AlarmAction.RemovePrompt -> effects.removePrompt(a.unplugSeq)
                is AlarmAction.QueueLabel -> effects.queueLabel(a.unplugSeq, a.answer)
                is AlarmAction.Ring -> {
                    effects.ring(a.unplugSeq)
                    // R3.10: REPLUG event to the start of the ring.
                    if (replug != null) store.recordRingLatency(a.unplugSeq, (clock.elapsedMs() - replug.recordedElapsedMs).coerceAtLeast(0))
                }
                is AlarmAction.SaveWake, is AlarmAction.DropWake -> Unit // the policy already wrote the store
            }
        }
    }
}
