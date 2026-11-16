package app.outage

import android.app.Application
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import app.outage.home.HomeApi
import app.outage.home.HomeCredentials
import app.outage.home.HomeWatchModel
import app.outage.home.PrefsPairBook
import app.outage.home.UrlConnectionHomeHttp
import app.outage.insights.InsightsSources
import app.outage.log.BandConfig
import app.outage.map.AreaMapSources
import app.outage.map.FileMapCache
import app.outage.map.MapHttp
import app.outage.net.IngestApi
import app.outage.net.PrefsCredentials
import app.outage.net.UploadDriver
import app.outage.net.UrlConnectionPost
import app.outage.sensor.Sensor
import app.outage.shell.PrefsFollowedArea
import app.outage.shell.ShellGraph
import app.outage.ui.BatterySetupScreen
import app.outage.ui.DemoViewModel
import app.outage.ui.FeatureRegistry
import app.outage.ui.JudgeScreen
import app.outage.ui.loadReplayAsset
import app.outage.ui.HomeWatchCard
import app.outage.ui.HomeWatchScreen
import app.outage.ui.HomeWatchViewModel
import app.outage.ui.StationPairScreen
import app.outage.ui.SensorToggleScreen
import app.outage.ui.InsightsScreen
import app.outage.ui.MapScreen
import java.io.File
import java.util.concurrent.Executors
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class OutageApp : Application() {
    lateinit var graph: ShellGraph
        private set

    override fun onCreate() {
        super.onCreate()
        graph = ShellGraph(this)
        registerMapAndInsights()
        registerSensor()
        registerHomeWatch()
        registerJudgeMode()
        // A server delete that failed earlier is retried here, off the main thread (R5.3). After registerSensor,
        // which registers the server half.
        if (graph.store.pendingServerDelete) Thread { graph.deletes.retryPending() }.start()
        // Feature packages register their screens and delete functions on `graph.features` and
        // `graph.deletes` here, as they are built. Nothing else starts at app start (R1.4).
    }

    /**
     * Sensor and upload (sensor-android, station-mode, event-ingest task 10). The sensor itself is built lazily on first
     * use, off the main thread. Upload runs only with a Worker address (ADR 0024) and only once a cell is chosen.
     */
    private fun registerSensor() {
        val credentials = PrefsCredentials(this)
        val onboarding = graph.onboarding
        val io = Executors.newSingleThreadExecutor()
        var upload: UploadDriver? = null
        val prefs = getSharedPreferences("sensor_switch", MODE_PRIVATE)
        graph.sensorStarter = {
            if (prefs.getBoolean("on", true)) io.execute {
                val sensor = Sensor.get(this)
                sensor.start()
                if (upload == null && BuildConfig.API_BASE.isNotBlank()) {
                    upload = UploadDriver(IngestApi(BuildConfig.API_BASE, UrlConnectionPost), credentials, sensor) { onboarding.load()?.cell }
                        .also { it.start() }
                }
            }
        }
        graph.features.register("battery", R.string.settings_battery, { BatterySetupScreen() }, null)
        graph.features.register(
            "sensor",
            R.string.settings_sensor,
            {
                SensorToggleScreen({ prefs.getBoolean("on", true) }) { on ->
                    prefs.edit().putBoolean("on", on).apply()
                    if (on) graph.sensorStarter() else io.execute { Sensor.peek()?.stop() }
                }
            },
            null,
        )
        graph.sensorState = { Sensor.peek()?.state() }
        graph.deletes.register("sensor") { Sensor.get(this).deleteAllData() }
        if (BuildConfig.API_BASE.isNotBlank()) {
            val api = IngestApi(BuildConfig.API_BASE, UrlConnectionPost)
            graph.deletes.registerServer {
                val id = credentials.installId()
                val token = credentials.token()
                if (id == null || token == null) true
                else api.delete(id, token, credentials.cells(), deletedPairIds).also { ok -> if (ok) credentials.clear() }
            }
        }
    }

    /** Set by [registerHomeWatch]; the server delete lists its pair ids (home-watch R7.4). */
    /**
     * Judge mode (demo-mode task 6): reads only the bundled replay asset, writes nothing, so it has no delete function.
     * Opens from the first screen and from Settings.
     */
    private fun registerJudgeMode() {
        graph.features.register(FeatureRegistry.JUDGE, R.string.demo_home_title, {
            val vm: DemoViewModel = viewModel(factory = viewModelFactory { initializer { DemoViewModel({ loadReplayAsset(this@OutageApp) }) } })
            JudgeScreen(vm, onLeave = { graph.goBack() })
        }, null)
    }

    @Volatile
    private var deletedPairIds: List<String> = emptyList()

    /**
     * Home Watch (home-watch task 8): viewer screen in Settings > Home Watch, station screen in Settings > Station mode,
     * and a card on Home. Pairing needs the Worker; without an address the screens say so (ADR 0024).
     */
    private fun registerHomeWatch() {
        val credentials = PrefsCredentials(this)
        val book = PrefsPairBook(this)
        val api = BuildConfig.API_BASE.takeIf { it.isNotBlank() }?.let { HomeApi(it, UrlConnectionHomeHttp) }
        val model = HomeWatchModel(
            api = api,
            credentials = object : HomeCredentials {
                override fun installId() = credentials.installId()
                override fun token() = credentials.token()
            },
            book = book,
            cell = { graph.onboarding.load()?.cell },
            nowMs = System::currentTimeMillis,
            tzOffsetMin = { java.util.TimeZone.getDefault().getOffset(System.currentTimeMillis()) / 60_000 },
        )
        val vm: @androidx.compose.runtime.Composable () -> HomeWatchViewModel = {
            viewModel(
                factory = viewModelFactory { initializer { HomeWatchViewModel(model) } },
            )
        }
        graph.features.register(
            FeatureRegistry.HOME_WATCH,
            R.string.settings_home_watch,
            { HomeWatchScreen(vm(), onBack = { graph.goBack() }, onOpenStation = { graph.openFeature(FeatureRegistry.STATION) }) },
            // The phone side runs before the server call (app-shell R5), so keep the ids in memory for it.
            { deletedPairIds = model.pairIdsForDelete(); book.clear() },
        )
        graph.features.register(FeatureRegistry.STATION, R.string.settings_station, { StationPairScreen(vm(), onBack = { graph.goBack() }) }, null)
        graph.features.register(FeatureRegistry.HOME_CARD, R.string.settings_home_watch, {
            HomeWatchCard(vm(), onOpen = { graph.openFeature(FeatureRegistry.HOME_WATCH) })
        }, null)
    }

    /**
     * Area map and Insights (spec app-map-insights). Demo sources until a Worker address is built in and the Power Log
     * timeline exists; both screens then carry the Simulated label (R5).
     */
    private fun registerMapAndInsights() {
        val cache = FileMapCache(File(filesDir, "map"))
        val followed = PrefsFollowedArea(this)
        val source = AreaMapSources.choose(BuildConfig.API_BASE, cache) { url -> withContext(Dispatchers.IO) { MapHttp.get(url) } }
        graph.features.register(FeatureRegistry.AREA, R.string.nav_home, { MapScreen(source, followed) }, null)
        graph.deletes.register("map_cache") { cache.clear() }
        graph.deletes.register("followed_area") { followed.clear() }

        val band = try {
            BandConfig.parse(assets.open(BandConfig.ASSET_NAME).bufferedReader().use { it.readText() }).band("A")
        } catch (_: Exception) {
            null
        }
        val insights = InsightsSources.choose(BuildConfig.API_BASE, band)
        graph.features.register(FeatureRegistry.INSIGHTS, R.string.nav_insights, { InsightsScreen(insights) }, null)
    }
}
