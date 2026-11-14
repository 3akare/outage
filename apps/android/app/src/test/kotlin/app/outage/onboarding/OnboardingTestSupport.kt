package app.outage.onboarding

import kotlin.random.Random

/** In-memory store that round-trips through the codec, like the SharedPreferences store does. */
internal class MemoryStore : OnboardingStore {
    var saved: Map<String, String>? = null
    var saves = 0
    override fun load(): OnboardingRecord? = saved?.let { OnboardingCodec.decode(it) }
    override fun save(record: OnboardingRecord) { saved = OnboardingCodec.encode(record); saves++ }
    override fun clear() { saved = null }
}

internal object Gen {
    const val CELL = "88a5a9d8e1fffff"
    private const val HEX = "0123456789abcdef"

    fun cell(r: Random): String = "88" + (1..13).map { HEX[r.nextInt(16)] }.joinToString("")
    fun facts(r: Random) = OnboardingFacts(r.nextBoolean(), r.nextBoolean(), r.nextBoolean())
    val allSet = OnboardingFacts(notificationsOk = true, fullScreenOk = true, batteryExempt = true)
    val noneSet = OnboardingFacts(notificationsOk = false, fullScreenOk = false, batteryExempt = false)

    /** Any record at all, including inconsistent ones a bug or an old version could leave behind. */
    fun record(r: Random): OnboardingRecord {
        val consent = r.nextBoolean()
        return OnboardingRecord(
            step = OnboardingStep.entries[r.nextInt(OnboardingStep.entries.size)],
            consentVersion = if (consent) 1 else r.nextInt(2),
            consentAtMs = if (consent) r.nextLong(1, 1_000_000) else null,
            cell = when (r.nextInt(3)) { 0 -> null; 1 -> cell(r); else -> "not-a-cell" },
            areaName = if (r.nextBoolean()) "Yaba" else null,
            postcodePrefix = if (r.nextBoolean()) "100" else null,
            diagnosticsOptIn = r.nextBoolean(),
            skips = List(r.nextInt(3)) { OnboardingStep.NOTIFICATIONS },
            stepTimesMs = if (r.nextBoolean()) mapOf(OnboardingStep.SPOT to r.nextLong(1, 9000)) else emptyMap(),
            completed = r.nextInt(5) == 0,
        )
    }

    /** One random action, valid or not. Returns a label for failure messages. */
    fun act(flow: OnboardingFlow, r: Random, facts: OnboardingFacts): String = when (r.nextInt(8)) {
        0 -> { flow.startSetup(facts, r.nextLong(0, 5000)); "startSetup" }
        1 -> { flow.chooseSpot(cell(r), "Yaba", "100", facts, r.nextLong(0, 5000)); "chooseSpot" }
        2 -> { flow.chooseSpot("12.5,3.4", null, null, facts); "chooseSpotBad" }
        3 -> { flow.agree(OnboardingFlow.CONSENT_VERSION, r.nextLong(1, 1_000_000), r.nextBoolean(), facts, r.nextLong(0, 5000)); "agree" }
        4 -> { flow.complete(facts, r.nextLong(0, 5000)); "complete" }
        5 -> { flow.skip(facts, r.nextLong(0, 5000)); "skip" }
        6 -> { flow.back(facts); "back" }
        else -> { flow.agree(0, 5, false, facts); "agreeBad" }
    }

    /** Takes the right action for the current step, so a flow can be driven to the end. */
    fun cooperate(flow: OnboardingFlow, r: Random, facts: OnboardingFacts) {
        when (flow.current) {
            OnboardingStep.WELCOME -> flow.startSetup(facts)
            OnboardingStep.SPOT -> flow.chooseSpot(cell(r), null, null, facts)
            OnboardingStep.CONSENT -> flow.agree(OnboardingFlow.CONSENT_VERSION, 1000, false, facts)
            else -> if (flow.current.skippable && r.nextBoolean()) flow.skip(facts) else flow.complete(facts)
        }
    }
}
