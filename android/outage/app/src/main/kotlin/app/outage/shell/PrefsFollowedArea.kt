package app.outage.shell

import android.annotation.SuppressLint
import android.content.Context

/**
 * The area slug the user follows (map sheet "Follow this area", R3.3). Only a catalog slug such as "yaba": no location,
 * no cell id. Delete-my-data clears it (privacy.md, ADR 0024).
 */
// commit() on purpose, same as the other stores: "Deleted" is shown only after the data is on disk.
@SuppressLint("ApplySharedPref")
class PrefsFollowedArea(context: Context) {
    private val prefs = context.getSharedPreferences("followed_area", Context.MODE_PRIVATE)

    fun read(): String? = try { prefs.getString("slug", null) } catch (_: Exception) { null }

    fun save(slug: String) {
        prefs.edit().putString("slug", slug).commit()
    }

    fun clear() {
        prefs.edit().clear().commit()
    }
}
