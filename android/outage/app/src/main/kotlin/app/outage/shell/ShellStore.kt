package app.outage.shell

/**
 * Small values the shell remembers (design section 6). Backed by SharedPreferences on the phone.
 * Implementations must not throw: unreadable data reads as "onboarding not done" (design section 8).
 */
interface ShellStore {
    var onboardingDone: Boolean

    /** Short alias for display only, never the install ID. Empty when not set. */
    var alias: String

    /** "system", "en" or "pcm". */
    var language: String

    /** True while a server delete request has not been confirmed. Survives [clearAll]. */
    var pendingServerDelete: Boolean

    /** Removes everything except [pendingServerDelete], which must outlive the delete. */
    fun clearAll()
}
