package app.outage.probe

import android.app.job.JobInfo
import android.app.job.JobScheduler
import android.content.ComponentName
import android.content.Context
import android.os.Build

/** The sensor job: charging constraint, persisted across reboot (needs RECEIVE_BOOT_COMPLETED). R1.1. */
object Scheduler {
    const val JOB_ID = 1
    private const val EXPEDITED_TEST_ID = 2

    private fun js(ctx: Context) = ctx.getSystemService(JobScheduler::class.java)
    private fun component(ctx: Context) = ComponentName(ctx, ProbeJobService::class.java)

    // https://developer.android.com/reference/android/app/job/JobInfo.Builder#setRequiresCharging(boolean)
    fun schedule(ctx: Context): Int = js(ctx).schedule(
        JobInfo.Builder(JOB_ID, component(ctx)).setRequiresCharging(true).setPersisted(true).build(),
    )

    /** Schedule only if nothing is pending, so an explicit reschedule never cancels a job the system already queued. */
    fun ensureScheduled(ctx: Context): Boolean {
        if (js(ctx).getPendingJob(JOB_ID) != null) return false
        schedule(ctx)
        return true
    }

    fun cancel(ctx: Context) = js(ctx).cancel(JOB_ID)

    /**
     * M8 (feasibility-probe design section 5): try setExpedited(true) with the charging constraint and LOG the result.
     * This is a KNOWN, documented limitation, not a probe defect: expedited jobs may only set network, storage-not-low
     * and persistence constraints, so build() throws IllegalArgumentException on every Android version (confirmed via
     * Context7, Android reference, 2026-11-15; and on the emulator and the Samsung run). It answers ADR 0001
     * alternative 2 (an expedited job cannot carry the charging constraint). The attempt is wrapped so it never crashes
     * the app; `known=true` marks the row as the expected outcome. The test job is cancelled if it ever schedules.
     * https://developer.android.com/reference/android/app/job/JobInfo.Builder#setExpedited(boolean)
     */
    fun tryExpeditedWithCharging(ctx: Context): Map<String, Any?> {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return mapOf("kind" to "expedited", "ok" to false, "known" to true, "error" to "below Android 12")
        return try {
            val info = JobInfo.Builder(EXPEDITED_TEST_ID, component(ctx)).setExpedited(true).setRequiresCharging(true).build()
            val result = js(ctx).schedule(info)
            js(ctx).cancel(EXPEDITED_TEST_ID)
            mapOf("kind" to "expedited", "ok" to (result == JobScheduler.RESULT_SUCCESS), "known" to true, "error" to if (result == JobScheduler.RESULT_SUCCESS) null else "schedule returned RESULT_FAILURE")
        } catch (e: RuntimeException) {
            // Expected on every version: expedited + charging constraint is invalid by documentation.
            mapOf("kind" to "expedited", "ok" to false, "known" to true, "error" to "${e.javaClass.simpleName}: ${e.message}".take(300))
        }
    }
}
