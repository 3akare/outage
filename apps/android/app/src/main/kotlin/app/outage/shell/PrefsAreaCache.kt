package app.outage.shell

import android.annotation.SuppressLint
import android.content.Context

/**
 * AREA_CACHE (design section 6): last known area status, for Home when offline.
 * The shell only reads it; the area feature writes it with [save].
 */
// commit() on purpose: "Deleted" is shown only after the data is on disk (app-shell R5.4).
@SuppressLint("ApplySharedPref")
class PrefsAreaCache(context: Context) {
    private val prefs = context.getSharedPreferences("area_cache", Context.MODE_PRIVATE)

    fun read(): AreaStatus? = try {
        val level = prefs.getString("level", null)?.let { name -> StatusLevel.entries.firstOrNull { it.name == name } }
        val at = prefs.getLong("updatedAtWallMs", -1L)
        if (level == null || at < 0) null else AreaStatus(level, at, prefs.getBoolean("simulated", false))
    } catch (e: Exception) {
        null
    }

    fun save(status: AreaStatus) {
        prefs.edit().putString("level", status.level.name).putLong("updatedAtWallMs", status.updatedAtWallMs)
            .putBoolean("simulated", status.simulated).commit()
    }

    fun clear() {
        prefs.edit().clear().commit()
    }
}
