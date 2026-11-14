package app.outage.shell

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities

/**
 * Reads whether the phone has a validated network. Needs ACCESS_NETWORK_STATE, a normal permission
 * granted at install with no prompt.
 * https://developer.android.com/reference/android/net/ConnectivityManager#getNetworkCapabilities(android.net.Network)
 */
fun interface Connectivity {
    fun isOnline(): Boolean
}

class AndroidConnectivity(context: Context) : Connectivity {
    private val manager = context.applicationContext.getSystemService(ConnectivityManager::class.java)

    override fun isOnline(): Boolean {
        val cm = manager ?: return false
        val caps = cm.getNetworkCapabilities(cm.activeNetwork) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
            caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
    }
}
