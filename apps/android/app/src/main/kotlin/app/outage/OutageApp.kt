package app.outage

import android.app.Application
import android.content.pm.ApplicationInfo
import app.outage.shell.ShellGraph

class OutageApp : Application() {
    lateinit var graph: ShellGraph
        private set

    override fun onCreate() {
        super.onCreate()
        graph = ShellGraph(this)
        // https://developer.android.com/reference/android/content/pm/ApplicationInfo#FLAG_DEBUGGABLE
        graph.debugPlaceholderAllowed = (applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0
        // A server delete that failed earlier is retried here, off the main thread (R5.3).
        if (graph.store.pendingServerDelete) Thread { graph.deletes.retryPending() }.start()
        // Feature packages register their screens and delete functions on `graph.features` and
        // `graph.deletes` here, as they are built. Nothing else starts at app start (R1.4).
    }
}
