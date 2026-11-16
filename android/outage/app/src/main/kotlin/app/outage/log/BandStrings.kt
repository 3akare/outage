package app.outage.log

/**
 * String keys the supply-promise copy needs (power-log R5, task 3). Names only; the words live in the
 * string pack (the res/values and res/values-pcm strings.xml files). The promise copy must always read as
 * an estimate and must never use the words refund, compensation or claim (R5.4, property PL6).
 */
object BandStrings {
    val ALL = listOf(
        "band_picker_title",
        "band_picker_hint",
        "band_none",
        "band_name",
        "band_promise",
        "band_promise_unconfirmed",
        "promise_estimate_note",
        "promise_days_below",
        "promise_avg_below",
        "promise_met",
    )

    /** Words the promise copy must never contain (R5.4). */
    val FORBIDDEN = listOf("refund", "compensation", "claim")
}
