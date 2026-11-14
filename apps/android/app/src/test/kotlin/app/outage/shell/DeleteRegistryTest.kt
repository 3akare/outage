package app.outage.shell

import app.outage.net.ServerDelete
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

private class FakeStore : ShellStore {
    override var onboardingDone = true
    override var alias = "amber-owl"
    override var language = "pcm"
    override var pendingServerDelete = false
    override fun clearAll() {
        onboardingDone = false
        alias = ""
        language = "system"
        // pendingServerDelete is deliberately kept, like the real store.
    }
}

/** app-shell R5, property AS6. */
class DeleteRegistryTest {
    private val store = FakeStore()
    private val registry = DeleteRegistry(store)
    private var featureData = mutableListOf("a", "b")
    private var server = true

    init {
        registry.register("shell") { store.clearAll() }
        registry.register("log") { featureData.clear() }
        registry.registerServer(ServerDelete { server })
    }

    @Test
    fun AS6_delete_all_server_ok_empties_phone_and_clears_flag() {
        val r = registry.deleteAll()
        assertTrue(r.phoneEmpty)
        assertTrue(r.serverDone)
        assertTrue(featureData.isEmpty())
        assertFalse(store.onboardingDone)
        assertFalse(store.pendingServerDelete)
    }

    @Test
    fun AS6_delete_all_server_failure_still_empties_phone_and_keeps_pending() {
        server = false
        val r = registry.deleteAll()
        assertTrue(r.phoneEmpty)
        assertFalse(r.serverDone)
        assertTrue(featureData.isEmpty())
        assertEquals("", store.alias)
        assertTrue("pending flag must survive the delete", store.pendingServerDelete)
    }

    @Test
    fun AS6_delete_all_server_exception_counts_as_failure() {
        val reg = DeleteRegistry(store)
        reg.registerServer(ServerDelete { throw java.io.IOException("no network") })
        val r = reg.deleteAll()
        assertTrue(r.phoneEmpty)
        assertFalse(r.serverDone)
        assertTrue(store.pendingServerDelete)
    }

    @Test
    fun AS6_delete_all_retry_clears_flag_after_later_success() {
        server = false
        registry.deleteAll()
        assertTrue(store.pendingServerDelete)
        assertFalse(registry.retryPending())
        assertTrue(store.pendingServerDelete)
        server = true
        assertTrue(registry.retryPending())
        assertFalse(store.pendingServerDelete)
    }

    @Test
    fun AS6_delete_all_retry_with_nothing_pending_does_nothing() {
        var calls = 0
        val reg = DeleteRegistry(store)
        reg.registerServer(ServerDelete { calls++; true })
        assertTrue(reg.retryPending())
        assertEquals(0, calls)
    }

    @Test
    fun AS6_delete_all_one_feature_failing_does_not_stop_the_others_and_is_reported() {
        val reg = DeleteRegistry(store)
        var later = false
        reg.register("bad") { throw IllegalStateException("disk") }
        reg.register("good") { later = true }
        val r = reg.deleteAll()
        assertTrue(later)
        assertFalse("Deleted must not be claimed", r.phoneEmpty)
        assertEquals(listOf("bad"), r.failedFeatures)
    }

    @Test
    fun AS6_delete_all_without_server_registered_is_phone_only() {
        val reg = DeleteRegistry(store)
        reg.register("shell") { store.clearAll() }
        val r = reg.deleteAll()
        assertTrue(r.phoneEmpty)
        assertTrue(r.serverDone)
        assertFalse(store.pendingServerDelete)
    }
}
