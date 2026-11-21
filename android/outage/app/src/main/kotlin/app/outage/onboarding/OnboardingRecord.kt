package app.outage.onboarding

/**
 * The persisted onboarding record (design sections 3 and 8). Phone only (R12.3).
 * It holds the cell, never a coordinate (O2): there is no field that could carry one.
 */
data class OnboardingRecord(
    val step: OnboardingStep = OnboardingStep.WELCOME,
    val consentVersion: Int = 0,
    val consentAtMs: Long? = null,
    val cell: String? = null,
    val areaName: String? = null,
    val postcodePrefix: String? = null,
    val diagnosticsOptIn: Boolean = false,
    /** Steps the user skipped, in order, for diagnostics (R7.8). */
    val skips: List<OnboardingStep> = emptyList(),
    /** Milliseconds spent on each step, shown in diagnostics (R1.3). */
    val stepTimesMs: Map<OnboardingStep, Long> = emptyMap(),
    val completed: Boolean = false,
) {
    val hasConsent: Boolean get() = consentAtMs != null && consentVersion > 0
}

/** Where the record lives. SharedPreferences on the phone, a fake in tests (so the core runs on the JVM). */
interface OnboardingStore {
    fun load(): OnboardingRecord?
    fun save(record: OnboardingRecord)
    fun clear()
}

/**
 * Flat string form of a record, so a key-value store can hold it. Unreadable data decodes to null (start over, design
 * section 9). Step names are read leniently: a step this version no longer has (STATION_OFFER, removed with Home Watch
 * in ADR 0055) is dropped from skips and step times, and as the current step it becomes FINISH, so a saved record from
 * an older version does not restart onboarding. [OnboardingFlow.normalize] still moves an unearned FINISH back.
 */
object OnboardingCodec {
    private fun stepOf(name: String): OnboardingStep? = OnboardingStep.entries.firstOrNull { it.name == name }

    fun encode(r: OnboardingRecord): Map<String, String> {
        val m = LinkedHashMap<String, String>()
        m["step"] = r.step.name
        m["consentVersion"] = r.consentVersion.toString()
        r.consentAtMs?.let { m["consentAtMs"] = it.toString() }
        r.cell?.let { m["cell"] = it }
        r.areaName?.let { m["areaName"] = it }
        r.postcodePrefix?.let { m["postcodePrefix"] = it }
        m["diagnosticsOptIn"] = r.diagnosticsOptIn.toString()
        m["skips"] = r.skips.joinToString(",") { it.name }
        m["stepTimesMs"] = r.stepTimesMs.entries.joinToString(",") { it.key.name + "=" + it.value }
        m["completed"] = r.completed.toString()
        return m
    }

    fun decode(m: Map<String, String>): OnboardingRecord? {
        return try {
            val step = stepOf(m["step"] ?: return null) ?: OnboardingStep.FINISH
            OnboardingRecord(
                step = step,
                consentVersion = m["consentVersion"]?.toInt() ?: 0,
                consentAtMs = m["consentAtMs"]?.toLong(),
                cell = m["cell"],
                areaName = m["areaName"],
                postcodePrefix = m["postcodePrefix"],
                diagnosticsOptIn = m["diagnosticsOptIn"] == "true",
                skips = m["skips"].orEmpty().split(',').filter { it.isNotEmpty() }.mapNotNull { stepOf(it) },
                stepTimesMs = m["stepTimesMs"].orEmpty().split(',').filter { it.isNotEmpty() }.mapNotNull {
                    val (k, v) = it.split('=')
                    val ms = v.toLong() // a bad number is still unreadable data
                    stepOf(k)?.let { s -> s to ms }
                }.toMap(),
                completed = m["completed"] == "true",
            )
        } catch (e: IllegalArgumentException) {
            null
        } catch (e: IndexOutOfBoundsException) {
            null
        }
    }
}
