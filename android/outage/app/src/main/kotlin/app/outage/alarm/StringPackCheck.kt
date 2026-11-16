package app.outage.alarm

/** What is wrong with a string pack (alerts-and-light-alarm R6.6, R10.5, test L12). */
enum class ProblemKind { MISSING_IN_ENGLISH, MISSING_IN_LANGUAGE, NOT_IN_ENGLISH, EMPTY, TOO_BIG, PLACEHOLDER_MISMATCH }

data class StringProblem(val language: String, val key: String, val kind: ProblemKind)

/** The string keys the prompt, Light Alarm, test, Alarm check list and push texts need. Names only; the words live in the `strings.xml` files. */
object AlarmStringKeys {
    val PROMPT = listOf("prompt_title", "prompt_body", "prompt_action_yes", "prompt_action_no")
    val ALARM = listOf(
        "alarm_ring_title", "alarm_ring_body", "alarm_ring_stop",
        "alarm_test_title", "alarm_test_label", "alarm_test_body", "alarm_test_start",
        "alarm_reboot_note",
        "alarm_channel_prompt", "alarm_channel_light_alarm", "alarm_channel_alerts", "alarm_channel_alerts_quiet",
    )
    val STATUS_LIST = listOf(
        "alarm_check_title",
        "alarm_check_notifications_ok", "alarm_check_notifications_off",
        "alarm_check_volume_ok", "alarm_check_volume_zero",
        "alarm_check_fullscreen_ok", "alarm_check_fullscreen_off",
        "alarm_check_battery_ok", "alarm_check_battery_off",
        "alarm_check_not_registered",
    )
    val PUSH = listOf(
        "push_confirmed_title", "push_confirmed_body", "push_confirmed_body_wide",
        "push_restored_title", "push_restored_body", "push_restored_body_wide",
    )
    val ALL: List<String> = PROMPT + ALARM + STATUS_LIST + PUSH
}

/** Pure checker over parsed packs (language code to key to text). No Android imports. */
object StringPackCheck {
    const val MAX_BYTES = 4096
    const val ENGLISH = "en"
    private val PLACEHOLDER = Regex("""%\d+\$[a-zA-Z]""")

    /**
     * Rules:
     * - English has every required key.
     * - A language that has any required key has all of them. A language with none falls back to English (app-shell R7.2).
     * - No language has a key English lacks.
     * - No value is blank or over [MAX_BYTES] bytes in UTF-8 (the FCM message limit is 4096 bytes).
     * - Each translation uses the same placeholders as English.
     */
    fun check(packs: Map<String, Map<String, String>>, required: List<String> = AlarmStringKeys.ALL): List<StringProblem> {
        val out = ArrayList<StringProblem>()
        val en = packs[ENGLISH].orEmpty()
        for (k in required) if (k !in en) out += StringProblem(ENGLISH, k, ProblemKind.MISSING_IN_ENGLISH)
        for ((lang, pack) in packs) {
            if (lang != ENGLISH) {
                if (required.any { it in pack }) {
                    for (k in required) if (k !in pack) out += StringProblem(lang, k, ProblemKind.MISSING_IN_LANGUAGE)
                }
                for (k in pack.keys) if (k !in en) out += StringProblem(lang, k, ProblemKind.NOT_IN_ENGLISH)
            }
            for ((k, v) in pack) {
                if (v.isBlank()) out += StringProblem(lang, k, ProblemKind.EMPTY)
                if (v.toByteArray(Charsets.UTF_8).size > MAX_BYTES) out += StringProblem(lang, k, ProblemKind.TOO_BIG)
                val base = en[k]
                if (lang != ENGLISH && base != null && placeholders(base) != placeholders(v)) out += StringProblem(lang, k, ProblemKind.PLACEHOLDER_MISMATCH)
            }
        }
        return out
    }

    private fun placeholders(text: String): List<String> = PLACEHOLDER.findAll(text).map { it.value }.sorted().toList()
}
