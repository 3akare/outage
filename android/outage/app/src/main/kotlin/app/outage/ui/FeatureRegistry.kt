package app.outage.ui

import androidx.compose.runtime.Composable
import app.outage.shell.DeleteRegistry

/**
 * Features plug their screen into the shell here (design section 4). Whatever is not registered
 * shows "Coming soon". A feature's phone-side delete function is also added to [DeleteRegistry].
 */
class FeatureRegistry(private val deletes: DeleteRegistry) {
    class Feature(val key: String, val titleRes: Int, val screen: @Composable () -> Unit)

    private val features = LinkedHashMap<String, Feature>()

    fun register(key: String, titleRes: Int, screen: @Composable () -> Unit, deleteFn: (() -> Unit)? = null) {
        features[key] = Feature(key, titleRes, screen)
        if (deleteFn != null) deletes.register(key, deleteFn)
    }

    fun has(key: String): Boolean = features.containsKey(key)

    fun get(key: String): Feature? = features[key]

    companion object {
        const val ONBOARDING = "onboarding"
        const val LOG = "log"
        const val AREA = "area"
        const val INSIGHTS = "insights"
        const val ALARM = "alarm"
        const val JUDGE = "judge"
    }
}
