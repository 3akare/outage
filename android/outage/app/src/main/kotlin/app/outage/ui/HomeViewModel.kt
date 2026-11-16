package app.outage.ui

import androidx.lifecycle.ViewModel
import app.outage.shell.Connectivity
import app.outage.shell.HomeReducer
import app.outage.shell.HomeUiState
import app.outage.shell.StatusSources
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Reads the status sources and reduces them to [HomeUiState]. The screen calls [refresh] when it
 * becomes visible and once a minute, so the age label stays right. Nothing here starts a sensor or an upload.
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

    fun refresh() {
        _state.value = HomeReducer.reduce(
            sensor = sources.sensorState(),
            area = sources.areaStatus(),
            todayPowerHours = sources.todayPowerHours(),
            alarm = sources.alarmState(),
            online = connectivity.isOnline(),
            nowWallMs = nowWallMs(),
        )
    }
}
