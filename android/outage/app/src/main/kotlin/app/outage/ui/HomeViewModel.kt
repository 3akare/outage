package app.outage.ui

import androidx.lifecycle.ViewModel
import app.outage.shell.Connectivity
import app.outage.shell.HomeReducer
import app.outage.shell.HomeUiState
import app.outage.shell.StatusSources
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Reads the status sources and reduces them to [HomeUiState]. The screen calls [refresh] when it becomes visible, on
 * each plug or sensor change and once a minute, so the age label stays right. The sources read databases, so they are
 * read on `Dispatchers.IO`; a newer refresh replaces one still running. Nothing here starts a sensor or an upload.
 */
class HomeViewModel(
    private val sources: StatusSources,
    private val connectivity: Connectivity,
    private val nowWallMs: () -> Long = System::currentTimeMillis,
) : ViewModel() {
    private val _state = MutableStateFlow(HomeUiState.Initial)
    val state: StateFlow<HomeUiState> = _state.asStateFlow()

    init {
        refresh()
    }

    private var job: Job? = null

    fun refresh() {
        job?.cancel()
        job = viewModelScope.launch {
            _state.value = withContext(Dispatchers.IO) {
                HomeReducer.reduce(
                    sensor = sources.sensorState(),
                    area = sources.areaStatus(),
                    todayPowerHours = sources.todayPowerHours(),
                    alarm = sources.alarmState(),
                    online = connectivity.isOnline(),
                    nowWallMs = nowWallMs(),
                )
            }
        }
    }
}
