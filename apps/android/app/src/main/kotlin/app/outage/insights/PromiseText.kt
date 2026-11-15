package app.outage.insights

import java.util.Locale

/**
 * Plain-English promise sentence for tests and text summaries (R9). The shipped words live in the string pack;
 * this keeps the claims rules (never refund, compensation or claim; unverified means "unconfirmed") checkable on the JVM.
 */
object PromiseText {
    val FORBIDDEN = listOf("refund", "compensation", "claim")

    fun line(p: PromiseCheck): String {
        val avg = String.format(Locale.US, "%.1f", p.avgPowerHours)
        val diff = String.format(Locale.US, "%.1f", kotlin.math.abs(p.diffHours))
        val vs = if (p.diffHours >= 0) "$diff h above" else "$diff h below"
        val tail = if (p.verified) "" else " (unconfirmed)"
        return "Estimate: $avg h of power a day, $vs the Band ${p.bandId} promise of ${p.promisedHours} h$tail."
    }
}
