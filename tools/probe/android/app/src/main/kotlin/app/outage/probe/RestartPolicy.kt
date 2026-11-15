package app.outage.probe

/**
 * Pure decision for what ProbeJobService.onStopJob must do. No Android imports, so it runs as a plain JVM unit test.
 *
 * Why this exists: the Samsung run (docs/probe/2026-11-15-samsung-a.md) showed that returning `true` from onStopJob
 * asks the system to reschedule using the job's backoff policy. The default policy is 30 s EXPONENTIAL
 * (retry = stopTime + 30000 * 2^(n-1)):
 *   https://developer.android.com/reference/android/app/job/JobService#onStopJob(android.app.job.JobParameters)
 *   https://developer.android.com/reference/android/app/job/JobInfo.Builder#setBackoffCriteria(long,%20int)
 *   https://developer.android.com/reference/android/app/job/JobInfo#BACKOFF_POLICY_EXPONENTIAL
 * That produced doubling restart gaps (~50, 61, 142, 241, 515, 986, 1963, 3989 s) after each ~10-minute TIMEOUT and
 * wrecked armed time (17.7%). ADR 0001 requires an immediate reschedule on every non-charging stop, so onStopJob must
 * return `false` (end this job, no OS backoff) and the app schedules a fresh job itself.
 */
object RestartPolicy {
    /** onStopJob return value. Always false: never let the OS backoff grow. The app reschedules explicitly. */
    const val RESCHEDULE_VIA_OS: Boolean = false

    /**
     * Whether to schedule a fresh job immediately after a stop. True while the sensor is on, for any stop reason
     * (a real unplug schedules a charging-constraint job that simply waits; a TIMEOUT while charging runs at once).
     */
    fun shouldRescheduleImmediately(sensorOn: Boolean): Boolean = sensorOn
}
