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
