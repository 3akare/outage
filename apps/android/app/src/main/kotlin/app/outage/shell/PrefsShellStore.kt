package app.outage.shell

import android.annotation.SuppressLint
import android.content.Context
import android.content.SharedPreferences

/**
 * SHELL_PREFS in SharedPreferences (design section 6). DataStore is not approved.
 * https://developer.android.com/training/data-storage/shared-preferences
 */
// commit() on purpose: "Deleted" is shown only after the data is on disk (app-shell R5.4).
@SuppressLint("ApplySharedPref")
class PrefsShellStore(context: Context) : ShellStore {
    private val prefs: SharedPreferences = context.getSharedPreferences("shell_prefs", Context.MODE_PRIVATE)

    // Any failure reads as "not done": the user sets up again, which is safe (design section 8).
    override var onboardingDone: Boolean
        get() = try { prefs.getBoolean(K_ONBOARDING, false) } catch (e: Exception) { false }
        set(value) { prefs.edit().putBoolean(K_ONBOARDING, value).commit() }

    override var alias: String
        get() = try { prefs.getString(K_ALIAS, "").orEmpty() } catch (e: Exception) { "" }
        set(value) { prefs.edit().putString(K_ALIAS, value).commit() }

    override var language: String
        get() = try { prefs.getString(K_LANGUAGE, "system").orEmpty() } catch (e: Exception) { "system" }
        set(value) { prefs.edit().putString(K_LANGUAGE, value).commit() }

    override var pendingServerDelete: Boolean
        get() = try { prefs.getBoolean(K_PENDING, false) } catch (e: Exception) { false }
        set(value) { prefs.edit().putBoolean(K_PENDING, value).commit() }

    override fun clearAll() {
        val pending = pendingServerDelete
        // commit(), not apply(): "Deleted" is shown only after the data is gone (R5.4).
        prefs.edit().clear().putBoolean(K_PENDING, pending).commit()
    }

    private companion object {
        const val K_ONBOARDING = "onboardingDone"
        const val K_ALIAS = "alias"
        const val K_LANGUAGE = "language"
        const val K_PENDING = "pendingServerDelete"
    }
}
