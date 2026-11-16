package app.outage.sensor

/** Monotonic time and the boot counter. `SystemClock.elapsedRealtime()` and `Settings.Global.BOOT_COUNT` on the phone. */
interface SensorClock {
    fun elapsedMs(): Long
    fun bootCount(): Int
}

/** The Android side the controller drives. A fake in JVM tests. */
interface SensorPlatform {
    fun facts(): Facts
    /** Schedules the backup charging job (one stable job ID, idempotent). */
    fun scheduleJob()
    fun cancelJob()
    /** Starts the receiver service. Returns null on success, or a blocked reason such as `FGS_START_BLOCKED`. */
    fun startReceiver(): String?
    fun stopReceiver()
    fun androidSdk(): Int = 0
    fun manufacturer(): String = ""
    fun standbyBucket(): String? = null
    fun batteryExempt(): Boolean? = null
    fun notificationsAllowed(): Boolean = true
}

data class Diagnostics(
    val androidSdk: Int,
    val manufacturer: String,
    val standbyBucket: String?,
    val batteryExempt: Boolean?,
    val receiverRunning: Boolean,
    val receiverBlockedReason: String?,
    val notificationHidden: Boolean,
    val stopReasonCounts: Map<String, Int>,
    val broadcastMismatches: Int,
    val writeFailures: Int,
    val recentGaps: List<Gap>,
)

/** The facade the app calls (sensor-android design section 8, R11). */
interface SensorController {
    fun start(): SensorState
    fun stop()
    fun setInstallId(id: String)
    fun getPendingEvents(limit: Int): List<SensorEvent>
    fun ackEvents(upToSeq: Long)
    fun getTelemetry(periodMs: Long): Telemetry
    fun getDiagnostics(): Diagnostics
    fun addListener(listener: (SensorEvent) -> Unit): AutoCloseable
    fun deleteAllData()
}

/**
 * The one sensor engine. Both drivers call [handle]; it runs the pure state machine, writes events FIRST (R2), then
 * persists the state and asks for the reschedule. Listeners hear every event in the same process, so the Light Alarm
 * gets a REPLUG with no network (R4.3). Thread-safe: every entry point is synchronized.
 */
class DefaultSensorController(
    private val store: EventStore,
    private val clock: SensorClock,
    private val platform: SensorPlatform,
) : SensorController {
    private val listeners = mutableListOf<(SensorEvent) -> Unit>()
    @Volatile var receiverActive = false
        private set

    // ---- inputs from the drivers ----

    @Synchronized
    fun handle(input: Input) {
        val now = clock.elapsedMs()
        val boot = clock.bootCount()
        val facts = platform.facts()
        if (input is Input.JobStopped) bump("stop:" + (StopReasons.name(input.stopReason) ?: "UNAVAILABLE"))
        val out = SensorStateMachine.step(loadState(), input, facts, now, receiverActive)
        if (out.broadcastMismatch) bump(KEY_MISMATCH)
        val written = out.events.mapNotNull { d ->
            try {
                StoredEvent(store.append(d, boot), d, boot).toSensorEvent(now, boot)
            } catch (e: Exception) {
                bump(KEY_WRITE_FAILURES) // R2.3: keep going, reschedule anyway
                null
            }
        }
        saveState(out.state, boot, now)
        if (out.reschedule && out.state.phase != Phase.IDLE) runCatching { platform.scheduleJob() }
        for (e in written) for (l in listeners.toList()) runCatching { l(e) }
    }

    /**
     * power-log R7.4: queues a `REPORT` (kind OUT) in the Outbox for the "Power is out" tap. It changes no sensor state.
     * Returns the event's seq, or null when the write failed. Listeners hear it so the uploader sends it promptly.
     */
    @Synchronized
    fun recordReport(): Long? {
        val now = clock.elapsedMs()
        val boot = clock.bootCount()
        val draft = EventDraft(
            type = EventType.REPORT, recordedElapsedMs = now, confidence = Confidence.HIGH, batteryPct = 0,
            plug = Plug.NONE, source = Source.RECEIVER,
        )
        val stored = try { StoredEvent(store.append(draft, boot), draft, boot) } catch (e: Exception) { bump(KEY_WRITE_FAILURES); return null }
        val event = stored.toSensorEvent(now, boot)
        for (l in listeners.toList()) runCatching { l(event) }
        return stored.seq
    }

    /** Called once per process. A non-idle saved state means the previous process died or the phone rebooted (R5.3, R5.4). */
    @Synchronized
    fun recoverOnProcessStart() {
        val saved = loadState()
        if (saved.phase == Phase.IDLE) return
        val savedBoot = store.getState(KEY_BOOT)?.toIntOrNull()
        handle(Input.Recovered(bootChanged = savedBoot != clock.bootCount()))
        ensureDrivers()
    }

    fun setReceiverActive(active: Boolean) {
        receiverActive = active
        store.putState(KEY_BLOCKED, null)
    }

    @Synchronized
    fun receiverBlocked(reason: String) {
        receiverActive = false
        store.putState(KEY_BLOCKED, reason)
    }

    /** True when the phone is on wall power right now. */
    fun onDetectionPlug(): Boolean = platform.facts().plug.detection

    val isOn: Boolean get() = loadState().phase != Phase.IDLE

    // ---- SensorController ----

    @Synchronized
    override fun start(): SensorState {
        store.prune(clock.elapsedMs(), clock.bootCount())
        handle(Input.Start)
        ensureDrivers()
        return state()
    }

    private fun ensureDrivers() {
        runCatching { platform.scheduleJob() }
        val blocked = try { platform.startReceiver() } catch (e: Exception) { "FGS_START_BLOCKED" }
        if (blocked != null) receiverBlocked(blocked)
    }

    @Synchronized
    override fun stop() {
        handle(Input.UserStopped)
        runCatching { platform.cancelJob() }
        runCatching { platform.stopReceiver() }
        receiverActive = false
    }

    /** What Home shows (app-shell R2.1). */
    fun state(): SensorState {
        val phase = loadState().phase
        return when {
            phase == Phase.IDLE -> SensorState(SensorKind.NOT_ARMED, NotArmedReason.NOT_SET_UP)
            phase == Phase.ARMED || phase == Phase.FULL -> SensorState(SensorKind.ARMED)
            phase == Phase.GAP && platform.standbyBucket() == "RESTRICTED" -> SensorState(SensorKind.NOT_ARMED, NotArmedReason.BATTERY_RESTRICTED)
            phase == Phase.GAP -> SensorState(SensorKind.NOT_ARMED, NotArmedReason.NOT_AVAILABLE)
            else -> SensorState(SensorKind.NOT_CHARGING)
        }
    }

    override fun setInstallId(id: String) = store.putState(KEY_INSTALL_ID, id)
    fun installId(): String? = store.getState(KEY_INSTALL_ID)

    @Synchronized
    override fun getPendingEvents(limit: Int): List<SensorEvent> {
        val now = clock.elapsedMs()
        val boot = clock.bootCount()
        return store.pending(limit).map { it.toSensorEvent(now, boot) }
    }

    @Synchronized
    override fun ackEvents(upToSeq: Long) {
        store.ack(upToSeq)
        store.prune(clock.elapsedMs(), clock.bootCount())
    }

    @Synchronized
    override fun getTelemetry(periodMs: Long): Telemetry {
        val now = clock.elapsedMs()
        val boot = clock.bootCount()
        return TelemetryCalc.compute(store.all().map { it.toSensorEvent(now, boot) }, now, periodMs)
    }

    /** Every stored event with its age at read time. For the daily telemetry aggregate (field-telemetry task 4). */
    @Synchronized
    fun recentEvents(): List<SensorEvent> {
        val now = clock.elapsedMs()
        val boot = clock.bootCount()
        return store.all().map { it.toSensorEvent(now, boot) }
    }

    @Synchronized
    override fun getDiagnostics(): Diagnostics {
        val counts = STOP_KEYS.mapNotNull { k -> store.getState("stop:$k")?.toIntOrNull()?.let { k to it } }.toMap()
        return Diagnostics(
            androidSdk = platform.androidSdk(),
            manufacturer = platform.manufacturer(),
            standbyBucket = platform.standbyBucket(),
            batteryExempt = platform.batteryExempt(),
            receiverRunning = receiverActive,
            receiverBlockedReason = store.getState(KEY_BLOCKED),
            notificationHidden = !platform.notificationsAllowed(),
            stopReasonCounts = counts,
            broadcastMismatches = store.getState(KEY_MISMATCH)?.toIntOrNull() ?: 0,
            writeFailures = store.getState(KEY_WRITE_FAILURES)?.toIntOrNull() ?: 0,
            recentGaps = getTelemetry(RETENTION_MS).gaps.takeLast(10),
        )
    }

    override fun addListener(listener: (SensorEvent) -> Unit): AutoCloseable {
        synchronized(listeners) { listeners += listener }
        return AutoCloseable { synchronized(listeners) { listeners -= listener } }
    }

    /** R12: stop both drivers and erase events, telemetry, state and the install ID. */
    @Synchronized
    override fun deleteAllData() {
        runCatching { platform.cancelJob() }
        runCatching { platform.stopReceiver() }
        receiverActive = false
        store.clearAll()
    }

    // ---- state rows ----

    private fun loadState(): MachineState {
        val phase = store.getState(KEY_PHASE)?.let { runCatching { Phase.valueOf(it) }.getOrNull() } ?: Phase.IDLE
        return MachineState(phase, store.getState(KEY_DROP)?.toLongOrNull())
    }

    private fun saveState(s: MachineState, boot: Int, now: Long) {
        store.putState(KEY_PHASE, s.phase.name)
        store.putState(KEY_DROP, s.dropElapsedMs?.toString())
        store.putState(KEY_BOOT, boot.toString())
        store.putState(KEY_ALIVE, now.toString())
    }

    private fun bump(key: String) {
        val n = (store.getState(key)?.toIntOrNull() ?: 0) + 1
        runCatching { store.putState(key, n.toString()) }
    }

    companion object {
        const val KEY_PHASE = "phase"
        const val KEY_DROP = "drop_elapsed_ms"
        const val KEY_BOOT = "boot_count"
        const val KEY_ALIVE = "last_alive_elapsed_ms"
        const val KEY_MISMATCH = "broadcast_mismatches"
        const val KEY_WRITE_FAILURES = "write_failures"
        const val KEY_BLOCKED = "receiver_blocked_reason"
        const val KEY_INSTALL_ID = "install_id"
        private val STOP_KEYS = (0..15).mapNotNull { StopReasons.name(it) } + "UNAVAILABLE"
    }
}
