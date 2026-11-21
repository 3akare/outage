package app.outage.places

import app.outage.map.LatLng
import app.outage.onboarding.MiniJson
import java.text.Normalizer

/**
 * Lagos places (ADR 0056): the 20 local government areas, their 376 wards and the H3 resolution-8 cells of each, from
 * `core/shared/fixtures/places/lagos-places.json` (GRID3, CC BY-SA 4.0). Pure Kotlin, so JUnit reads the real file.
 * A person picks LGA, then ward; the ward's anchor is the cell unless they tap another of the ward's cells.
 */
data class Lga(val slug: String, val name: String, val nipost: String, val centreCell: String, val wardSlugs: List<String>, val cellCount: Int)

data class Ward(val slug: String, val name: String, val alt: List<String>, val lgaSlug: String, val anchor: String, val cells: List<String>) {
    /** A ward with one cell, or none of its own (the anchor then sits in a neighbour), needs no map step. */
    val needsMap: Boolean get() = cells.size > 1 && anchor in cells
}

/** What the picker hands back: the cell and the words to show. Never a coordinate and never the postcode. */
data class PlacePick(val cell: String, val areaName: String)

/** A ward search result. [alias] is the alternative name that matched, when it was not the main name. */
data class WardHit(val ward: Ward, val alias: String?)

class Places(val lgas: List<Lga>, val wards: List<Ward>, val attribution: String) {
    private val lgaBySlug = lgas.associateBy { it.slug }
    private val wardBySlug = wards.associateBy { it.slug }
    private val lgaByNipost = lgas.associateBy { it.nipost }
    private val wardByCell: Map<String, Ward> = HashMap<String, Ward>().also { m -> wards.forEach { w -> w.cells.forEach { m[it] = w } } }

    fun lga(slug: String): Lga? = lgaBySlug[slug]
    fun ward(slug: String): Ward? = wardBySlug[slug]
    fun wardsOf(lgaSlug: String): List<Ward> = lga(lgaSlug)?.wardSlugs?.mapNotNull { wardBySlug[it] }.orEmpty()

    /** The ward that owns [cell] (the ward containing its centre), or null for a cell that is not a Lagos land cell. */
    fun wardOfCell(cell: String): Ward? = wardByCell[cell]
    fun isLandCell(cell: String): Boolean = cell in wardByCell

    /** The LGA a NIPOST postcode names, or null when it names none (see [Postcode.parse]). */
    fun lgaForPostcode(text: String): Lga? = (Postcode.parse(text) as? Postcode.Result.Lagos)?.let { lgaByNipost[it.lga] }

    /** The cell a ward gives when the person does not tap one: its anchor. */
    fun anchorFor(ward: Ward): String = ward.anchor

    /** "Opebi, Ikeja": what the app shows and stores as the spot's name. */
    fun areaName(ward: Ward): String = ward.name + ", " + (lga(ward.lgaSlug)?.name ?: ward.lgaSlug)

    /** The pick for [cell] in [ward]: a cell of the ward, or its anchor. */
    fun pick(ward: Ward, cell: String? = null): PlacePick =
        PlacePick(if (cell != null && cell in ward.cells) cell else anchorFor(ward), areaName(ward))

    /** The stored name for a saved cell, for the upgrade from the old nine-area map. Null for a cell outside Lagos land. */
    fun areaNameForCell(cell: String): String? = wardOfCell(cell)?.let(::areaName)

    /** LGAs whose name matches [query], prefix matches first. An empty query gives all 20 in order. */
    fun searchLgas(query: String): List<Lga> {
        val q = Search.fold(query)
        if (q.isEmpty()) return lgas
        return lgas.mapNotNull { l -> Search.score(q, l.name)?.let { it to l } }.sortedWith(compareBy({ it.first }, { it.second.name })).map { it.second }
    }

    /**
     * Wards matching [query] by name or GRID3 alternative name, accent and punctuation blind, prefix matches first.
     * [lgaSlug] limits the search to one LGA. An empty query lists the LGA's wards (or every ward) by name.
     */
    fun searchWards(query: String, lgaSlug: String? = null): List<WardHit> {
        val pool = if (lgaSlug != null) wardsOf(lgaSlug) else wards
        val q = Search.fold(query)
        if (q.isEmpty()) return pool.sortedBy { it.name }.map { WardHit(it, null) }
        val hits = ArrayList<Triple<Int, WardHit, String>>()
        for (w in pool) {
            val main = Search.score(q, w.name)
            var best: Int? = main
            var alias: String? = null
            for (a in w.alt) {
                val s = Search.score(q, a) ?: continue
                // An alias counts a little less than the main name at the same kind of match.
                if (best == null || s + 1 < best) { best = s + 1; alias = a }
            }
            if (best != null) hits += Triple(best, WardHit(w, if (main != null && main <= best) null else alias), w.name)
        }
        return hits.sortedWith(compareBy({ it.first }, { it.third })).map { it.second }
    }

    companion object {
        fun parse(text: String): Places {
            val root = MiniJson.parse(text) as Map<*, *>
            val lgas = (root["lgas"] as List<*>).map {
                val m = it as Map<*, *>
                Lga(m.s("slug"), m.s("name"), m.s("nipost"), m.s("centreCell"), m.strings("wards"), (m["cells"] as List<*>).size)
            }
            val wards = (root["wards"] as List<*>).map {
                val m = it as Map<*, *>
                Ward(m.s("slug"), m.s("name"), m.strings("alt"), m.s("lga"), m.s("anchor"), m.strings("cells"))
            }
            val attribution = ((root["source"] as? Map<*, *>)?.get("attribution") as? String).orEmpty()
            return Places(lgas, wards, attribution)
        }
    }
}

/** Outlines for the map (lagos-geo.json): each land cell's six corners and the LGA and ward outline rings. */
class PlacesGeo(val cells: Map<String, List<LatLng>>, val lgaOutlines: Map<String, List<List<LatLng>>>, val wardOutlines: Map<String, List<List<LatLng>>>) {
    fun ring(cell: String): List<LatLng>? = cells[cell]

    /** The middle of a cell: the mean of its corners. */
    fun centre(cell: String): LatLng? = cells[cell]?.let { r -> LatLng(r.sumOf { it.lat } / r.size, r.sumOf { it.lng } / r.size) }

    /**
     * The four corners of the box that holds every LGA outline, so the map can open with all 20 local governments in view
     * (Epe and Ibeju-Lekki reach far east, Badagry far west). Empty when there are no outlines.
     */
    fun lagosCorners(): List<LatLng> {
        val pts = lgaOutlines.values.flatten().flatten()
        if (pts.isEmpty()) return emptyList()
        val s = pts.minOf { it.lat }; val n = pts.maxOf { it.lat }; val w = pts.minOf { it.lng }; val e = pts.maxOf { it.lng }
        return listOf(LatLng(s, w), LatLng(s, e), LatLng(n, w), LatLng(n, e))
    }

    companion object {
        fun parse(text: String): PlacesGeo {
            val root = MiniJson.parse(text) as Map<*, *>
            fun ring(v: Any?): List<LatLng> = (v as List<*>).map { p -> (p as List<*>).let { LatLng(it[0] as Double, it[1] as Double) } }
            fun rings(v: Any?): Map<String, List<List<LatLng>>> = (v as Map<*, *>).entries.associate { (k, rs) -> k as String to (rs as List<*>).map(::ring) }
            val cells = (root["cells"] as Map<*, *>).entries.associate { (k, r) -> k as String to ring(r) }
            return PlacesGeo(cells, rings(root["lgas"]), rings(root["wards"]))
        }
    }
}

/**
 * The NIPOST digital postcode (live 1 Oct 2026): `LA NN DDD AA BB`, for example `LA 11 A12 GN 01`. `LA` is Lagos State and
 * `NN` the LGA, numbered alphabetically (01 Agege to 20 Surulere). Only the LGA is read from it; the code itself is never
 * stored or sent (privacy.md). Spaces, dashes and dots are ignored, case does not matter, and "LA 11" alone is enough.
 */
object Postcode {
    sealed interface Result {
        /** Nothing typed yet. */
        data object Empty : Result
        /** A start that could still become a Lagos postcode ("L", "LA", "LA1"). */
        data object Partial : Result
        /** A Lagos postcode naming LGA [lga] ("01" to "20"). [complete] when all eleven characters are there. */
        data class Lagos(val lga: String, val complete: Boolean) : Result
        /** A postcode of another state. */
        data object NotLagos : Result
        /** Not a postcode at all. */
        data object Invalid : Result
    }

    private val TAIL_FULL = Regex("^[A-Z0-9]{3}[A-Z]{2}[0-9]{2}$")

    fun parse(text: String): Result {
        val s = text.uppercase().filter { it.isLetterOrDigit() }
        if (s.isEmpty()) return Result.Empty
        if (text.any { !(it.isLetterOrDigit() || it == ' ' || it == '-' || it == '.' || it == '/') }) return Result.Invalid
        if (!s[0].isLetter()) return Result.Invalid
        if (s.length == 1) return if (s == "L") Result.Partial else Result.NotLagos
        if (!s[1].isLetter()) return Result.Invalid
        if (s.substring(0, 2) != "LA") return if (s.length <= 11) Result.NotLagos else Result.Invalid
        if (s.length == 2) return Result.Partial
        if (!s[2].isDigit()) return Result.Invalid
        if (s.length == 3) return if (s[2] in '0'..'2') Result.Partial else Result.Invalid
        if (!s[3].isDigit()) return Result.Invalid
        val nn = s.substring(2, 4)
        val n = nn.toInt()
        if (n !in 1..20) return Result.Invalid
        val tail = s.substring(4)
        if (tail.length > 7) return Result.Invalid
        if (tail.length == 7 && !TAIL_FULL.matches(tail)) return Result.Invalid
        return Result.Lagos(nn, complete = tail.length == 7)
    }

    /** The most of a postcode that may be kept: "LA11". Null for anything that is not a Lagos postcode. */
    fun prefix(text: String): String? = (parse(text) as? Result.Lagos)?.let { "LA" + it.lga }
}

/** Accent, case and punctuation blind matching for place names. */
internal object Search {
    private val MARKS = Regex("\\p{M}+")
    private val NON_ALNUM = Regex("[^a-z0-9]+")

    /** "Ìkòyí-Obalende " -> "ikoyi obalende". */
    fun fold(s: String): String =
        Normalizer.normalize(s.lowercase(), Normalizer.Form.NFD).replace(MARKS, "").replace(NON_ALNUM, " ").trim()

    /**
     * How well folded query [q] matches [name]: 0 whole name starts with it, 1 a word starts with it, 2 it appears
     * anywhere (also with spaces ignored, so "okeira" finds "Oke-Ira"). Null when it does not match.
     */
    fun score(q: String, name: String): Int? {
        val n = fold(name)
        if (n.startsWith(q)) return 0
        if (n.split(' ').any { it.startsWith(q) } || n.contains(" $q")) return 1
        val nq = q.replace(" ", "")
        if (n.contains(q) || n.replace(" ", "").contains(nq)) return 2
        return null
    }
}

private fun Map<*, *>.s(key: String): String = this[key] as? String ?: throw IllegalArgumentException(key)
private fun Map<*, *>.strings(key: String): List<String> = (this[key] as? List<*>).orEmpty().map { it as String }
