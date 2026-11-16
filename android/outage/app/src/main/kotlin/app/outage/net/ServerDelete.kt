package app.outage.net

/**
 * The server delete call (event-ingest R12). The `net` feature implements it later.
 * Returns true only when the server confirmed the delete. It runs off the main thread.
 */
fun interface ServerDelete {
    fun delete(): Boolean
}
