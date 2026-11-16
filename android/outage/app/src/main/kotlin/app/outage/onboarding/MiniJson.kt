package app.outage.onboarding

/**
 * A small strict JSON reader for the OEM guide (onboarding design section 5: hand-written parsing, no new
 * dependency). Pure Kotlin so the same code runs on the phone and in JVM tests (`org.json` is a stub on the JVM).
 * Returns Map, List, String, Double, Boolean or null. Throws [IllegalArgumentException] on bad input.
 */
object MiniJson {
    fun parse(text: String): Any? {
        val p = Parser(text)
        p.ws()
        val v = p.value()
        p.ws()
        require(p.atEnd()) { "trailing text at " + p.pos }
        return v
    }

    private class Parser(val s: String) {
        var pos = 0
        fun atEnd() = pos >= s.length
        fun ws() { while (pos < s.length && s[pos].isWhitespace()) pos++ }
        private fun peek(): Char { require(pos < s.length) { "unexpected end" }; return s[pos] }
        private fun expect(c: Char) { require(peek() == c) { "expected '" + c + "' at " + pos }; pos++ }

        fun value(): Any? {
            return when (val c = peek()) {
                '{' -> obj()
                '[' -> arr()
                '"' -> str()
                't' -> lit("true", true)
                'f' -> lit("false", false)
                'n' -> lit("null", null)
                else -> if (c == '-' || c.isDigit()) num() else throw IllegalArgumentException("bad character at " + pos)
            }
        }

        private fun lit(word: String, v: Any?): Any? {
            require(s.startsWith(word, pos)) { "bad literal at " + pos }
            pos += word.length
            return v
        }

        private fun num(): Double {
            val start = pos
            while (pos < s.length && (s[pos].isDigit() || s[pos] in "+-.eE")) pos++
            return s.substring(start, pos).toDoubleOrNull() ?: throw IllegalArgumentException("bad number at " + start)
        }

        private fun str(): String {
            expect('"')
            val sb = StringBuilder()
            while (true) {
                val c = peek(); pos++
                when (c) {
                    '"' -> return sb.toString()
                    '\\' -> {
                        val e = peek(); pos++
                        when (e) {
                            '"', '\\', '/' -> sb.append(e)
                            'b' -> sb.append('\b')
                            'n' -> sb.append('\n')
                            'r' -> sb.append('\r')
                            't' -> sb.append('\t')
                            'f' -> sb.append('\u000C')
                            'u' -> {
                                require(pos + 4 <= s.length) { "bad escape at " + pos }
                                sb.append(s.substring(pos, pos + 4).toInt(16).toChar())
                                pos += 4
                            }
                            else -> throw IllegalArgumentException("bad escape at " + pos)
                        }
                    }
                    else -> sb.append(c)
                }
            }
        }

        private fun arr(): List<Any?> {
            expect('[')
            val out = ArrayList<Any?>()
            ws()
            if (peek() == ']') { pos++; return out }
            while (true) {
                ws(); out.add(value()); ws()
                if (peek() == ',') { pos++; continue }
                expect(']'); return out
            }
        }

        private fun obj(): Map<String, Any?> {
            expect('{')
            val out = LinkedHashMap<String, Any?>()
            ws()
            if (peek() == '}') { pos++; return out }
            while (true) {
                ws(); val k = str(); ws(); expect(':'); ws()
                out[k] = value(); ws()
                if (peek() == ',') { pos++; continue }
                expect('}'); return out
            }
        }
    }
}
