package app.outage.shell

import android.content.Context
import app.outage.ui.FeatureRegistry

/** The shell's long-lived objects, built once in [app.outage.OutageApp]. No sensor, service or upload starts here (R1.4). */
class ShellGraph(context: Context) {
    val store: ShellStore = PrefsShellStore(context)
    val areaCache = PrefsAreaCache(context)
    val connectivity: Connectivity = AndroidConnectivity(context)
    val sources: StatusSources = object : StatusSources by NoStatusSources {
        override fun areaStatus(): AreaStatus? = areaCache.read()
    }
    val deletes = DeleteRegistry(store).also {
        it.register("shell") { store.clearAll() }
        it.register("area_cache") { areaCache.clear() }
    }
    val features = FeatureRegistry(deletes)

    /** True when the app has an onboarding screen to show: a registered feature, or the debug placeholder. */
    var debugPlaceholderAllowed: Boolean = false

    fun onboardingNeeded(): Boolean =
        !store.onboardingDone && (features.has(FeatureRegistry.ONBOARDING) || debugPlaceholderAllowed)
}
