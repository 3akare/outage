package app.outage

import android.app.Application
import app.outage.freezer.AndroidFreezerAlarms
import app.outage.freezer.FreezerGuard
import app.outage.insights.InsightsSources
import app.outage.insights.LogStoreTimeline
import app.outage.log.AreaOutageSync
import app.outage.log.BandChoice
import app.outage.log.FileOutageCache
import app.outage.log.LogRecorder
import app.outage.log.LogStore
import app.outage.log.LogStores
import app.outage.log.PowerLogService
import app.outage.log.BandConfig
import app.outage.map.AreaMapSources
import app.outage.map.FileMapCache
import app.outage.map.MapHttp
import app.outage.net.IngestApi
import app.outage.net.PrefsCredentials
import app.outage.net.UploadDriver
import app.outage.net.UrlConnectionPost
import app.outage.sensor.Sensor
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import app.outage.shell.PrefsFollowedArea
import app.outage.shell.ShellGraph
import app.outage.ui.BatterySetupScreen
import app.outage.ui.FeatureRegistry
import app.outage.ui.FreezerScreen
import app.outage.ui.SensorToggleScreen
import app.outage.ui.InsightsScreen
import app.outage.ui.MapScreen
import app.outage.ui.PowerLogScreen
import app.outage.ui.PowerLogViewModel
import java.io.File
import java.util.concurrent.Executors
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

private const val PENDING_BACKFILL = 500

class OutageApp : Application() {
    lateinit var graph: ShellGraph
        private set

    override fun onCreate() {
        super.onCreate()
        graph = ShellGraph(this)
        registerPowerLog()
        registerMapAndInsights()
        registerSensor()
        // A server delete that failed earlier is retried here, off the main thread (R5.3). After registerSensor,
        // which registers the server half.
        if (graph.store.pendingServerDelete) Thread { graph.deletes.retryPending() }.start()
        // Feature packages register their screens and delete functions on `graph.features` and
        // `graph.deletes` here, as they are built. Nothing else starts at app start (R1.4).
    }

    private lateinit var logStore: LogStore
    private lateinit var bandChoice: BandChoice

    /**
     * Power Log (spec power-log): the log database, sensor events into the log, Freezer Guard, the Power Log screen.
     * Opens nothing at start except a background plan of the Freezer Guard alarm (alarms are lost at reboot).
     */
    private fun registerPowerLog() {
        val alarms = AndroidFreezerAlarms(this)
        logStore = LogStores.get(this)
        val freezer = FreezerGuard(logStore, alarms)
        val config = try {
            BandConfig.parse(assets.open(BandConfig.ASSET_NAME).bufferedReader().use { it.readText() })
        } catch (_: Exception) {
            null
        }
        bandChoice = BandChoice(logStore, config)
        val recorder = LogRecorder(
            store = logStore,
            onChange = { runCatching { freezer.sync() } },
            onDetectionPlug = { Sensor.get(this).onDetectionPlug() },
            queueReport = { Sensor.get(this).recordReport() != null },
        )
        // Every process that builds the sensor writes its events into the log (power-log R1). Events still waiting in the
        // Outbox are read back first, so a gap while the process was dead is filled; duplicates are ignored by key.
        Sensor.onCreated = { sensor ->
            runCatching { recorder.onSensorEvents(sensor.getPendingEvents(PENDING_BACKFILL)) }
            sensor.addListener(recorder::onSensorEvent)
        }
        val sync = if (BuildConfig.API_BASE.isNotBlank()) AreaOutageSync(BuildConfig.API_BASE, logStore, FileOutageCache(File(filesDir, "outages"))) else null
        val service = PowerLogService(logStore, recorder, bandChoice, sync, cell = { graph.onboarding.load()?.cell })

        graph.features.register("freezer_guard", R.string.settings_freezer, { FreezerScreen(freezer, alarms::canScheduleExact) }, null)
        graph.features.register(
            FeatureRegistry.LOG,
            R.string.log_title,
            {
                val vm: PowerLogViewModel = viewModel(factory = viewModelFactory { initializer { PowerLogViewModel(service) } })
                PowerLogScreen(vm, shareImage = null)
            },
            null,
        )
        Thread { runCatching { freezer.sync() } }.start()
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
                else api.delete(id, token, credentials.cells()).also { ok -> if (ok) credentials.clear() }
            }
        }
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

        // The real Power Log once it has data; the labelled demo only in a build without a Worker address (R5, R10).
        val insights = InsightsSources.choose(BuildConfig.API_BASE, { bandChoice.chosen() }, LogStoreTimeline(logStore))
        graph.features.register(FeatureRegistry.INSIGHTS, R.string.nav_insights, { InsightsScreen(insights) }, null)
    }
}
