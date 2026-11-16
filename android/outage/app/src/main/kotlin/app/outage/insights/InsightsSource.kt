package app.outage.insights

import app.outage.log.Band
import java.time.ZoneId

/**
 * Where Insights gets the outage timeline (design section 3). The real Power Log timeline plugs in here when
 * it exists; until then [DemoInsightsSource] supplies labelled sample data (R5, R10).
 */
interface InsightsSource {
    fun input(nowMs: Long, zone: ZoneId): InsightsInput
    fun band(): Band?
}

class DemoInsightsSource(private val demoBand: Band?) : InsightsSource {
    override fun input(nowMs: Long, zone: ZoneId): InsightsInput = DemoOutages.build(nowMs, zone)
    override fun band(): Band? = demoBand
}

/** The user's own outage record. The Power Log feature supplies the real one; until it exists [None] has nothing. */
interface PowerLogTimeline {
    fun outages(): List<Outage>
    fun observedFromMs(nowMs: Long): Long

    object None : PowerLogTimeline {
        override fun outages(): List<Outage> = emptyList()
        override fun observedFromMs(nowMs: Long): Long = nowMs
    }
}

/**
 * Real data only, never simulated (R5, R10). With no timeline yet this returns an empty input, so the screen shows
 * its empty state instead of invented outages.
 */
class PowerLogInsightsSource(private val timeline: PowerLogTimeline, private val bandProvider: () -> Band?) : InsightsSource {
    constructor(timeline: PowerLogTimeline, band: Band?) : this(timeline, { band })

    override fun input(nowMs: Long, zone: ZoneId): InsightsInput =
        InsightsInput(timeline.outages(), timeline.observedFromMs(nowMs), simulated = false)
    override fun band(): Band? = bandProvider()
}

object InsightsSources {
    /** Demo only while no Worker address is built in; with one set the user sees their own record or an empty state. */
    fun choose(apiBase: String, band: Band?): InsightsSource =
        if (apiBase.isBlank()) DemoInsightsSource(band) else PowerLogInsightsSource(PowerLogTimeline.None, band)

    /**
     * The real Power Log timeline (task 6). With a Worker address the user always sees their own record or an empty
     * state. Without one (demo build) the real record shows once it has data, and until then the labelled demo (R5).
     */
    fun choose(apiBase: String, band: () -> Band?, timeline: PowerLogTimeline): InsightsSource {
        val real = PowerLogInsightsSource(timeline, band)
        return if (apiBase.isBlank()) RealOrDemoInsightsSource(real, DemoInsightsSource(band())) else real
    }
}
