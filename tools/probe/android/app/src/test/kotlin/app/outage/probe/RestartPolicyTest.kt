package app.outage.probe

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The restart decision (ADR 0001, feasibility-probe R1). After the Samsung run showed the OS exponential backoff
 * growing the restart gap (docs/probe/2026-11-15-samsung-a.md), onStopJob must never return true, and the probe
 * must schedule a fresh job itself while the sensor is on.
 */
class RestartPolicyTest {
    @Test
    fun R1_onStopJob_never_uses_the_os_backoff_policy() {
        // true would apply the default 30 s exponential backoff; the probe always reschedules itself instead.
        assertFalse(RestartPolicy.RESCHEDULE_VIA_OS)
    }

    @Test
    fun R1_reschedules_immediately_while_the_sensor_is_on() {
        assertTrue(RestartPolicy.shouldRescheduleImmediately(sensorOn = true))
    }

    @Test
    fun R1_does_not_reschedule_after_the_sensor_is_stopped() {
        assertFalse(RestartPolicy.shouldRescheduleImmediately(sensorOn = false))
    }
}
