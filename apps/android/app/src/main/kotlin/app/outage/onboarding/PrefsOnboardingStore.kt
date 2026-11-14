package app.outage.onboarding

import android.annotation.SuppressLint
import android.content.Context
import android.content.SharedPreferences

/**
 * `onboarding_prefs` in SharedPreferences (design section 8). Holds the cell, never coordinates.
 * https://developer.android.com/training/data-storage/shared-preferences
 */
// commit() on purpose: the step must be on disk before the next screen shows, and Delete my data waits for it.
@SuppressLint("ApplySharedPref")
class PrefsOnboardingStore(context: Context) : OnboardingStore {
    private val prefs: SharedPreferences = context.getSharedPreferences("onboarding_prefs", Context.MODE_PRIVATE)

    override fun load(): OnboardingRecord? = try {
        val all = prefs.all.mapNotNull { (k, v) -> (v as? String)?.let { k to it } }.toMap()
        OnboardingCodec.decode(all)
    } catch (e: Exception) {
        null
    }

    override fun save(record: OnboardingRecord) {
        val edit = prefs.edit().clear()
        for ((k, v) in OnboardingCodec.encode(record)) edit.putString(k, v)
        edit.commit()
    }

    override fun clear() {
        prefs.edit().clear().commit()
    }
}
