package app.outage.insights

import java.time.ZoneId
import java.util.Random

/**
 * About 60 days of labelled sample outages for demo mode and judges (R5, demo-mode.md). Deterministic: the same seed and
 * the same `nowMs` give the same list. Outages cluster on weekday evenings so the heatmap has a visible pattern.
 * Every object is simulated; this is never written to the Power Log.
 */
object DemoOutages {
    const val DAYS = 60
    const val SEED = 20261115L

    fun build(nowMs: Long, zone: ZoneId, seed: Long = SEED): InsightsInput {
        val rnd = Random(seed)
        val today = java.time.Instant.ofEpochMilli(nowMs).atZone(zone).toLocalDate()
        val out = ArrayList<Outage>()
        for (back in DAYS downTo 1) {
            val d = today.minusDays(back.toLong())
            val weekday = d.dayOfWeek.value <= 5
            val n = if (rnd.nextInt(100) < (if (weekday) 80 else 45)) 1 + rnd.nextInt(2) else 0
            repeat(n) { i ->
                val hour = if (i == 0) 17 + rnd.nextInt(5) else 5 + rnd.nextInt(10)
                val start = d.atStartOfDay(zone).plusHours(hour.toLong()).plusMinutes(rnd.nextInt(60).toLong()).toInstant().toEpochMilli()
                val minutes = 20 + rnd.nextInt(220)
                out += Outage(start, start + minutes * 60_000L, simulated = true)
            }
        }
        val from = today.minusDays(DAYS.toLong()).atStartOfDay(zone).toInstant().toEpochMilli()
        return InsightsInput(out.sortedBy { it.startMs }, observedFromMs = from, simulated = true)
    }
}
