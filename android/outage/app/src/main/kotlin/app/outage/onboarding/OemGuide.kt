package app.outage.onboarding

/** One group of numbered steps (the app numbers them). `settingsAction` is an `android.settings.*` intent action name. */
data class StepGroup(val title: String, val steps: List<String>, val settingsAction: String?)

data class ChecklistItem(val id: String, val text: String)

data class Verification(val device: String, val android: String, val date: String, val result: String)

/** Which heading the battery screen shows (R7.4). The UI maps it to a string resource. */
enum class GuideLabel { VERIFIED, GENERAL }

data class OemMaker(
    val id: String,
    val name: String,
    val matchManufacturer: List<String>,
    val matchBrand: List<String>,
    val stepGroups: List<StepGroup>,
    val checklist: List<ChecklistItem>,
    val source: String,
    val verified: List<Verification>,
) {
    /** Verified only when a person recorded a passing device check. "Tried" (partial or fail) still shows the general label. */
    val label: GuideLabel
        get() = if (id != OemGuide.OTHER && verified.any { it.result == "pass" }) GuideLabel.VERIFIED else GuideLabel.GENERAL
}

/**
 * The OEM battery guide read from `oem-guide.json` (single source: core/shared/src/oem-guide.json, copied
 * into the app assets at build time). Matching follows `.kiro/skills/oem-battery-guide/scripts/validate-guide.mjs`:
 * lower-case tokens, contained in the phone's manufacturer or brand text, "other" as the default.
 */
class OemGuide(val version: Int, val makers: List<OemMaker>) {
    private val other: OemMaker = makers.first { it.id == OTHER }

    /**
     * Total: any strings map to exactly one maker (O4). Manufacturer is tried before brand, since a phone
     * from a maker family can carry another brand (for example manufacturer "TRANSSION", brand "Infinix").
     * Inside one field the first maker in guide order wins; the validator keeps tokens from overlapping,
     * so ties do not occur with the shipped file.
     */
    fun match(manufacturer: String?, brand: String?): OemMaker {
        val m = manufacturer.orEmpty().trim().lowercase()
        val b = brand.orEmpty().trim().lowercase()
        makers.firstOrNull { mk -> mk.id != OTHER && mk.matchManufacturer.any { it.isNotEmpty() && m.contains(it) } }?.let { return it }
        makers.firstOrNull { mk -> mk.id != OTHER && mk.matchBrand.any { it.isNotEmpty() && b.contains(it) } }?.let { return it }
        return other
    }

    companion object {
        const val OTHER = "other"
        const val ASSET_NAME = "oem-guide.json"

        /** Parses the file text. Throws [IllegalArgumentException] if the shape is wrong, so a bad build fails in tests. */
        fun parse(text: String): OemGuide {
            val root = MiniJson.parse(text).asMap("guide")
            val makers = root.list("makers").map { readMaker(it.asMap("maker")) }
            require(makers.any { it.id == OTHER }) { "guide has no \"other\" entry" }
            return OemGuide((root["version"] as? Double)?.toInt() ?: throw IllegalArgumentException("version"), makers)
        }

        private fun readMaker(m: Map<String, Any?>): OemMaker {
            val match = (m["match"] ?: emptyMap<String, Any?>()).asMap("match")
            return OemMaker(
                id = m.str("id"),
                name = m.str("name"),
                matchManufacturer = match.strings("manufacturer"),
                matchBrand = match.strings("brand"),
                stepGroups = m.list("steps").map {
                    val g = it.asMap("step group")
                    StepGroup(g.str("title"), g.strings("steps"), g["settingsAction"] as? String)
                },
                checklist = m.list("checklist").map {
                    val c = it.asMap("checklist item")
                    ChecklistItem(c.str("id"), c.str("text"))
                },
                source = m.str("source"),
                verified = m.list("verified").map {
                    val v = it.asMap("verified")
                    Verification(v.str("device"), v["android"].toString(), v.str("date"), v.str("result"))
                },
            )
        }

        @Suppress("UNCHECKED_CAST")
        private fun Any?.asMap(what: String): Map<String, Any?> = this as? Map<String, Any?> ?: throw IllegalArgumentException(what + " is not an object")
        private fun Map<String, Any?>.str(k: String): String = this[k] as? String ?: throw IllegalArgumentException(k + " is not text")
        private fun Map<String, Any?>.list(k: String): List<Any?> = this[k] as? List<Any?> ?: throw IllegalArgumentException(k + " is not a list")
        private fun Map<String, Any?>.strings(k: String): List<String> = list(k).map { it as? String ?: throw IllegalArgumentException(k + " has a non-text item") }
    }
}
