package app.outage.demo

import java.io.File
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * DM3 (demo-mode design 7): the demo package reads only the replay file. Its sources may import nothing that reaches the
 * network, the Outbox, real-event storage, settings, the sensor or the detection engine, so a demo session cannot write
 * to the Outbox, power log, labels, subscriptions or install record (R5.1 to R5.3).
 */
class DemoArchitectureTest {
    private val dir = File("src/main/kotlin/app/outage/demo")
    private val allowed = listOf("app.outage.demo.", "app.outage.onboarding.MiniJson", "kotlin.")
    private val forbiddenWords = listOf("SharedPreferences", "SQLite", "HttpURLConnection", "openConnection", "Outbox", "EventStore", "Sensor", "FileOutputStream")

    @Test
    fun DM3_no_real_writes_demo_sources_import_only_the_parser_and_their_own_package() {
        val files = dir.listFiles { f -> f.extension == "kt" }.orEmpty()
        assertTrue("demo sources not found at ${dir.absolutePath}", files.isNotEmpty())
        for (f in files) {
            val text = f.readText()
            text.lines().filter { it.startsWith("import ") }.forEach { line ->
                val name = line.removePrefix("import ").trim()
                assertTrue("${f.name} imports $name", allowed.any { name.startsWith(it) })
            }
            val code = text.lines().filterNot { it.trim().startsWith("*") || it.trim().startsWith("/") || it.trim().startsWith("//") }.joinToString("\n")
            forbiddenWords.forEach { w -> assertTrue("${f.name} mentions $w", !code.contains(w)) }
        }
    }
}
