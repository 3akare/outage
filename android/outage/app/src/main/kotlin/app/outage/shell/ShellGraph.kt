package app.outage.shell

import android.content.Context
import app.outage.onboarding.OnboardingFacts
import app.outage.onboarding.OnboardingFlow
import app.outage.onboarding.OnboardingStore
import app.outage.onboarding.PrefsOnboardingStore
import app.outage.sensor.SensorState
import app.outage.ui.FeatureRegistry
import app.outage.ui.SpotOutcome

/**
 * The shell's long-lived objects, built once in [app.outage.OutageApp]. Nothing starts here (R1.4); the sensor starts
 * after first run and when the app is shown (ADR 0032), through [sensorStarter].
 */
class ShellGraph(context: Context) {
    val store: ShellStore = PrefsShellStore(context)
    val areaCache = PrefsAreaCache(context)
    val connectivity: Connectivity = AndroidConnectivity(context)

    /** Set by the sensor feature. Called after first run and on each app resume once set up. */
    var sensorStarter: () -> Unit = {}

    /** Set by the shell while it is shown, so a feature screen can open another feature or go back. */
    var openFeature: (String) -> Unit = {}
    var goBack: () -> Unit = {}

    /** Set by the sensor feature; Home shows it (app-shell R2.1). */
    var sensorState: () -> SensorState? = { null }

    /** Set by the spot feature: reads the position once, saves the cell and drops the position (first run, ADR 0050). */
    var locateSpot: suspend () -> SpotOutcome = { SpotOutcome.NotFound }

    /** Set by the Power Log: the chosen tariff band id (A to E) and its promised hours a day, for the Home card. */
    var band: () -> Pair<String, Int>? = { null }

    val sources: StatusSources = object : StatusSources by NoStatusSources {
        override fun areaStatus(): AreaStatus? = areaCache.read()
        override fun sensorState(): SensorState? = this@ShellGraph.sensorState()
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
        if (ok) {
            store.onboardingDone = true
            sensorStarter()
        }
        return ok
    }
}
