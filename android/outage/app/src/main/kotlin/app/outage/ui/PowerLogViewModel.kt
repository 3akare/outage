package app.outage.ui

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.outage.log.Band
import app.outage.log.PowerLogService
import app.outage.log.PowerLogView
import app.outage.log.TapResult
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** Holds the Power Log screen's state. Database and network work run on `Dispatchers.IO` (power-log design section 2). */
class PowerLogViewModel(private val service: PowerLogService) : ViewModel() {
    var view: PowerLogView? by mutableStateOf(null)
        private set
    var band: Band? by mutableStateOf(null)
        private set

    /** The last tap result, shown once under the buttons. */
    var message: TapResult? by mutableStateOf(null)
        private set

    /** Whole minutes until "Power is out" works again, 0 when it works now (R7.6). */
    var waitMinutes: Int by mutableIntStateOf(0)
        private set

    val bands: List<Band> get() = service.bands.bands

    /** Shows what is stored at once, then syncs the area outages and shows the result (R9.1). */
    fun refresh() {
        viewModelScope.launch {
            reload()
            withContext(Dispatchers.IO) { service.syncArea() }
            reload()
        }
    }

    /** Reads the log again without a sync, for a plug or sensor change while the screen is visible. */
    fun reloadLocal() {
        viewModelScope.launch { reload() }
    }

    fun powerOut() = tap { service.powerOut() }

    fun powerBack() = tap { service.powerBack() }

    fun chooseBand(id: String?) {
        viewModelScope.launch {
            withContext(Dispatchers.IO) { service.bands.choose(id) }
            reload()
        }
    }

    private fun tap(action: () -> TapResult) {
        viewModelScope.launch {
            message = withContext(Dispatchers.IO) { action() }
            reload()
        }
    }

    private suspend fun reload() {
        val (v, b, wait) = withContext(Dispatchers.IO) { Triple(service.load(), service.bands.chosen(), service.reportWaitMs()) }
        view = v
        band = b
        waitMinutes = ((wait + 59_999) / 60_000).toInt()
    }
}
