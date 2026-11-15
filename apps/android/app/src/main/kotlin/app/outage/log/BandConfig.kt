package app.outage.log

import app.outage.onboarding.MiniJson

/**
 * One tariff band (power-log R5). `promisedMinHoursPerDay` is the band's promised minimum hours of power
 * per day. `verified` is true only when the figure (or its boundary) comes from a readable NERC source;
 * an unverified band must be shown as unconfirmed in the UI, never as a firm promise (claims discipline).
 */
data class Band(
    val id: String,
    val name: String,
    val promisedMinHoursPerDay: Int,
    val verified: Boolean,
    val officialSource: String?,
    val sources: List<String>,
    val checked: String,
    val note: String,
)

/**
 * The supply-band list read from `bands.json` (the single app asset; power-log R5.5). Parsing is strict and
 * throws on a bad shape so a broken file fails in tests; [validate] returns the softer, content-level
 * problems (hours range, https sources, a verified band needing an official NERC source, date format).
 * Pure Kotlin (hand-written `MiniJson`, no new dependency), so JUnit 4 can drive it on the JVM.
 */
class BandConfig(
    val version: Int,
    val checked: String,
    val regulator: String,
    val note: String,
    val officialSources: List<String>,
    val bands: List<Band>,
) {
    fun band(id: String): Band? = bands.firstOrNull { it.id == id }

    /** Content checks (power-log R5.5, claims discipline). Empty means the config is valid. */
    fun validate(): List<String> {
        val problems = ArrayList<String>()
        if (version < 1) problems += "version must be >= 1"
        if (!DATE.matches(checked)) problems += "checked date is not YYYY-MM-DD: $checked"
        if (regulator.isBlank()) problems += "regulator is blank"
        if (bands.isEmpty()) problems += "no bands"
        for (u in officialSources) if (!isOfficialNerc(u)) problems += "officialSources entry is not an https nerc.gov.ng URL: $u"

        val seen = HashSet<String>()
        for (b in bands) {
            val at = "band ${b.id}"
            if (!ID.matches(b.id)) problems += "$at: id is not a single letter A-Z"
            if (!seen.add(b.id)) problems += "$at: duplicate id"
            if (b.name.isBlank()) problems += "$at: name is blank"
            if (b.promisedMinHoursPerDay !in 0..24) problems += "$at: promisedMinHoursPerDay out of 0..24: ${b.promisedMinHoursPerDay}"
            if (!DATE.matches(b.checked)) problems += "$at: checked date is not YYYY-MM-DD: ${b.checked}"
            if (b.note.isBlank()) problems += "$at: note (provenance) is blank"
            val refs = b.sources + listOfNotNull(b.officialSource)
            if (refs.isEmpty()) problems += "$at: no source and no officialSource"
            for (s in b.sources) if (!s.startsWith("https://")) problems += "$at: source is not https: $s"
            b.officialSource?.let { if (!isOfficialNerc(it)) problems += "$at: officialSource is not an https nerc.gov.ng URL: $it" }
            if (b.verified && !isOfficialNerc(b.officialSource.orEmpty())) {
                problems += "$at: verified band needs an official https nerc.gov.ng source"
            }
        }
        return problems
    }

    companion object {
        const val ASSET_NAME = "bands.json"
        private val DATE = Regex("""\d{4}-\d{2}-\d{2}""")
        private val ID = Regex("""[A-Z]""")

        /** True for an https URL on the regulator's own domain. */
        fun isOfficialNerc(url: String): Boolean =
            url.startsWith("https://nerc.gov.ng/") || url.startsWith("https://www.nerc.gov.ng/")

        /** Throws [IllegalArgumentException] if the shape is wrong. */
        @Suppress("UNCHECKED_CAST")
        fun parse(text: String): BandConfig {
            val root = MiniJson.parse(text).asMap("bands.json")
            return BandConfig(
                version = (root["version"] as? Double)?.toInt() ?: throw IllegalArgumentException("version"),
                checked = root.str("checked"),
                regulator = root.str("regulator"),
                note = root.str("note"),
                officialSources = root.strings("officialSources"),
                bands = root.list("bands").map { readBand(it.asMap("band")) },
            )
        }

        private fun readBand(m: Map<String, Any?>): Band = Band(
            id = m.str("id"),
            name = m.str("name"),
            promisedMinHoursPerDay = (m["promisedMinHoursPerDay"] as? Double)?.toInt()
                ?: throw IllegalArgumentException("promisedMinHoursPerDay"),
            verified = m["verified"] as? Boolean ?: throw IllegalArgumentException("verified"),
            officialSource = m["officialSource"] as? String,
            sources = m.strings("sources"),
            checked = m.str("checked"),
            note = m.str("note"),
        )

        @Suppress("UNCHECKED_CAST")
        private fun Any?.asMap(what: String): Map<String, Any?> =
            this as? Map<String, Any?> ?: throw IllegalArgumentException("$what is not an object")
        private fun Map<String, Any?>.str(k: String): String =
            this[k] as? String ?: throw IllegalArgumentException("$k is not text")
        private fun Map<String, Any?>.list(k: String): List<Any?> =
            this[k] as? List<Any?> ?: throw IllegalArgumentException("$k is not a list")
        private fun Map<String, Any?>.strings(k: String): List<String> =
            list(k).map { it as? String ?: throw IllegalArgumentException("$k has a non-text item") }
    }
}
