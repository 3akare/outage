package app.outage.shell

import android.content.Context
import app.outage.onboarding.OnboardingFacts
import app.outage.onboarding.OnboardingFlow
import app.outage.onboarding.OnboardingStore
import app.outage.onboarding.PrefsOnboardingStore
import app.outage.ui.FeatureRegistry

/** The shell's long-lived objects, built once in [app.outage.OutageApp]. No sensor, service or upload starts here (R1.4). */
class ShellGraph(context: Context) {
    val store: ShellStore = PrefsShellStore(context)
    val areaCache = PrefsAreaCache(context)
    val connectivity: Connectivity = AndroidConnectivity(context)
    val sources: StatusSources = object : StatusSources by NoStatusSources {
        override fun areaStatus(): AreaStatus? = areaCache.read()
    }
    val onboarding: OnboardingStore = PrefsOnboardingStore(context)
    val deletes = DeleteRegistry(store).also {
        it.register("shell") { store.clearAll() }
        it.register("area_cache") { areaCache.clear() }
        it.register("onboarding") { onboarding.clear() }
    }
    val features = FeatureRegistry(deletes)

    /** First run is one screen with one button (ADR 0026), so it is needed until it has been done once. */
    fun onboardingNeeded(): Boolean = !store.onboardingDone

    /** The OK button: records consent and finishes setup in one step. Returns false if the record could not be written. */
    fun completeFirstRun(nowMs: Long): Boolean {
        val flow = OnboardingFlow.open(onboarding, OnboardingFacts(notificationsOk = true, fullScreenOk = true, batteryExempt = false))
        val ok = flow.firstRun(OnboardingFlow.CONSENT_VERSION, nowMs)
        if (ok) store.onboardingDone = true
        return ok
    }
}
