package app.outage.log

import java.time.ZoneId

/**
 * What the Power Log screen needs, in one place and without Android types (power-log design section 2). Every call
 * touches the database, so call them off the main thread.
 */
class PowerLogService(
    val store: LogStore,
    val recorder: LogRecorder,
    /** Fetches the spot's public outages when a cell and a Worker address exist (R9). Null in demo builds. */
    private val areaSync: AreaOutageSync?,
    private val cell: () -> String?,
    private val clock: () -> Long = System::currentTimeMillis,
) {
    fun load(zone: ZoneId = ZoneId.systemDefault()): PowerLogView =
        PowerLogModel.build(store.all(), clock(), zone)

    /** R9.1: one sync per screen open. A failure keeps the cache (R9.4). */
    fun syncArea() {
        val c = cell() ?: return
        runCatching { areaSync?.sync(c, clock()) }
        recorder.afterExternalChange()
    }

    fun powerOut(): TapResult = recorder.powerOut()
    fun powerBack(): TapResult = recorder.powerBack()
    fun reportWaitMs(): Long = recorder.reportWaitMs()
}
