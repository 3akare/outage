package app.outage.onboarding

import java.io.File
import kotlin.random.Random
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** onboarding R7.1 to R7.4, R7.9; properties O4 and O5. Reads the one shared guide file from disk. */
class OemGuideTest {
    // Gradle runs unit tests with the module directory (apps/android/app) as the working directory.
    private val guideFile = File("../../../packages/shared/src/oem-guide.json")
    private val guide: OemGuide by lazy { OemGuide.parse(guideFile.readText()) }

    private fun ids(m: OemMaker) = m.id

    @Test
    fun O4_maker_matching_guide_file_is_the_shared_file_and_has_every_maker() {
        assertTrue(guideFile.path, guideFile.isFile)
        assertEquals(listOf("tecno", "infinix", "itel", "samsung", "xiaomi", "pixel", "other"), guide.makers.map(::ids))
        val other = guide.makers.last()
        assertTrue(other.matchManufacturer.isEmpty() && other.matchBrand.isEmpty())
    }

    @Test
    fun O4_maker_matching_known_phones() {
        fun id(m: String?, b: String?) = guide.match(m, b).id
        assertEquals("tecno", id("TECNO MOBILE LIMITED", "TECNO"))
        assertEquals("infinix", id("INFINIX MOBILITY LIMITED", "Infinix"))
        assertEquals("itel", id("itel", "itel"))
        assertEquals("itel", id("TRANSSION HOLDINGS", "itel"))
        assertEquals("samsung", id("samsung", "samsung"))
        assertEquals("xiaomi", id("Xiaomi", "Redmi"))
        assertEquals("xiaomi", id("Xiaomi", "POCO"))
        assertEquals("pixel", id("Google", "google"))
        assertEquals("other", id("OnePlus", "OnePlus"))
        assertEquals("other", id(null, null))
        assertEquals("other", id("", "  "))
    }

    @Test
    fun O4_maker_matching_is_total_and_picks_the_expected_maker() {
        val r = Random(11)
        val noise = "qwyz _-0123456789"
        fun junk() = (0 until r.nextInt(0, 6)).map { noise[r.nextInt(noise.length)] }.joinToString("")
        fun wrap(t: String): String {
            val mixed = t.map { if (r.nextBoolean()) it.uppercaseChar() else it }.joinToString("")
            return junk() + mixed + junk()
        }
        repeat(3000) {
            val maker = guide.makers[r.nextInt(guide.makers.size - 1)]
            val viaManufacturer = r.nextBoolean() && maker.matchManufacturer.isNotEmpty()
            val token = if (viaManufacturer) maker.matchManufacturer.random(Random(r.nextInt())) else maker.matchBrand.random(Random(r.nextInt()))
            val found = if (viaManufacturer) guide.match(wrap(token), junk()) else guide.match(junk(), wrap(token))
            assertEquals(maker.id, found.id)
            assertEquals("other", guide.match(junk(), junk()).id)
        }
    }

    @Test
    fun O4_maker_matching_transsion_brands_never_match_each_other() {
        val transsion = listOf("tecno", "infinix", "itel")
        for (a in transsion) for (b in transsion) {
            val ma = guide.makers.first { it.id == a }
            val mb = guide.makers.first { it.id == b }
            for (t in ma.matchManufacturer + ma.matchBrand) {
                val hit = guide.match(t, t).id
                if (a == b) assertEquals(a, hit) else assertNotEquals(b, hit)
            }
            for (ta in ma.matchBrand) for (tb in mb.matchBrand) if (a != b) assertTrue(ta + " vs " + tb, !ta.contains(tb) && !tb.contains(ta))
        }
    }

    @Test
    fun O4_maker_matching_tokens_are_lower_case_and_exclusive() {
        val seen = HashMap<String, String>()
        for (m in guide.makers) for (t in m.matchManufacturer + m.matchBrand) {
            assertEquals(t, t.lowercase())
            assertTrue(t.isNotBlank())
            for ((o, owner) in seen) if (owner != m.id) assertTrue(t + " overlaps " + o, !o.contains(t) && !t.contains(o))
            seen[t] = m.id
        }
    }

    @Test
    fun O4_maker_matching_all_assets_parse_without_org_json() {
        // MiniJson is pure Kotlin, so the file parses on the JVM; org.json is only a stub there.
        assertTrue(MiniJson.parse("{\"a\":[1,2.5,true,null,\"x\\u0041\\n\"]}") is Map<*, *>)
        for (bad in listOf("", "{", "[1,]x", "{\"a\" 1}", "tru", "\"abc", "{} x")) {
            val ok = try { MiniJson.parse(bad); true } catch (e: IllegalArgumentException) { false }
            assertTrue("accepted: " + bad, !ok)
        }
    }

    @Test
    fun O5_guide_labels_unverified_entries_show_general_steps() {
        for (m in guide.makers) {
            val passes = m.verified.any { it.result == "pass" }
            assertEquals(m.id, if (passes && m.id != OemGuide.OTHER) GuideLabel.VERIFIED else GuideLabel.GENERAL, m.label)
        }
    }

    @Test
    fun O5_guide_labels_only_a_passing_check_removes_the_general_label() {
        fun guideWith(verified: String): OemGuide = OemGuide.parse(
            """{"version":1,"makers":[
              {"id":"tecno","name":"Tecno","match":{"manufacturer":["tecno"],"brand":["tecno"]},
               "steps":[{"title":"t","steps":["Open Outage."]}],"checklist":[{"id":"battery_exemption","text":"x"}],
               "source":"https://example.com","verified":[$verified]},
              {"id":"other","name":"Other","match":{"manufacturer":[],"brand":[]},
               "steps":[{"title":"t","steps":["Open Outage."]}],"checklist":[{"id":"battery_exemption","text":"x"}],
               "source":"https://example.com","verified":[{"device":"d","android":"14","date":"2026-01-01","result":"pass"}]}]}""",
        )
        assertEquals(GuideLabel.GENERAL, guideWith("").match("tecno", null).label)
        assertEquals(GuideLabel.GENERAL, guideWith("""{"device":"d","android":"14","date":"2026-01-01","result":"fail"}""").match("tecno", null).label)
        assertEquals(GuideLabel.GENERAL, guideWith("""{"device":"d","android":"14","date":"2026-01-01","result":"partial"}""").match("tecno", null).label)
        assertEquals(GuideLabel.VERIFIED, guideWith("""{"device":"Spark 10","android":"13","date":"2026-01-01","result":"pass"}""").match("tecno", null).label)
        // The default entry is always general: it is not a phone anybody checked.
        assertEquals(GuideLabel.GENERAL, guideWith("").match("OnePlus", null).label)
    }

    @Test
    fun O5_guide_labels_every_entry_has_steps_checklist_and_source() {
        for (m in guide.makers) {
            assertTrue(m.id, m.stepGroups.isNotEmpty() && m.stepGroups.all { it.title.isNotBlank() && it.steps.isNotEmpty() })
            assertTrue(m.id, m.stepGroups.flatMap { it.steps }.none { Regex("""^\s*\d+[.)]\s""").containsMatchIn(it) })
            assertTrue(m.id, m.stepGroups.flatMap { it.steps }.any { it.contains("Outage") })
            assertTrue(m.id, m.checklist.any { it.id == "battery_exemption" })
            assertEquals(m.id, m.checklist.size, m.checklist.map { it.id }.toSet().size)
            assertTrue(m.id, m.source.startsWith("https://"))
            for (g in m.stepGroups) g.settingsAction?.let { assertTrue(it, Regex("""^android\.settings\.[A-Z_]+$""").matches(it)) }
        }
    }

    @Test
    fun O5_guide_labels_parse_rejects_a_guide_without_other() {
        val ok = try { OemGuide.parse("""{"version":1,"makers":[]}"""); true } catch (e: IllegalArgumentException) { false }
        assertTrue(!ok)
    }
}
