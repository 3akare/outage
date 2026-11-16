package app.outage.ui

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.outage.shell.DeleteResult
import app.outage.shell.Route
import app.outage.shell.Router
import app.outage.shell.Routes
import app.outage.shell.ShellGraph
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** Holds the [Router] across rotation and exposes the back stack as Compose state. */
class ShellViewModel(private val graph: ShellGraph, deepLink: Route?) : ViewModel() {
    private val router: Router = Routes.start(graph.onboardingNeeded(), deepLink)

    var stack: List<Route> by mutableStateOf(router.stack)
        private set

    /** Null while idle. Set after a delete finishes, cleared by [dismissDeleteResult]. */
    var deleteResult: DeleteResult? by mutableStateOf(null)
        private set
    var deleting: Boolean by mutableStateOf(false)
        private set

    val current: Route get() = stack.last()

    fun tab(route: Route) { router.tab(route); sync() }
    fun go(route: Route) { router.go(route); sync() }

    /** A notification opened the app while it was running (R1.3). Ignored during onboarding. */
    fun openDeepLink(route: Route?) {
        if (route == null || current == Route.Onboarding) return
        when (route) {
            is Route.Feature -> { router.tab(Route.Home); router.go(route) }
            else -> router.tab(route)
        }
        sync()
    }

    fun back(): Boolean = router.back().also { sync() }

    fun onboardingDone() {
        graph.store.onboardingDone = true
        router.reset(Route.Home)
        sync()
    }

    /** R5: phone side first, then the server, then back to onboarding. The server call runs off the main thread. */
    fun deleteMyData() {
        if (deleting) return
        deleting = true
        viewModelScope.launch {
            val result = withContext(Dispatchers.IO) { graph.deletes.deleteAll() }
            deleting = false
            deleteResult = result
            if (result.phoneEmpty) {
                router.reset(if (graph.onboardingNeeded()) Route.Onboarding else Route.Home)
                sync()
            }
        }
    }

    fun dismissDeleteResult() { deleteResult = null }

    private fun sync() { stack = router.stack }
}
