package app.outage.onboarding

/**
 * The onboarding state machine (onboarding design section 3). Pure Kotlin, no Android types.
 *
 * Every change is saved to the [OnboardingStore] before the call returns, so the flow resumes at
 * the same step after the app is closed (R1.5, O7). Facts about the system are passed in per call.
 *
 * Rules the machine enforces whatever the caller does (O1):
 * - Consent is never skipped and nothing past it is reachable without consent (R4.3).
 * - A step whose facts are already true is skipped, not shown (R10.2, R10.3).
 * - Every path ends at [OnboardingStep.FINISH].
 */
class OnboardingFlow private constructor(
    private val store: OnboardingStore,
    private var record: OnboardingRecord,
) {
    val current: OnboardingStep get() = record.step
    val snapshot: OnboardingRecord get() = record

    /** True once the user agreed. Registration and any event upload wait for this (R4.3, R5.3, O3). */
    val registrationAllowed: Boolean get() = record.hasConsent

    /** Welcome, "Set up my phone". Judge mode is outside this flow and records nothing (R2.2). */
    fun startSetup(facts: OnboardingFacts, elapsedMs: Long = 0): Boolean =
        if (record.step == OnboardingStep.WELCOME) { moveForward(facts, elapsedMs); true } else false

    /**
     * The one-step first run (ADR 0026): one button records consent and finishes setup. Only from Welcome.
     * The spot, battery steps and the rest move to setup cards on Home and to Settings, so no cell is needed yet.
     * Consent still comes first: nothing registers or uploads before this call (R4.3).
     */
    fun firstRun(version: Int, atMs: Long): Boolean {
        if (record.step != OnboardingStep.WELCOME || version < 1) return false
        record = record.copy(
            step = OnboardingStep.FINISH, consentVersion = version, consentAtMs = atMs, completed = true,
        )
        store.save(record)
        return true
    }

    /** Spot chosen. Takes the cell only (O2). Returns false for text that is not a res-8 cell. */
    fun chooseSpot(cell: String, areaName: String?, postcodePrefix: String?, facts: OnboardingFacts, elapsedMs: Long = 0): Boolean {
        if (record.step != OnboardingStep.SPOT || !isCell(cell)) return false
        record = record.copy(cell = cell, areaName = areaName, postcodePrefix = postcodePrefix?.takeIf { it.isNotBlank() })
        moveForward(facts, elapsedMs)
        return true
    }

    /** "I agree". Stores the consent version and time on the phone (R4.4). */
    fun agree(version: Int, atMs: Long, diagnosticsOptIn: Boolean, facts: OnboardingFacts, elapsedMs: Long = 0): Boolean {
        if (record.step != OnboardingStep.CONSENT || version < 1 || record.cell == null) return false
        record = record.copy(consentVersion = version, consentAtMs = atMs, diagnosticsOptIn = diagnosticsOptIn)
        moveForward(facts, elapsedMs)
        return true
    }

    /** The step is done (permission asked, steps read, self-test passed, station chosen). Does not pass Spot or Consent. */
    fun complete(facts: OnboardingFacts, elapsedMs: Long = 0): Boolean {
        val s = record.step
        if (!canLeave(s)) return false
        if (s == OnboardingStep.FINISH) {
            record = record.copy(completed = true, stepTimesMs = addTime(s, elapsedMs))
            store.save(record)
            return true
        }
        moveForward(facts, elapsedMs)
        return true
    }

    /** Skip the current step. Only the optional ones can be skipped. The skip is recorded for diagnostics (R7.8). */
    fun skip(facts: OnboardingFacts, elapsedMs: Long = 0): Boolean {
        val s = record.step
        if (!s.skippable) return false
        record = record.copy(skips = record.skips + s)
        moveForward(facts, elapsedMs)
        return true
    }

    /** Back button: the previous shown step, with all choices kept (design section 9). */
    fun back(facts: OnboardingFacts): Boolean {
        var p = record.step.ordinal - 1
        while (p > 0 && autoSkipped(OnboardingStep.entries[p], facts)) p--
        if (p < 0) return false
        record = record.copy(step = OnboardingStep.entries[p])
        store.save(record)
        return true
    }

    /** Delete my data: forget everything (R4.6). */
    fun reset() {
        store.clear()
        record = OnboardingRecord()
    }

    private fun canLeave(s: OnboardingStep): Boolean = when (s) {
        OnboardingStep.WELCOME -> true
        OnboardingStep.SPOT -> record.cell != null
        OnboardingStep.CONSENT -> record.hasConsent
        else -> true
    }

    private fun moveForward(facts: OnboardingFacts, elapsedMs: Long) {
        val from = record.step
        val times = addTime(from, elapsedMs)
        var n = from.ordinal + 1
        while (n < OnboardingStep.FINISH.ordinal && autoSkipped(OnboardingStep.entries[n], facts)) n++
        record = record.copy(step = OnboardingStep.entries[minOf(n, OnboardingStep.FINISH.ordinal)], stepTimesMs = times)
        store.save(record)
    }

    private fun addTime(s: OnboardingStep, ms: Long): Map<OnboardingStep, Long> =
        if (ms <= 0) record.stepTimesMs else record.stepTimesMs + (s to (record.stepTimesMs[s] ?: 0L) + ms)

    companion object {
        /** Consent text version the app shows. Bump when the list of what is collected changes (R4.4). */
        const val CONSENT_VERSION = 1

        /** H3 index text at resolution 8: 15 hex digits starting "88". The phone computes it; coordinates are gone by then. */
        private val CELL = Regex("^88[0-9a-f]{13}$")
        fun isCell(text: String): Boolean = CELL.matches(text)

        /**
         * Steps that are not shown because their facts are already true (R10.2, R10.3).
         * When all permissions and the exemption are in place (a reset or reinstalled phone), only Spot, Consent and
         * Finish remain (R10.5, O8); the self-test and Station offer wait in Settings. Open question for the human.
         */
        fun autoSkipped(step: OnboardingStep, facts: OnboardingFacts): Boolean = when (step) {
            OnboardingStep.NOTIFICATIONS -> facts.notificationsOk && facts.fullScreenOk
            OnboardingStep.BATTERY, OnboardingStep.SELF_TEST, OnboardingStep.STATION_OFFER -> facts.allSet
            else -> false
        }

        /**
         * Open the flow: load the record, repair anything inconsistent, move past steps now auto-skipped, save.
         * A missing or unreadable record starts at Welcome (design section 9).
         */
        fun open(store: OnboardingStore, facts: OnboardingFacts): OnboardingFlow {
            val loaded = try { store.load() } catch (e: Exception) { null } ?: OnboardingRecord()
            val flow = OnboardingFlow(store, normalize(loaded, facts))
            store.save(flow.record)
            return flow
        }

        internal fun normalize(r: OnboardingRecord, facts: OnboardingFacts): OnboardingRecord {
            var rec = r
            // A first run (ADR 0026) is finished with consent and no cell. Keep it as it is.
            if (rec.completed && rec.hasConsent && rec.step == OnboardingStep.FINISH) {
                return if (rec.cell != null && !isCell(rec.cell!!)) rec.copy(cell = null, areaName = null) else rec
            }
            if (rec.cell != null && !isCell(rec.cell!!)) rec = rec.copy(cell = null, areaName = null)
            var step = rec.step
            // Nothing past Spot without a cell, nothing past Consent without consent (R4.3).
            if (step.ordinal > OnboardingStep.SPOT.ordinal && rec.cell == null) step = OnboardingStep.SPOT
            if (step.ordinal > OnboardingStep.CONSENT.ordinal && !rec.hasConsent) step = minOf(step, OnboardingStep.CONSENT)
            while (step.ordinal < OnboardingStep.FINISH.ordinal && autoSkipped(step, facts)) step = OnboardingStep.entries[step.ordinal + 1]
            return rec.copy(step = step)
        }
    }
}

/**
 * Wraps the register call so it cannot run before consent (O3, R4.3, R5.3). The sensor uploader asks
 * [mayUpload] before it sends anything; events stay in the Outbox until it says yes.
 */
class RegistrationGate(private val store: OnboardingStore, private val register: () -> Unit) {
    fun mayUpload(): Boolean = try { store.load()?.hasConsent == true } catch (e: Exception) { false }

    /** Runs the registration only when consent is stored. Returns whether it ran. */
    fun registerIfConsented(): Boolean {
        if (!mayUpload()) return false
        register()
        return true
    }
}
