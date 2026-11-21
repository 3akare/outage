package app.outage

import android.app.Application
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
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
import app.outage.onboarding.LocationSource
import app.outage.onboarding.Spot
import app.outage.ui.SpotOutcome
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
import app.outage.ui.DemoViewModel
import app.outage.ui.FeatureRegistry
import app.outage.ui.JudgeScreen
import app.outage.ui.loadReplayAsset
import app.outage.telemetry.PrefsTelemetryConsent
import app.outage.telemetry.TelemetryDriver
import app.outage.ui.DiagnosticsScreen
import app.outage.ui.FreezerScreen
import app.outage.ui.SensorToggleScreen
import app.outage.ui.InsightsScreen
import app.outage.ui.MapScreen
import app.outage.ui.PowerLogScreen
import app.outage.ui.PowerLogViewModel
import app.outage.ui.ShareCardImage
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
        app.outage.alarm.ChannelSetup.ensure(this)
        registerPowerLog()
        registerMapAndInsights()
        registerSensor()
        forgetHomeWatch()
        registerJudgeMode()
        registerAlarmAndSpot()
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
        graph.band = { bandChoice.chosen()?.let { it.id to it.promisedMinHoursPerDay } }
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
        val outageCache = FileOutageCache(File(filesDir, "outages"))
        val sync = if (BuildConfig.API_BASE.isNotBlank()) AreaOutageSync(BuildConfig.API_BASE, logStore, outageCache) else null
        val service = PowerLogService(logStore, recorder, bandChoice, sync, cell = { graph.onboarding.load()?.cell })

        graph.features.register("freezer_guard", R.string.settings_freezer, { FreezerScreen(freezer, alarms::canScheduleExact) }, null)
        graph.features.register(
            FeatureRegistry.LOG,
            R.string.log_title,
            {
                val vm: PowerLogViewModel = viewModel(factory = viewModelFactory { initializer { PowerLogViewModel(service) } })
                PowerLogScreen(vm, shareImage = { v -> Thread { runCatching { ShareCardImage.share(applicationContext, v.share) } }.start() })
            },
            null,
        )
        // Delete-my-data (power-log R1.6): the log and its settings, the Freezer Guard alarm, the cached area outages and the
        // cached share picture. Cancel the alarm after the clear, so a pending alert cannot find an outage to report.
        graph.deletes.register("power_log") {
            logStore.clear()
            alarms.cancel()
            outageCache.clear()
            ShareCardImage.clear(this)
        }
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
        val consent = PrefsTelemetryConsent(this)
        graph.features.register("diagnostics", R.string.settings_diagnostics, { DiagnosticsScreen(consent::enabled, consent::set) }, null)
        graph.deletes.register("telemetry_consent") { consent.clear() }
        graph.sensorStarter = {
            if (prefs.getBoolean("on", true)) io.execute {
                val sensor = Sensor.get(this)
                sensor.start()
                if (upload == null && BuildConfig.API_BASE.isNotBlank()) {
                    upload = UploadDriver(IngestApi(BuildConfig.API_BASE, UrlConnectionPost), credentials, sensor) { onboarding.load()?.cell }
                        .also { it.start() }
                    // Daily anonymous diagnostics, only with the user's opt-in (field-telemetry R1.1).
                    TelemetryDriver(this, IngestApi(BuildConfig.API_BASE, UrlConnectionPost), credentials, sensor, consent).start()
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
     * Home Watch was removed (ADR 0055). Its two preference files (saved pairs, pair ids awaiting a server delete) are
     * dropped off the main thread. Safe on every start: deleting a missing file does nothing.
     * https://developer.android.com/reference/android/content/Context#deleteSharedPreferences(java.lang.String)
     */
    private fun forgetHomeWatch() {
        Thread {
            deleteSharedPreferences("home_watch")
            deleteSharedPreferences("home_watch_pending_delete")
        }.start()
    }

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

        // First run: "Use my location" reads one coarse position, turns it into a cell of the published map, saves the
        // cell only and drops the position (onboarding O2, ADR 0037, ADR 0050). A mocked position or a place outside the
        // map is not saved here; the person can confirm or pick on the map in Settings.
        graph.locateSpot = {
            withContext(Dispatchers.IO) {
                val fix = LocationSource.readOnce(this@OutageApp)
                val map = (mapSource.load(DemoAreaMap.CITY, System.currentTimeMillis()) as? MapResult.Loaded)?.load?.map
                val choice = if (fix != null && map != null) Spot.resolve(map, fix.lat, fix.lng, fix.mocked) else null
                when {
                    choice == null || choice.needsConfirm || !Spot.isRealCell(choice.cell) -> SpotOutcome.NotFound
                    saveSpot(push, choice, null) -> SpotOutcome.Saved(choice.areaName)
                    else -> SpotOutcome.NotFound
                }
            }
        }
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
        graph.features.register(FeatureRegistry.AREA, R.string.nav_home, { MapScreen(source, followed, spotCell = { graph.onboarding.load()?.cell }) }, null)
        graph.deletes.register("map_cache") { cache.clear() }
        graph.deletes.register("followed_area") { followed.clear() }

        // The real Power Log once it has data; the labelled demo only in a build without a Worker address (R5, R10).
        val insights = InsightsSources.choose(BuildConfig.API_BASE, { bandChoice.chosen() }, LogStoreTimeline(logStore))
        graph.features.register(FeatureRegistry.INSIGHTS, R.string.nav_insights, { InsightsScreen(insights) }, null)
    }
}
