package app.outage.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import app.outage.sensor.AndroidPlugObserver
import app.outage.sensor.SensorPulse
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.launch

/** After a plug change, read again at these delays: the sensor's own power broadcast may land a moment later. */
private val PLUG_RECHECK_MS = listOf(0L, 400L, 1_500L)

/**
 * Calls [onChange] while the screen is at least STARTED whenever the plug or the sensor may have changed: each plug change
 * seen through `ACTION_BATTERY_CHANGED` (sensor-android R13.1, the same observer Judge mode uses), each sensor event and
 * each sensor start or stop ([SensorPulse]). Some phase changes emit no event, so the plug observer is the dependable
 * trigger. Nothing runs while the screen is in the background.
 * https://developer.android.com/topic/libraries/architecture/coroutines#repeatOnLifecycle
 */
@Composable
fun RefreshOnPlugOrSensor(onChange: () -> Unit) {
    val context = LocalContext.current
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val latest by rememberUpdatedState(onChange)
    LaunchedEffect(lifecycle) {
        lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
            // The receiver runs on the main thread; hand plug changes to this coroutine.
            val plugs = Channel<Unit>(Channel.CONFLATED)
            val observer = AndroidPlugObserver(context)
            observer.start { plugs.trySend(Unit) }
            try {
                launch { SensorPulse.ticks.collect { latest() } }
                // A newer plug change restarts the rechecks.
                plugs.receiveAsFlow().collectLatest {
                    var waited = 0L
                    for (at in PLUG_RECHECK_MS) {
                        delay(at - waited)
                        waited = at
                        latest()
                    }
                }
            } finally {
                observer.stop()
            }
        }
    }
}
