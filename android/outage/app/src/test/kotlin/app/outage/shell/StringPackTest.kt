package app.outage.shell

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** app-shell R7, property AS7. */
class StringPackTest {
    private val defaults get() = StringPack.parse(Res.values())
    private val pidgin get() = StringPack.parse(Res.file("values-pcm/strings.xml"))

    @Test
    fun AS7_strings_every_pidgin_key_exists_in_english() {
        val missing = pidgin.keys - defaults.keys
        assertTrue("keys only in values-pcm: " + missing, missing.isEmpty())
    }

    @Test
    fun AS7_strings_pidgin_has_a_few_keys_and_restored_message() {
        assertTrue(pidgin.size in 3..20)
        assertEquals("Light don come!", pidgin["status_restored"])
    }

    @Test
    fun AS7_strings_no_empty_values() {
        assertTrue(defaults.values.none { it.isBlank() })
        assertTrue(pidgin.values.none { it.isBlank() })
    }

    @Test
    fun AS7_strings_ui_kotlin_has_no_literal_user_text() {
        val ui = Res.kotlinDir("ui")
        val files = ui.walkTopDown().filter { it.isFile && it.extension == "kt" }.toList()
        assertTrue("ui files found", files.isNotEmpty())
        val findings = files.flatMap { f -> StringPack.literalTextFindings(f.readText()).map { f.name + ": " + it } }
        assertTrue("literal user text in ui: " + findings, findings.isEmpty())
    }

    @Test
    fun AS7_strings_checker_detects_literal_text() {
        assertTrue(StringPack.literalTextFindings("Text(\"Hello\")").isNotEmpty())
        assertTrue(StringPack.literalTextFindings("Text(text = \"Hello\")").isNotEmpty())
        assertTrue(StringPack.literalTextFindings("Image(contentDescription = \"x\")").isNotEmpty())
        assertTrue(StringPack.literalTextFindings("Text(stringResource(R.string.x))").isEmpty())
        assertTrue(StringPack.literalTextFindings("Image(contentDescription = null)").isEmpty())
    }

    @Test
    fun AS7_strings_every_string_resource_used_in_kotlin_exists() {
        val used = Res.kotlinDir("").walkTopDown().filter { it.isFile && it.extension == "kt" }
            .flatMap { Regex("R\\.string\\.([a-z0-9_]+)").findAll(it.readText()).map { m -> m.groupValues[1] } }.toSet()
        val missing = used - defaults.keys
        assertTrue("used but not defined: " + missing, missing.isEmpty())
        assertTrue(used.isNotEmpty())
    }

    @Test
    fun AS7_strings_copy_rules_state_names_and_simulated_label() {
        assertEquals("Outage", defaults["app_name"])
        assertEquals("Simulated", defaults["simulated"])
        assertEquals("Coming soon", defaults["coming_soon"])
        assertEquals("Offline", defaults["offline"])
    }
}
