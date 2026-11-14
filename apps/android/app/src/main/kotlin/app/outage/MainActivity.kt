package app.outage

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewmodel.viewModelFactory
import androidx.lifecycle.viewmodel.initializer
import app.outage.shell.Routes
import app.outage.ui.OutageTheme
import app.outage.ui.Shell
import app.outage.ui.ShellViewModel

/**
 * The only Activity. https://developer.android.com/develop/ui/compose/setup
 * Starts no sensor, service or upload (R1.4) and asks for no permission (R9.2).
 */
class MainActivity : ComponentActivity() {
    private lateinit var shell: ShellViewModel

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val graph = (application as OutageApp).graph
        val deepLink = Routes.fromIntent(intent?.getStringExtra(Routes.EXTRA))
        shell = ViewModelProvider(
            this,
            viewModelFactory { initializer { ShellViewModel(graph, deepLink) } },
        )[ShellViewModel::class.java]
        setContent {
            OutageTheme {
                Shell(graph, shell, graph.debugPlaceholderAllowed)
            }
        }
    }

    /** A notification tap while the app is open (R1.3). Needs launchMode singleTop in the manifest. */
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        shell.openDeepLink(Routes.fromIntent(intent.getStringExtra(Routes.EXTRA)))
    }
}
