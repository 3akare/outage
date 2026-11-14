package app.outage.shell

import java.io.File
import javax.xml.parsers.DocumentBuilderFactory

/** Test helper: where the resources live. Gradle runs unit tests with the module directory (`app`) as working directory. */
internal object Res {
    private val root: File = File("src/main")
    fun file(path: String): File = File(root, "res/" + path)
    fun values(): File = file("values/strings.xml")
    fun kotlinDir(sub: String): File = File(root, "kotlin/app/outage/" + sub)
}

/** Test helper for AS7: reads `strings.xml` from disk and scans Kotlin for literal user text. No Android imports. */
internal object StringPack {
    fun parse(file: File): Map<String, String> {
        require(file.isFile) { "missing " + file.path }
        val doc = DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(file)
        val nodes = doc.getElementsByTagName("string")
        val out = LinkedHashMap<String, String>()
        for (i in 0 until nodes.length) {
            val n = nodes.item(i)
            out[n.attributes.getNamedItem("name").nodeValue] = n.textContent.trim()
        }
        return out
    }

    private val patterns = listOf(
        Regex("""\bText\(\s*(text\s*=\s*)?""""),
        Regex("""\bcontentDescription\s*=\s*""""),
        Regex("""\b(title|text|label)\s*=\s*""""),
    )

    /** Lines that put a string literal where user-facing text goes. */
    fun literalTextFindings(source: String): List<String> =
        source.lines().filter { line -> patterns.any { it.containsMatchIn(line) } }.map { it.trim() }
}
