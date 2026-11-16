package app.outage.log

import app.outage.alarm.StringPackCheck
import app.outage.shell.Res
import app.outage.shell.StringPack
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * power-log R5.5 and task 3: the shipped band config has sources and a checked date, validates, and marks
 * entries verified only when a NERC source backs them. Also checks the supply-promise copy strings (R5.4, PL6).
 * Gradle runs unit tests with the module directory (`android/outage/app`) as the working directory.
 */
class BandConfigTest {
    private val file = File("src/main/assets/${BandConfig.ASSET_NAME}")
    private val config: BandConfig by lazy { BandConfig.parse(file.readText()) }

    @Test
    fun band_config_shipped_file_parses_and_validates() {
        assertTrue(file.path, file.isFile)
        val problems = config.validate()
        assertTrue("config problems: $problems", problems.isEmpty())
    }

    @Test
    fun band_config_has_the_five_nerc_bands_in_order() {
        assertEquals(listOf("A", "B", "C", "D", "E"), config.bands.map { it.id })
        // Promised minima decrease down the bands and stay within a day.
        val hours = config.bands.map { it.promisedMinHoursPerDay }
        assertEquals(hours.sortedDescending(), hours)
        assertTrue(hours.all { it in 0..24 })
    }

    @Test
    fun band_config_every_band_has_sources_and_a_checked_date() {
        for (b in config.bands) {
            assertTrue("${b.id} needs a reference", b.sources.isNotEmpty() || b.officialSource != null)
            assertTrue("${b.id} checked date", Regex("""\d{4}-\d{2}-\d{2}""").matches(b.checked))
            assertTrue("${b.id} note", b.note.isNotBlank())
            for (s in b.sources) assertTrue("${b.id} https source", s.startsWith("https://"))
        }
        assertTrue(config.officialSources.all { BandConfig.isOfficialNerc(it) })
    }

    @Test
    fun band_config_verified_bands_cite_an_official_nerc_source() {
        for (b in config.bands) {
            if (b.verified) {
                assertTrue("${b.id} verified needs official NERC source", BandConfig.isOfficialNerc(b.officialSource.orEmpty()))
            }
        }
        // NERC's FAQ on electricity tariffs states every band's minimum hours (checked 2026-11-15).
        val hours = mapOf("A" to 20, "B" to 16, "C" to 12, "D" to 8, "E" to 4)
        for ((id, h) in hours) {
            val b = config.band(id)!!
            assertTrue("Band $id is verified", b.verified)
            assertEquals("Band $id hours", h, b.promisedMinHoursPerDay)
        }
    }

    @Test
    fun band_config_parse_rejects_a_broken_shape() {
        for (bad in listOf("", "{", "{\"version\":1}", "[]")) {
            val ok = try { BandConfig.parse(bad); true } catch (e: IllegalArgumentException) { false }
            assertFalse("accepted bad input: $bad", ok)
        }
    }

    @Test
    fun band_config_validate_flags_content_problems() {
        val bad = BandConfig.parse(
            """{"version":0,"checked":"2026/01/01","regulator":"NERC","note":"n",
               "officialSources":["http://nerc.gov.ng/x"],
               "bands":[
                 {"id":"A","name":"Band A","promisedMinHoursPerDay":30,"verified":true,
                  "officialSource":"https://example.com/x","sources":["ftp://x"],"checked":"2026-01-01","note":"n"},
                 {"id":"A","name":"","promisedMinHoursPerDay":8,"verified":false,
                  "officialSource":null,"sources":[],"checked":"2026-01-01","note":""}
               ]}""",
        )
        val p = bad.validate()
        assertTrue("version", p.any { it.contains("version") })
        assertTrue("top date", p.any { it.contains("checked date is not") })
        assertTrue("officialSources http not https", p.any { it.contains("officialSources entry is not") })
        assertTrue("hours range", p.any { it.contains("out of 0..24") })
        assertTrue("verified needs nerc", p.any { it.contains("verified band needs an official") })
        assertTrue("non-https source", p.any { it.contains("source is not https") })
        assertTrue("duplicate id", p.any { it.contains("duplicate id") })
        assertTrue("blank name", p.any { it.contains("name is blank") })
        assertTrue("no reference", p.any { it.contains("no source and no officialSource") })
        assertTrue("blank note", p.any { it.contains("note (provenance) is blank") })
    }

    // --- copy strings (R5.4, PL6) -----------------------------------------

    private fun packs(): Map<String, Map<String, String>> = mapOf(
        "en" to StringPack.parse(Res.values()),
        "pcm" to StringPack.parse(Res.file("values-pcm/strings.xml")),
    )

    @Test
    fun band_strings_are_present_and_well_formed() {
        val problems = StringPackCheck.check(packs(), BandStrings.ALL)
        assertTrue("band string problems: $problems", problems.isEmpty())
        val en = packs().getValue("en")
        for (k in BandStrings.ALL) assertTrue("missing $k", k in en)
    }

    @Test
    fun band_strings_never_promise_compensation_and_label_estimate() {
        val en = packs().getValue("en")
        for (k in BandStrings.ALL) {
            val v = en.getValue(k).lowercase()
            for (word in BandStrings.FORBIDDEN) assertFalse("$k contains '$word'", v.contains(word))
        }
        assertTrue("estimate note labels the estimate", en.getValue("promise_estimate_note").lowercase().contains("estimate"))
    }
}
