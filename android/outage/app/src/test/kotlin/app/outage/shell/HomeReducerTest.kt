package app.outage.shell

import app.outage.alarm.AlarmState
import app.outage.sensor.NotArmedReason
import app.outage.sensor.SensorKind
import app.outage.sensor.SensorState
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** app-shell R2, property AS5. */
class HomeReducerTest {
    private val now = 1_000_000_000L
    private val armed = SensorState(SensorKind.ARMED)

    private fun area(minutesAgo: Long, simulated: Boolean = false) =
        AreaStatus(StatusLevel.CONFIRMED, now - minutesAgo * 60_000L, simulated)

    @Test
    fun AS5_home_state_offline_keeps_sensor_and_cached_area_with_age() {
        val s = HomeReducer.reduce(armed, area(2), null, null, online = false, nowWallMs = now)
        assertTrue(s.offline)
        assertEquals(armed, s.sensor)
        assertEquals(StatusLevel.CONFIRMED, s.area?.level)
        assertEquals(2, s.ageMinutes)
    }

    @Test
    fun AS5_home_state_online_is_not_offline() {
        assertFalse(HomeReducer.reduce(armed, null, null, null, online = true, nowWallMs = now).offline)
    }

    @Test
    fun AS5_home_state_no_area_data_has_no_area_and_no_age() {
        val s = HomeReducer.reduce(armed, null, null, null, true, now)
        assertNull(s.area)
        assertNull(s.ageMinutes)
    }

    @Test
    fun AS5_home_state_missing_features_hide_their_cards() {
        val s = HomeReducer.reduce(armed, null, todayPowerHours = null, alarm = null, online = true, nowWallMs = now)
        assertNull(s.todayPowerHours)
        assertNull(s.alarm)
        val full = HomeReducer.reduce(armed, null, 18.5, AlarmState.WAITING_FOR_POWER, true, now)
        assertEquals(18.5, full.todayPowerHours!!, 0.0)
        assertEquals(AlarmState.WAITING_FOR_POWER, full.alarm)
    }

    @Test
    fun AS5_home_state_missing_sensor_feature_shows_not_watching() {
        val s = HomeReducer.reduce(null, null, null, null, true, now)
        assertEquals(SensorKind.NOT_ARMED, s.sensor.kind)
        assertEquals(NotArmedReason.NOT_AVAILABLE, s.sensor.reason)
    }

    @Test
    fun AS5_home_state_simulated_data_is_labeled() {
        assertTrue(HomeReducer.reduce(armed, area(1, simulated = true), null, null, true, now).simulated)
        assertFalse(HomeReducer.reduce(armed, area(1), null, null, true, now).simulated)
        assertFalse(HomeReducer.reduce(armed, null, null, null, true, now).simulated)
    }

    @Test
    fun AS5_home_state_age_never_negative_when_clock_moves_back() {
        val s = HomeReducer.reduce(armed, area(-30), null, null, true, now)
        assertEquals(0, s.ageMinutes)
    }

    @Test
    fun AS5_home_state_age_labels() {
        assertEquals(AgeLabel.JustNow, AgeLabel.of(0))
        assertEquals(AgeLabel.Minutes(2), AgeLabel.of(2))
        assertEquals(AgeLabel.Minutes(59), AgeLabel.of(59))
        assertEquals(AgeLabel.Hours(1), AgeLabel.of(60))
        assertEquals(AgeLabel.Hours(23), AgeLabel.of(23 * 60 + 59))
        assertEquals(AgeLabel.Days(1), AgeLabel.of(24 * 60))
    }

    @Test
    fun AS5_home_state_default_sources_give_a_safe_state() {
        val s = HomeReducer.reduce(
            NoStatusSources.sensorState(), NoStatusSources.areaStatus(), NoStatusSources.todayPowerHours(),
            NoStatusSources.alarmState(), online = true, nowWallMs = now,
        )
        assertEquals(HomeUiState.Initial.copy(offline = false), s)
    }

    @Test
    fun now_follows_the_sensor_when_it_is_read_again_after_a_plug_or_unplug() {
        // The screen reads the sources again on each plug change and sensor event; each read shows the sensor as it is then.
        var current = armed
        val sources = object : StatusSources {
            override fun sensorState() = current
            override fun areaStatus(): AreaStatus? = null
            override fun todayPowerHours() = 6.5
            override fun alarmState() = AlarmState.OFF
        }
        fun read() = HomeReducer.reduce(sources.sensorState(), sources.areaStatus(), sources.todayPowerHours(), sources.alarmState(), true, now)
        assertEquals(SensorKind.ARMED, read().sensor.kind)
        current = SensorState(SensorKind.NOT_ARMED, NotArmedReason.NOT_AVAILABLE)
        assertEquals(SensorKind.NOT_ARMED, read().sensor.kind)
        current = armed
        assertEquals(SensorKind.ARMED, read().sensor.kind)
        assertEquals(6.5, read().todayPowerHours!!, 0.0)
        assertEquals(AlarmState.OFF, read().alarm)
    }
}
