package app.outage.sensor

import android.app.job.JobParameters
import android.app.job.JobService
import android.os.Build

/**
 * The backup driver (ADR 0032). The job runs while the phone charges. `onStartJob` returns true and never finishes, so the
 * system calls `onStopJob` when charging ends. The stop is recorded FIRST, then a fresh job is scheduled by the
 * controller; `onStopJob` returns false so the OS back-off never stretches the gap (probe run 1, ADR 0001).
 * https://developer.android.com/reference/android/app/job/JobService
 * https://developer.android.com/reference/android/app/job/JobParameters#getStopReason() (API 31+)
 */
class ChargingJobService : JobService() {
    override fun onStartJob(params: JobParameters): Boolean {
        Sensor.get(this).handle(Input.JobStarted)
        return true
    }

    override fun onStopJob(params: JobParameters): Boolean {
        val reason = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) runCatching { params.stopReason }.getOrNull() else null
        Sensor.get(this).handle(Input.JobStopped(reason))
        return false
    }
}
