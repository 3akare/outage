package app.outage.places

import app.outage.onboarding.MiniJson
import app.outage.onboarding.OnboardingRecord
import app.outage.onboarding.OnboardingStep
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/** ADR 0056: the bundled Lagos places, read from the same fixture the build copies into the app's assets. */
class PlacesTest {
    private val dir = File("../../../core/shared/fixtures/places")
    private val places: Places by lazy { Places.parse(File(dir, "lagos-places.json").readText()) }

    @Test fun twentyLgasNumberedAlphabeticallyAnd376Wards() {
        assertEquals(20, places.lgas.size)
        assertEquals(376, places.wards.size)
        assertEquals(places.lgas.map { it.name }.sorted(), places.lgas.map { it.name })
        assertEquals((1..20).map { "%02d".format(it) }, places.lgas.map { it.nipost })
        assertEquals("Agege", places.lgas.first().name)
        assertEquals("Surulere", places.lgas.last().name)
        assertTrue(places.attribution.contains("GRID3"))
    }

    @Test fun everyWardHasAValidAnchorThatIsALandCell() {
        for (w in places.wards) {
            assertTrue(w.slug, Regex("^88[0-9a-f]{13}$").matches(w.anchor))
            assertTrue(w.slug, places.isLandCell(w.anchor))
            assertNotNull(places.lga(w.lgaSlug))
        }
        assertEquals(35, places.wards.count { it.cells.isEmpty() })
    }

    @Test fun postcodeFormsAllDecodeToTheLga() {
        for (text in listOf("LA 11 A12 GN 01", "la11a12gn01", "LA-11-A12-GN-01", "  La 11 ", "LA11", "LA 11 A1", "la.11")) {
            assertEquals(text, "Ikeja", places.lgaForPostcode(text)?.name)
        }
        assertEquals("Agege", places.lgaForPostcode("LA 01 B22 XY 09")?.name)
        assertEquals("Surulere", places.lgaForPostcode("LA20")?.name)
        assertEquals(Postcode.Result.Lagos("11", complete = true), Postcode.parse("LA 11 A12 GN 01"))
        assertEquals(Postcode.Result.Lagos("11", complete = false), Postcode.parse("LA 11"))
    }

    @Test fun postcodeEdgeCases() {
        assertEquals(Postcode.Result.Empty, Postcode.parse(" - "))
        assertEquals(Postcode.Result.Partial, Postcode.parse("L"))
        assertEquals(Postcode.Result.Partial, Postcode.parse("la"))
        assertEquals(Postcode.Result.Partial, Postcode.parse("LA 1"))
        assertEquals(Postcode.Result.NotLagos, Postcode.parse("FC 01 A12 GN 01"))
        assertEquals(Postcode.Result.NotLagos, Postcode.parse("KN"))
        assertEquals(Postcode.Result.Invalid, Postcode.parse("100001"))
        assertEquals(Postcode.Result.Invalid, Postcode.parse("LA 21"))
        assertEquals(Postcode.Result.Invalid, Postcode.parse("LA 00"))
        assertEquals(Postcode.Result.Invalid, Postcode.parse("LA 11 A12 G1 01"))
        assertEquals(Postcode.Result.Invalid, Postcode.parse("LA 11 A12 GN 01 9"))
        assertEquals(Postcode.Result.Invalid, Postcode.parse("LA@11"))
        assertNull(places.lgaForPostcode("FC 01"))
    }

    @Test fun onlyThePrefixMayBeKept() {
        assertEquals("LA11", Postcode.prefix("LA 11 A12 GN 01"))
        assertNull(Postcode.prefix("FC 01 A12 GN 01"))
    }

    @Test fun lgaSearchIsAccentAndPunctuationBlindWithPrefixesFirst() {
        assertEquals(20, places.searchLgas("").size)
        assertEquals(listOf("Eti-Osa"), places.searchLgas("eti osa").map { it.name })
        assertEquals("Ifako-Ijaiye", places.searchLgas("ifako ijaiye").first().name)
        val lagos = places.searchLgas("lagos").map { it.name }
        assertEquals(listOf("Lagos Island", "Lagos Mainland"), lagos)
        // "Island" is a word start inside a name, so it is found after names that start with the query
        assertEquals("Lagos Island", places.searchLgas("island").first().name)
        assertTrue(places.searchLgas("zzz").isEmpty())
        assertEquals("Amuwo-Odofin", places.searchLgas("AMUWO-odofin").first().name)
    }

    @Test fun wardSearchFindsAltNamesAndKeepsItsLga() {
        val ikeja = places.searchWards("opebi", "ikeja")
        assertEquals("Opebi", ikeja.first().ward.name)
        assertNull(ikeja.first().alias)
        // Onigbongbo lists Opebi as an alternative name, so it is found too, with the alias shown
        val alt = ikeja.first { it.ward.name == "Onigbongbo" }
        assertEquals("Opebi", alt.alias)
        assertTrue(places.searchWards("opebi", "surulere").isEmpty())
        assertEquals(18, places.searchWards("", "ikeja").size)
        assertEquals(places.searchWards("", "ikeja").map { it.ward.name }.sorted(), places.searchWards("", "ikeja").map { it.ward.name })
        // accents and case ignored
        assertEquals("Opebi", places.searchWards("ÓPÈBÍ").first().ward.name)
        // prefix matches come before matches in the middle
        val hits = places.searchWards("oke", null)
        val firstMiddle = hits.indexOfFirst { h -> !Search.fold(h.alias ?: h.ward.name).split(' ').any { it.startsWith("oke") } }
        val lastPrefix = hits.indexOfLast { h -> h.alias == null && Search.fold(h.ward.name).startsWith("oke") }
        assertTrue(lastPrefix >= 0)
        assertTrue(firstMiddle == -1 || lastPrefix < firstMiddle)
    }

    @Test fun anchorRulesAndPicks() {
        val opebi = places.ward("ikeja-opebi")!!
        assertTrue(opebi.needsMap)
        assertEquals(opebi.anchor, places.anchorFor(opebi))
        assertEquals(PlacePick(opebi.anchor, "Opebi, Ikeja"), places.pick(opebi))
        val other = opebi.cells.first { it != opebi.anchor }
        assertEquals(other, places.pick(opebi, other).cell)
        // a cell outside the ward falls back to the anchor
        assertEquals(opebi.anchor, places.pick(opebi, "8858826401fffff").cell)

        val single = places.wards.first { it.cells.size == 1 }
        assertFalse(single.needsMap)
        assertEquals(single.cells.single(), places.pick(single).cell)

        val none = places.wards.first { it.cells.isEmpty() }
        assertFalse(none.needsMap)
        assertTrue(places.isLandCell(places.pick(none).cell))
        assertTrue(places.pick(none).areaName.startsWith(none.name + ", "))
    }

    @Test fun upgradeRewritesLagosCellsAndLeavesOthers() {
        val opebi = places.ward("ikeja-opebi")!!
        val old = OnboardingRecord(step = OnboardingStep.FINISH, consentVersion = 1, consentAtMs = 1, cell = opebi.anchor, areaName = "Ikeja", completed = true)
        assertEquals("Opebi, Ikeja", SpotUpgrade.rewrite(old, places)!!.areaName)
        assertNull(SpotUpgrade.rewrite(old.copy(areaName = "Opebi, Ikeja"), places))
        val abroad = old.copy(cell = "88754e64dffffff", areaName = "Yaba")
        assertNull(SpotUpgrade.rewrite(abroad, places))
        assertTrue(SpotUpgrade.needsRepick(abroad, places))
        assertFalse(SpotUpgrade.needsRepick(old, places))
        assertFalse(SpotUpgrade.needsRepick(old.copy(cell = null), places))
    }

    @Test fun geoHasARingForEveryLandCellAndOutlinesForEveryPlace() {
        val geo = PlacesGeo.parse(File(dir, "lagos-geo.json").readText())
        assertEquals(4968, geo.cells.size)
        for (w in places.wards) for (c in w.cells) assertEquals(6, geo.ring(c)?.size)
        assertEquals(places.lgas.map { it.slug }.toSet(), geo.lgaOutlines.keys)
        assertEquals(places.wards.map { it.slug }.toSet(), geo.wardOutlines.keys)
        val c = geo.centre(places.ward("ikeja-opebi")!!.anchor)!!
        assertTrue(c.lat in 6.3..6.8 && c.lng in 2.7..4.4)
    }

    @Test fun everyLgaHasAnOutlineAndTheOpeningViewHoldsAllTwenty() {
        val geo = PlacesGeo.parse(File(dir, "lagos-geo.json").readText())
        assertEquals(20, places.lgas.size)
        val corners = geo.lagosCorners()
        assertEquals(4, corners.size)
        val south = corners.minOf { it.lat }; val north = corners.maxOf { it.lat }
        val west = corners.minOf { it.lng }; val east = corners.maxOf { it.lng }
        for (lga in places.lgas) {
            val rings = geo.lgaOutlines[lga.slug].orEmpty()
            assertTrue("${lga.name} has no outline", rings.isNotEmpty())
            for (p in rings.flatten()) assertTrue("${lga.name} outside the opening view", p.lat in south..north && p.lng in west..east)
        }
        val epe = geo.lgaOutlines.getValue("epe").flatten()
        assertEquals(epe.maxOf { it.lng }, east, 0.0)
        assertTrue(west < 2.8)
    }

    @Test fun theGridLayerHoldsEveryOneOfTheLandHexesOfLagos() {
        val geo = PlacesGeo.parse(File(dir, "lagos-geo.json").readText())
        assertEquals(4968, geo.cells.size)
        assertEquals(4968, places.lgas.sumOf { it.cellCount })
        val root = MiniJson.parse(app.outage.map.HexGeoJson.grid(geo.cells.values)) as Map<*, *>
        val geometry = ((root["features"] as List<*>).single() as Map<*, *>)["geometry"] as Map<*, *>
        assertEquals("MultiLineString", geometry["type"])
        val lines = geometry["coordinates"] as List<*>
        fun key(a: Any?, b: Any?): String {
            fun pt(p: Any?) = (p as List<*>).let { "${(it[0] as Number).toDouble()},${(it[1] as Number).toDouble()}" }
            val x = pt(a); val y = pt(b)
            return if (x < y) "$x|$y" else "$y|$x"
        }
        val drawn = lines.map { l -> (l as List<*>).let { key(it[0], it[1]) } }.toSet()
        assertEquals(lines.size, drawn.size)
        assertTrue(lines.size < 6 * 4968)
        fun r5(v: Double) = Math.round(v * 1e5) / 1e5
        for ((id, ring) in geo.cells) {
            for (i in ring.indices) {
                val a = ring[i]; val b = ring[(i + 1) % ring.size]
                val x = "${r5(a.lng)},${r5(a.lat)}"; val y = "${r5(b.lng)},${r5(b.lat)}"
                assertTrue("$id edge missing from the grid", (if (x < y) "$x|$y" else "$y|$x") in drawn)
            }
        }
    }
}
