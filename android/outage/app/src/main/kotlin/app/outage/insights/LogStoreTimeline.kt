package app.outage.insights

import app.outage.log.Band
import app.outage.log.LogState
import app.outage.log.LogStore
import app.outage.log.TimelineBuilder

/**
 * The real Power Log timeline for Insights (app-map-insights task 6, R5, R10). Outages are the `OUT` intervals the
 * [TimelineBuilder] rebuilds from the raw inputs; observation starts at the first interval with a known state. Time with
 * the phone off the charger or not watching is not watched time and never counts as power, the same rule as the log's
 * Light Score ([app.outage.log.Stats.scoreOf]).
 */
class LogStoreTimeline(private val store: LogStore, private val clock: () -> Long = System::currentTimeMillis) : PowerLogTimeline {
    private fun intervals() = TimelineBuilder.build(store.all(), clock())

    override fun outages(): List<Outage> =
        intervals().filter { it.state == LogState.OUT }.map { Outage(it.startMs, it.endMs) }

    override fun observedFromMs(nowMs: Long): Long =
        intervals().firstOrNull { it.state == LogState.ON || it.state == LogState.OUT }?.startMs ?: nowMs

    override fun watched(): List<Watched> =
        intervals().filter { it.state == LogState.ON || it.state == LogState.OUT }.map { Watched(it.startMs, it.endMs) }
}

/** The real log once it holds data, otherwise the labelled demo (demo builds only; a build with a Worker address never shows the demo). */
class RealOrDemoInsightsSource(
    private val real: PowerLogInsightsSource,
    private val demo: InsightsSource,
) : InsightsSource {
    override fun input(nowMs: Long, zone: java.time.ZoneId): InsightsInput {
        val r = real.input(nowMs, zone)
        return if (r.outages.isNotEmpty() || r.observedFromMs < nowMs) r else demo.input(nowMs, zone)
    }

    override fun band(): Band? = real.band()
}
