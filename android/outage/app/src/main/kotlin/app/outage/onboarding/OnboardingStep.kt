package app.outage.onboarding

/** The steps of onboarding in order (onboarding R1.1, design section 3). Pure Kotlin: no Android imports. */
enum class OnboardingStep {
    WELCOME, SPOT, CONSENT, NOTIFICATIONS, BATTERY, SELF_TEST, STATION_OFFER, FINISH;

    /** True for steps the user may skip with one tap (R6.6, R7.8, R8.5, R9.4). Spot and Consent cannot be skipped. */
    val skippable: Boolean get() = this == NOTIFICATIONS || this == BATTERY || this == SELF_TEST || this == STATION_OFFER
}

/**
 * Facts the machine reads from the system. The caller (view model) fills them in on each call.
 * Re-onboarding is the same machine: steps whose facts are already true are skipped (R10.2, R10.3).
 */
data class OnboardingFacts(
    /** True when the phone does not ask for the notification permission (below Android 13) or it is granted. */
    val notificationsOk: Boolean,
    /** True when full-screen intents are allowed, or the phone does not restrict them. */
    val fullScreenOk: Boolean,
    /** `PowerManager.isIgnoringBatteryOptimizations` result. */
    val batteryExempt: Boolean,
) {
    /** Every permission and the exemption are already in place: the phone was reset or the app was reinstalled (R10). */
    val allSet: Boolean get() = notificationsOk && fullScreenOk && batteryExempt
}
