package app.outage.places

import android.content.Context
import app.outage.onboarding.OnboardingRecord
import app.outage.onboarding.OnboardingStore

/**
 * The bundled Lagos places (ADR 0056). The build copies the two JSON files of core/shared/fixtures/places into the assets, so git has one
 * copy. Each file is parsed once, on the caller's thread (call it off the main thread), and kept for the life of the process.
 */
object PlacesAssets {
    const val PLACES = "lagos-places.json"
    const val GEO = "lagos-geo.json"

    @Volatile private var places: Places? = null
    @Volatile private var geo: PlacesGeo? = null

    /** Already parsed, or null. Safe on the main thread. */
    fun cachedPlaces(): Places? = places
    fun cachedGeo(): PlacesGeo? = geo

    fun places(ctx: Context): Places? = places ?: synchronized(this) {
        places ?: runCatching { Places.parse(read(ctx, PLACES)) }.getOrNull()?.also { places = it }
    }

    fun geo(ctx: Context): PlacesGeo? = geo ?: synchronized(GEO) {
        geo ?: runCatching { PlacesGeo.parse(read(ctx, GEO)) }.getOrNull()?.also { geo = it }
    }

    private fun read(ctx: Context, name: String): String = ctx.assets.open(name).bufferedReader().use { it.readText() }
}

/**
 * The upgrade from the nine hand-placed areas (ADR 0056): a saved cell that is a Lagos land cell gets its name rewritten to
 * "Ward, LGA". Any other saved cell is left as it is; Now then offers "Choose your area" so the person picks again.
 */
object SpotUpgrade {
    fun rewrite(record: OnboardingRecord, places: Places): OnboardingRecord? {
        val cell = record.cell ?: return null
        val name = places.areaNameForCell(cell) ?: return null
        return if (record.areaName == name) null else record.copy(areaName = name)
    }

    fun run(store: OnboardingStore, places: Places) {
        val r = runCatching { store.load() }.getOrNull() ?: return
        rewrite(r, places)?.let { store.save(it) }
    }

    /** True when a spot is saved but is not a Lagos land cell, so it should be picked again. */
    fun needsRepick(record: OnboardingRecord?, places: Places?): Boolean {
        val cell = record?.cell ?: return false
        return places != null && !places.isLandCell(cell)
    }
}
