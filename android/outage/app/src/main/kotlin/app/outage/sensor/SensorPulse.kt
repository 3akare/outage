package app.outage.sensor

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

/**
 * A counter that moves each time the sensor may have changed what it reports: every sensor event, and each time the app
 * starts or stops the sensor (a start while unplugged changes the phase without an event). Visible screens collect it and
 * read the sensor again. Safe to bump from any thread; never stored.
 */
object SensorPulse {
    private val _ticks = MutableStateFlow(0L)
    val ticks: StateFlow<Long> = _ticks.asStateFlow()

    // https://kotlinlang.org/api/kotlinx.coroutines/kotlinx-coroutines-core/kotlinx.coroutines.flow/update.html
    fun bump() {
        _ticks.update { it + 1 }
    }
}
