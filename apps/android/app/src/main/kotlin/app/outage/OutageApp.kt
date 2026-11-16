package app.outage

import android.app.Application
import app.outage.insights.InsightsSources
import app.outage.log.BandConfig
import app.outage.map.AreaMapSources
import app.outage.map.FileMapCache
import app.outage.map.MapHttp
import android.content.Intent
import android.provider.Settings
import androidx.compose.runtime.Composable
import app.outage.map.DemoAreaMap
import app.outage.map.MapResult
import app.outage.net.IngestApi
import app.outage.net.PushHost
import app.outage.onboarding.OnboardingFacts
import app.outage.onboarding.OnboardingFlow
import app.outage.onboarding.SpotChoice
import app.outage.ui.AlarmSettingsScreen
import app.outage.ui.FollowSection
import app.outage.ui.PermissionsScreen
import app.outage.ui.SelfTestScreen
import app.outage.ui.SpotScreen
import app.outage.ui.SpotState
import app.outage.net.PrefsCredentials
import app.outage.net.UploadDriver
import app.outage.net.UrlConnectionPost
import app.outage.sensor.Sensor
import app.outage.shell.PrefsFollowedArea
import app.outage.shell.ShellGraph
import app.outage.ui.BatterySetupScreen
import app.outage.ui.FeatureRegistry
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
        app.outage.alarm.ChannelSetup.ensure(this)
        registerMapAndInsights()
        registerSensor()
        registerAlarmAndSpot()
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
        graph.deletes.register("alarm") { app.outage.alarm.AlarmHost.get(this).deleteAll() }
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
     * Light Alarm settings, notification permission, spot, follow and charger test screens (alerts-and-light-alarm task 8,
     * onboarding tasks 5 to 7). Each is opened from Settings or a Home card. Push is off without Firebase config (ADR 0036).
     */
    private fun registerAlarmAndSpot() {
        val credentials = PrefsCredentials(this)
        val push = PushHost.get(this)
        val mapCache = FileMapCache(File(filesDir, "map"))
        val mapSource = AreaMapSources.choose(BuildConfig.API_BASE, mapCache) { url -> withContext(Dispatchers.IO) { MapHttp.get(url) } }
        val openBatteryList = {
            startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
        val alarmScreen: @Composable () -> Unit = { AlarmSettingsScreen({ credentials.installId() != null }, openBatteryList) }
        graph.features.register("alarm_settings", R.string.settings_alarm, alarmScreen, null)
        graph.features.register(FeatureRegistry.ALARM, R.string.alarm_title, alarmScreen, null)
        graph.features.register("notifications", R.string.settings_notifications, { PermissionsScreen() }, null)
        graph.features.register("self_test", R.string.settings_self_test, { SelfTestScreen() }, null)
        graph.features.register(
            "followed_area",
            R.string.settings_followed_area,
            {
                SpotScreen(
                    loadMap = { (mapSource.load(DemoAreaMap.CITY, System.currentTimeMillis()) as? MapResult.Loaded)?.load?.map },
                    current = {
                        val r = graph.onboarding.load()
                        SpotState(r?.cell, r?.areaName, r?.postcodePrefix)
                    },
                    save = { choice, postcode -> saveSpot(push, choice, postcode) },
                    below = { spot -> FollowSection(spot) },
                )
            },
            null,
        )
        graph.deletes.register("follow") { push.deleteLocal() }
    }

    /** Stores the cell only (O2). A follow on the old cell moves to the new one. */
    private fun saveSpot(push: PushHost, choice: SpotChoice, postcode: String?): Boolean {
        val flow = OnboardingFlow.open(graph.onboarding, OnboardingFacts(notificationsOk = true, fullScreenOk = true, batteryExempt = false))
        if (!flow.changeSpot(choice.cell, choice.areaName, postcode)) return false
        val old = push.store.read()
        if (old != null && old.cell != choice.cell) push.follow(old.copy(cell = choice.cell)) { }
        return true
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
