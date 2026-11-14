package app.outage.alarm

import app.outage.shell.Res
import app.outage.shell.StringPack
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** alerts-and-light-alarm R6.6, R10.5, property L12. */
class AlarmStringPackTest {
    private fun realPacks(): Map<String, Map<String, String>> = mapOf(
        "en" to StringPack.parse(Res.values()),
        "pcm" to StringPack.parse(Res.file("values-pcm/strings.xml")),
    )

    @Test
    fun L12_string_pack_real_files_have_every_alarm_key() {
        val problems = StringPackCheck.check(realPacks())
        assertTrue("string pack problems: " + problems, problems.isEmpty())
    }

    @Test
    fun L12_string_pack_every_key_group_is_present_in_english() {
        val en = realPacks().getValue("en")
        for (k in AlarmStringKeys.ALL) assertTrue("missing " + k, k in en)
        assertEquals(AlarmStringKeys.ALL.size, AlarmStringKeys.ALL.toSet().size)
    }

    @Test
    fun L12_string_pack_no_message_exceeds_4_kib() {
        for ((lang, pack) in realPacks()) for ((k, v) in pack) {
            assertTrue(lang + "/" + k, v.toByteArray(Charsets.UTF_8).size <= 4096)
        }
    }

    @Test
    fun L12_string_pack_push_texts_have_no_small_number_and_no_install_id() {
        val en = realPacks().getValue("en")
        for (k in AlarmStringKeys.PUSH) {
            val v = en.getValue(k)
            assertTrue(k, Regex("""\b[0-2]\b""").find(v.replace(Regex("%\\d+\\$[a-z]"), "")) == null)
            assertTrue(k, !v.contains("install", ignoreCase = true))
        }
        for (k in listOf("push_confirmed_body_wide", "push_restored_body_wide")) assertTrue(en.getValue(k).contains("wide area"))
    }

    @Test
    fun L12_string_pack_checker_reports_missing_english_key() {
        val en = AlarmStringKeys.ALL.associateWith { "x" } - "prompt_title"
        val p = StringPackCheck.check(mapOf("en" to en))
        assertEquals(listOf(StringProblem("en", "prompt_title", ProblemKind.MISSING_IN_ENGLISH)), p)
    }

    @Test
    fun L12_string_pack_checker_requires_a_whole_language_once_started() {
        val en = AlarmStringKeys.ALL.associateWith { "x" }
        val partial = mapOf("prompt_title" to "y")
        val p = StringPackCheck.check(mapOf("en" to en, "pcm" to partial))
        assertEquals(AlarmStringKeys.ALL.size - 1, p.count { it.kind == ProblemKind.MISSING_IN_LANGUAGE })
        // A language with none of the keys falls back to English and is fine.
        assertTrue(StringPackCheck.check(mapOf("en" to en, "pcm" to mapOf("offline" to "x"))).any { it.kind == ProblemKind.NOT_IN_ENGLISH })
        assertTrue(StringPackCheck.check(mapOf("en" to en + ("offline" to "x"), "pcm" to mapOf("offline" to "z"))).isEmpty())
    }

    @Test
    fun L12_string_pack_checker_flags_empty_big_and_placeholder_mismatch() {
        val en = AlarmStringKeys.ALL.associateWith { "x" } + ("push_confirmed_title" to "Out in %1\$s")
        val bad = en + ("alarm_ring_body" to " ") + ("prompt_body" to "a".repeat(4097))
        val p = StringPackCheck.check(mapOf("en" to bad))
        assertTrue(p.any { it.key == "alarm_ring_body" && it.kind == ProblemKind.EMPTY })
        assertTrue(p.any { it.key == "prompt_body" && it.kind == ProblemKind.TOO_BIG })
        val tr = StringPackCheck.check(mapOf("en" to en, "pcm" to en + ("push_confirmed_title" to "Out")))
        assertTrue(tr.any { it.key == "push_confirmed_title" && it.kind == ProblemKind.PLACEHOLDER_MISMATCH })
    }

    @Test
    fun L12_string_pack_alarm_package_has_no_literal_user_text() {
        val files = Res.kotlinDir("alarm").walkTopDown().filter { it.isFile && it.extension == "kt" }.toList()
        val findings = files.flatMap { f -> StringPack.literalTextFindings(f.readText()).map { f.name + ": " + it } }
        assertTrue(findings.toString(), findings.isEmpty())
    }
}
