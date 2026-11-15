package app.outage

import android.app.Application
import android.content.pm.ApplicationInfo
import app.outage.insights.DemoInsightsSource
import app.outage.log.BandConfig
import app.outage.map.AreaMapSources
import app.outage.map.FileMapCache
import app.outage.map.MapHttp
import app.outage.shell.PrefsFollowedArea
import app.outage.shell.ShellGraph
import app.outage.ui.FeatureRegistry
import app.outage.ui.InsightsScreen
import app.outage.ui.MapScreen
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class OutageApp : Application() {
    lateinit var graph: ShellGraph
        private set

    override fun onCreate() {
        super.onCreate()
        graph = ShellGraph(this)
        // https://developer.android.com/reference/android/content/pm/ApplicationInfo#FLAG_DEBUGGABLE
        graph.debugPlaceholderAllowed = (applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0
        // A server delete that failed earlier is retried here, off the main thread (R5.3).
        if (graph.store.pendingServerDelete) Thread { graph.deletes.retryPending() }.start()
        registerMapAndInsights()
        // Feature packages register their screens and delete functions on `graph.features` and
        // `graph.deletes` here, as they are built. Nothing else starts at app start (R1.4).
    }

    /**
     * Area map and Insights (spec app-map-insights). Demo sources until a Worker address is built in and the Power Log
     * timeline exists; both screens then carry the Simulated label (R5).
     */
    private fun registerMapAndInsights() {
        val cache = FileMapCache(File(filesDir, "map"))
        val followed = PrefsFollowedArea(this)
        val source = AreaMapSources.choose(BuildConfig.API_BASE, cache) { url -> withContext(Dispatchers.IO) { MapHttp.get(url) } }
        graph.features.register(FeatureRegistry.AREA, R.string.nav_area, { MapScreen(source, followed) }, null)
        graph.deletes.register("map_cache") { cache.clear() }
        graph.deletes.register("followed_area") { followed.clear() }

        val band = try {
            BandConfig.parse(assets.open(BandConfig.ASSET_NAME).bufferedReader().use { it.readText() }).band("A")
        } catch (_: Exception) {
            null
        }
        val insights = DemoInsightsSource(band)
        graph.features.register(FeatureRegistry.INSIGHTS, R.string.nav_insights, { InsightsScreen(insights) }, null)
    }
}
