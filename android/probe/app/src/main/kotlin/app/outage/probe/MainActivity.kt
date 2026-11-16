package app.outage.probe

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.text.InputType
import android.view.View
import android.widget.Button
import android.widget.CompoundButton
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Switch
import android.widget.TextView
import android.widget.Toast
import java.util.concurrent.Executors

/** R4 debug screen, plain Views. Button names match docs/probe-checklist.md. */
class MainActivity : Activity() {
    private lateinit var prefs: Prefs
    private lateinit var log: ProbeLog
    private lateinit var status: TextView
    private lateinit var lines: TextView
    private val main = Handler(Looper.getMainLooper())
    private val io = Executors.newSingleThreadExecutor()
    private val tick = object : Runnable { override fun run() { refresh(); main.postDelayed(this, 5_000) } }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = Prefs(this); log = ProbeLog.get(this)
        val col = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(32, 32, 32, 32) }
        fun label(t: String) = TextView(this).apply { text = t; textSize = 13f }.also { col.addView(it) }
        fun field(hint: String, value: String, secret: Boolean = false, save: (String) -> Unit) = EditText(this).apply {
            this.hint = hint; setText(value); isSingleLine = true
            if (secret) inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
            setOnFocusChangeListener { _, has -> if (!has) save(text.toString().trim()) }
        }.also { col.addView(it) }
        fun button(t: String, on: () -> Unit) = Button(this).apply { text = t; isAllCaps = false; setOnClickListener { on() } }.also { col.addView(it) }

        status = label("")
        val alias = field("Alias (a-z, 0-9, -), e.g. tecno-a", prefs.alias) { prefs.alias = it }
        val url = field("Worker URL (https://...)", prefs.workerUrl) { prefs.workerUrl = it }
        val token = field("Probe token", prefs.token, secret = true) { prefs.token = it }
        fun saveFields() { prefs.alias = alias.text.toString().trim(); prefs.workerUrl = url.text.toString().trim(); prefs.token = token.text.toString().trim() }

        button("Start") { startSensor() }
        button("Stop") { stopSensor() }
        @Suppress("DEPRECATION") // android.widget.Switch keeps the probe free of libraries
        Switch(this).apply {
            text = "Reference logger"; isChecked = prefs.referenceOn
            setOnCheckedChangeListener { _: CompoundButton, on: Boolean -> if (on) ReferenceService.start(this@MainActivity) else ReferenceService.stop(this@MainActivity); refresh() }
        }.also { col.addView(it) }
        val note = field("Note, e.g. cond: baseline", "") {}
        button("Mark note") {
            val t = note.text.toString()
            if (t.isNotBlank()) { io.execute { log.append("NOTE", mapOf("text" to t)) }; note.setText(""); toast("Note saved"); refresh() }
        }
        button("Upload now") { saveFields(); toast("Uploading..."); Uploader.uploadNow(this) { msg -> main.post { toast(msg); refresh() } } }
        button("Export file") { saveFields(); exportFile() }
        button("Alarm test") { AlarmTest.arm(this); toast("Armed: the next plug-in rings the alarm"); refresh() }
        button("Stop alarm") { AlarmTest.stop(this) }
        button("Battery settings") { openBatterySettings() }
        button("Clear") {
            AlertDialog.Builder(this).setMessage("Delete every log row on this phone? Upload or export first.")
                .setPositiveButton("Delete") { _, _ -> io.execute { log.clear(); main.post { refresh() } } }.setNegativeButton("Cancel", null).show()
        }
        lines = label("")
        setContentView(ScrollView(this).apply { addView(col) })
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)
        }
        automate(intent)
    }

    override fun onNewIntent(intent: Intent) { super.onNewIntent(intent); automate(intent) }

    /**
     * Emulator run only (.github/workflows/probe-emulator.yml): `am start` extras do what the tester's taps do.
     * Ignored unless the build is debuggable, so a release build of the real app never has this path.
     */
    private fun automate(i: Intent?) {
        if (i == null || applicationInfo.flags and android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE == 0) return
        i.getStringExtra("probe.alias")?.takeIf(Contract::aliasOk)?.let { prefs.alias = it }
        i.getStringExtra("probe.note")?.let { t -> io.execute { log.append("NOTE", mapOf("text" to t)) } }
        if (i.getBooleanExtra("probe.reference", false) && !prefs.referenceOn) ReferenceService.start(this)
        if (i.getBooleanExtra("probe.alarm", false)) AlarmTest.arm(this)
        if (i.getBooleanExtra("probe.start", false) && !prefs.sensorOn) startSensor()
    }

    override fun onResume() { super.onResume(); main.post(tick) }
    override fun onPause() { main.removeCallbacks(tick); super.onPause() }

    private fun startSensor() {
        io.execute {
            prefs.sensorOn = true
            val id = log.append("SESSION", mapOf("kind" to "sensor_on", "exempt" to Facts.exempt(this)))
            prefs.sessionStartId = id
            log.append("SESSION", Scheduler.tryExpeditedWithCharging(this)) // M8, before the real job
            val r = Scheduler.schedule(this)
            log.append("SESSION", mapOf("kind" to "exemption", "exempt" to Facts.exempt(this), "fullScreen" to Facts.fullScreen(this), "ok" to (r == android.app.job.JobScheduler.RESULT_SUCCESS)))
            main.post { refresh() }
        }
    }

    private fun stopSensor() {
        io.execute {
            prefs.sensorOn = false
            Scheduler.cancel(this)
            log.append("SESSION", mapOf("kind" to "sensor_off"))
            main.post { refresh() }
        }
    }

    @android.annotation.SuppressLint("BatteryLife") // sideloaded probe only, see the manifest comment
    private fun openBatterySettings() {
        // Sideloaded probe only: the direct request is restricted on Google Play
        // (https://developer.android.com/training/monitoring-device-state/doze-standby).
        val direct = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$packageName"))
        runCatching { startActivity(direct) }.onFailure { startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)) }
    }

    private fun exportFile() {
        if (!Contract.aliasOk(prefs.alias)) { toast("Set an alias first"); return }
        // Storage Access Framework: the tester picks where to save; no storage permission (https://developer.android.com/reference/android/content/Intent#ACTION_CREATE_DOCUMENT)
        val i = Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("application/json")
            .putExtra(Intent.EXTRA_TITLE, "probe-${prefs.alias}.json")
        @Suppress("DEPRECATION") startActivityForResult(i, EXPORT)
    }

    @Deprecated("Activity result API needs androidx; the probe uses the platform call")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        @Suppress("DEPRECATION") super.onActivityResult(requestCode, resultCode, data)
        val uri = data?.data
        if (requestCode != EXPORT || resultCode != RESULT_OK || uri == null) return
        io.execute {
            val msg = runCatching {
                val text = Contract.exportFile(Facts.device(prefs.alias), log.all())
                contentResolver.openOutputStream(uri)?.use { it.write(text.toByteArray()) } ?: error("could not open the file")
                log.append("SESSION", mapOf("kind" to "export", "ok" to true, "bytes" to text.length))
                "Exported"
            }.getOrElse { "Export failed: ${it.message}" }
            main.post { toast(msg) }
        }
    }

    private fun refresh() {
        io.execute {
            val b = Facts.battery(this)
            val counts = log.counts()
            val rows = log.since(prefs.sessionStartId)
            val ratio = ArmedRatio.compute(rows)
            val stops = rows.filter { it.kind == "JOB_STOP" }
            val reasons = stops.groupingBy { it.fields["stopReasonName"]?.toString() ?: "?" }.eachCount()
            val lastJob = rows.lastOrNull { it.kind == "JOB_START" || it.kind == "JOB_STOP" }
            val expedited = rows.lastOrNull { it.kind == "SESSION" && it.fields["kind"] == "expedited" }
            val mismatches = stops.count { it.fields["mismatch"] == true }
            val text = buildString {
                appendLine("Sensor: ${if (prefs.sensorOn) "ON" else "off"}   Reference logger: ${if (prefs.referenceOn) "on" else "off"}   Alarm test: ${if (prefs.alarmArmed) "armed" else "off"}")
                appendLine("Plug: ${b["plug"]}   Battery: ${b["batteryPct"]}% ${b["batteryStatus"]}")
                appendLine("Job: ${when (lastJob?.kind) { "JOB_START" -> "running"; "JOB_STOP" -> "stopped"; else -> "not started" }}")
                appendLine("Live armed ratio since Start: ${ratio.ratio?.let { "%.1f%%".format(it * 100) } ?: "n/a"} (charging ${"%.2f".format(ratio.chargingMs / 3_600_000.0)} h)")
                appendLine("Starts ${counts["JOB_START"] ?: 0}, stops ${counts["JOB_STOP"] ?: 0}, plug events ${counts["PLUG"] ?: 0}, pending upload ${log.pendingCount()}")
                appendLine("Stop reasons: ${reasons.entries.joinToString { "${it.key} ${it.value}" }.ifEmpty { "none" }}")
                appendLine("Expedited with charging (M8): ${expedited?.let { if (it.fields["ok"] == true) "accepted" else "refused: ${it.fields["error"]}" } ?: "not tried"}")
                appendLine("Full-screen allowed (M12): ${Facts.fullScreen(this@MainActivity)?.let { if (it) "yes" else "no" } ?: "n/a (below Android 14)"}")
                appendLine("Battery exemption: ${Facts.exempt(this@MainActivity)}   Standby bucket: ${Facts.standbyBucket(this@MainActivity) ?: "n/a"}")
                append("Mismatch counter (M14): $mismatches")
            }
            val last = log.recent(50).joinToString("\n") { r -> "#${r.id} ${r.kind} ${r.monoMs / 1000}s ${Json.encode(r.fields).take(140)}" }
            main.post { status.text = text; lines.text = last; lines.visibility = if (last.isEmpty()) View.GONE else View.VISIBLE }
        }
    }

    private fun toast(t: String) = Toast.makeText(this, t, Toast.LENGTH_LONG).show()

    companion object { private const val EXPORT = 7 }
}
