package app.outage.shell

import app.outage.net.ServerDelete

data class DeleteResult(
    /** True when every registered phone-side delete finished. Only then may the UI say "Deleted" (R5.4). */
    val phoneEmpty: Boolean,
    /** True when the server confirmed, or no server delete is registered. */
    val serverDone: Boolean,
    /** Keys of features whose phone-side delete threw. */
    val failedFeatures: List<String>,
)

/**
 * Delete my data (R5). Features register a phone-side delete. The server call is made after the
 * phone side, and a failure there never stops the phone side (R5.3).
 */
class DeleteRegistry(private val store: ShellStore) {
    private val phone = LinkedHashMap<String, () -> Unit>()
    private var server: ServerDelete? = null

    fun register(key: String, delete: () -> Unit) {
        phone[key] = delete
    }

    fun registerServer(delete: ServerDelete) {
        server = delete
    }

    /** Runs on a background thread: the server call is a network call. */
    fun deleteAll(): DeleteResult {
        // Set the flag first so a crash or kill between here and the server answer still retries.
        if (server != null) store.pendingServerDelete = true
        val failed = mutableListOf<String>()
        for ((key, delete) in phone) {
            try {
                delete()
            } catch (e: Exception) {
                failed += key
            }
        }
        val serverDone = if (server == null) true else attemptServer()
        return DeleteResult(phoneEmpty = failed.isEmpty(), serverDone = serverDone, failedFeatures = failed)
    }

    /** Called at app start. Returns true when nothing is pending or the retry succeeded. */
    fun retryPending(): Boolean {
        if (!store.pendingServerDelete) return true
        return attemptServer()
    }

    private fun attemptServer(): Boolean {
        val call = server ?: return false
        val ok = try {
            call.delete()
        } catch (e: Exception) {
            false
        }
        if (ok) store.pendingServerDelete = false
        return ok
    }
}
