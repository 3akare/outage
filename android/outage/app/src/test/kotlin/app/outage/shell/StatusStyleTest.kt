package app.outage.shell

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** app-shell R6.2, property AS4. */
class StatusStyleTest {
    @Test
    fun AS4_status_style_complete_every_level_has_role_icon_and_label() {
        for (level in StatusLevel.entries) {
            val style = StatusStyle.of(level)
            assertTrue("label name for " + level, style.labelName.isNotBlank())
            val text = StringPack.parse(Res.values()).getValue(style.labelName)
            assertTrue("label text for " + level, text.isNotBlank())
        }
    }

    @Test
    fun AS4_status_style_complete_labels_are_the_five_copy_names() {
        val strings = StringPack.parse(Res.values())
        val names = StatusLevel.entries.map { strings.getValue(StatusStyle.of(it).labelName) }
        assertEquals(listOf("Normal", "Your spot only", "Possible", "Confirmed", "Restored"), names)
    }

    @Test
    fun AS4_status_style_complete_icons_are_distinct_per_meaning() {
        // Colour is shared (green, amber), so the icon must tell the levels apart (R6.2).
        val icons = StatusLevel.entries.map { StatusStyle.of(it).icon }
        assertEquals(icons.size, icons.toSet().size)
        val labels = StatusLevel.entries.map { StatusStyle.of(it).labelName }
        assertEquals(labels.size, labels.toSet().size)
    }

    @Test
    fun AS4_status_style_complete_icon_drawables_exist() {
        val names = mapOf(
            StatusIcon.CHECK to "ic_status_check", StatusIcon.PERSON_PIN to "ic_status_person_pin",
            StatusIcon.HELP to "ic_status_help", StatusIcon.POWER_OFF to "ic_status_power_off",
            StatusIcon.POWER_ON to "ic_status_power_on",
        )
        for (icon in StatusIcon.entries) {
            assertTrue("drawable for " + icon, Res.file("drawable/" + names.getValue(icon) + ".xml").isFile)
        }
    }
}
