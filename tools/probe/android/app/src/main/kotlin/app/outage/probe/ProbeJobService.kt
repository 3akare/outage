package app.outage.probe

import android.app.job.JobParameters
import android.app.job.JobService
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock

/**
 * R1: the job that runs while the phone charges. onStartJob returns true and never finishes, so the system calls
 * onStopJob when charging ends (or for another reason). On stop, the facts are recorded FIRST, then it reschedules.
 * No classification here (R1.4): rows are raw facts.
 * https://developer.android.com/reference/android/app/job/JobService
 */
class ProbeJobService : JobService() {
    private val main = Handler(Looper.getMainLooper())

    private fun common(params: JobParameters): MutableMap<String, Any?> = linkedMapOf<String, Any?>("jobId" to params.jobId).apply {
        putAll(Facts.battery(this@ProbeJobService))
        put("bucket", Facts.standbyBucket(this@ProbeJobService))
        put("exempt", Facts.exempt(this@ProbeJobService))
        put("isInteractive", Facts.interactive(this@ProbeJobService))
        put("expedited", if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) params.isExpeditedJob else false)
    }

    override fun onStartJob(params: JobParameters): Boolean {
        val log = ProbeLog.get(this)
        val now = SystemClock.elapsedRealtime()
        log.append("JOB_START", common(params), now)
        AlarmTest.onReplug(this, now)
        return true
    }

    override fun onStopJob(params: JobParameters): Boolean {
        val log = ProbeLog.get(this)
        val reason = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) params.stopReason else null
        val f = common(params)
        val bm = Facts.batteryManager(this)
        f["stopReason"] = reason
        f["stopReasonName"] = Contract.stopReasonName(reason)
        f["stickyPlug"] = f["plug"]
        f["stickyPct"] = f["batteryPct"]
        f.putAll(bm)
        // M14: the two sources disagree on charging or on level
        f["mismatch"] = (bm["bmCharging"] != null && f["charging"] != null && bm["bmCharging"] != f["charging"]) ||
            (bm["bmPct"] != null && f["batteryPct"] != null && bm["bmPct"] != f["batteryPct"])
        val id = log.append("JOB_STOP", f)
        // M6: read the plug again one second later, while the process is still alive; then make sure a job is queued
        main.postDelayed({
            log.append("BATTERY", linkedMapOf<String, Any?>("source" to "JOB_RECHECK", "recheckOf" to id).apply { putAll(Facts.battery(this@ProbeJobService)) })
            if (Prefs(this).sensorOn) Scheduler.ensureScheduled(this)
        }, 1_000)
        return true // ask the system to reschedule (https://developer.android.com/reference/android/app/job/JobService#onStopJob(android.app.job.JobParameters))
    }
}
