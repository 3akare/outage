package app.outage.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.outage.demo.ReplayFile
import app.outage.map.DemoSim
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

/** Holds the demo simulation for the whole app window, so the Map tab and the Now tab show the same place and the same replay. */
class DemoSimViewModel : ViewModel() {
    val sim = DemoSim()
    private var job: Job? = null

    fun start(replay: ReplayFile, blocks: List<String>, name: String?) {
        job?.cancel()
        job = viewModelScope.launch { sim.run(replay, blocks, name) }
    }
}
