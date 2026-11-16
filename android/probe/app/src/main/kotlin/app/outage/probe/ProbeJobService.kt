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
        val id = log.append("JOB_STOP", f) // R2: record the stop FIRST, then act
        // ADR 0001 + docs/probe/2026-11-15-samsung-a.md: reschedule immediately, never via the OS backoff policy.
        // Returning true would reschedule with the job's default 30 s EXPONENTIAL backoff, which grew the gap after
        // every ~10-minute TIMEOUT (~50, 61, 142, ... s) and wrecked armed time. We return false and schedule a fresh
        // job ourselves. This fires once per stop (~10 min apart), well below JobScheduler's runaway-throttle threshold.
        // https://developer.android.com/reference/android/app/job/JobService#onStopJob(android.app.job.JobParameters)
        // https://developer.android.com/reference/android/app/job/JobInfo#BACKOFF_POLICY_EXPONENTIAL
        // This is the single reschedule path: schedule() replaces the stable JOB_ID with a fresh job that runs once
        // charging is satisfied, so the next JOB_START is one event and M5 stays measurable. We do NOT also reschedule
        // in the callback below: once the fresh job is running, getPendingJob is null, so ensureScheduled would
        // schedule() a second time and churn the running job.
        if (RestartPolicy.shouldRescheduleImmediately(Prefs(this).sensorOn)) Scheduler.schedule(this)
        // M6: read the plug again one second later, while the process is still alive (no rescheduling here).
        main.postDelayed({
            log.append("BATTERY", linkedMapOf<String, Any?>("source" to "JOB_RECHECK", "recheckOf" to id).apply { putAll(Facts.battery(this@ProbeJobService)) })
        }, 1_000)
        return RestartPolicy.RESCHEDULE_VIA_OS // false: end this job, no OS backoff; the fresh job above runs next
    }
}
