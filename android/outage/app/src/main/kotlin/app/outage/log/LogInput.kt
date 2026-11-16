package app.outage.log

import app.outage.onboarding.MiniJson

/** Kinds of `RAW_INPUT` rows (power-log design section 4). */
enum class RawKind { EVENT, ANSWER, REPORT, AREA_OUTAGE, BACK }

/**
 * One raw input to the timeline. [key] makes a row unique, so the same input stored twice is ignored (design section 9).
 * [deviceMs] is the phone's wall clock and is used only to show times to this user; it is never uploaded (R1.3).
 * No input carries a location.
 */
sealed class LogInput {
    abstract val key: String
    abstract val deviceMs: Long
    abstract val kind: RawKind

    /** A sensor event. [type] is UNPLUG, REPLUG, ARMED, DISARMED or BATTERY_FULL; [seq] is the sensor seq. */
    data class Event(val seq: Long, val type: String, override val deviceMs: Long) : LogInput() {
        override val key get() = "E:$seq"
        override val kind get() = RawKind.EVENT
    }

    /** The user's answer to "did the power go out?" for the UNPLUG with [refSeq]. A later answer replaces an earlier one. */
    data class Answer(val refSeq: Long, val yes: Boolean, override val deviceMs: Long) : LogInput() {
        override val key get() = "A:$refSeq"
        override val kind get() = RawKind.ANSWER
    }

    /** A "Power is out" tap (R7.4). */
    data class Report(override val deviceMs: Long) : LogInput() {
        override val key get() = "R:$deviceMs"
        override val kind get() = RawKind.REPORT
    }

    /** A "Power is back" tap (R7.2). Local only (R7.3). */
    data class Back(override val deviceMs: Long) : LogInput() {
        override val key get() = "B:$deviceMs"
        override val kind get() = RawKind.BACK
    }

    /** A public area outage for the spot's scope (R9). [endMs] null means still open. Times are server epoch ms. */
    data class AreaOutage(val startMs: Long, val endMs: Long?, val level: String) : LogInput() {
        override val key get() = "O:$startMs"
        override val deviceMs get() = startMs
        override val kind get() = RawKind.AREA_OUTAGE
    }

    /** JSON payload for the `payload` column. Numbers and fixed words only. */
    fun payload(): String = when (this) {
        is Event -> "{\"seq\":$seq,\"type\":\"$type\"}"
        is Answer -> "{\"refSeq\":$refSeq,\"yes\":$yes}"
        is Report, is Back -> "{}"
        is AreaOutage -> "{\"startMs\":$startMs,\"endMs\":${endMs ?: "null"},\"level\":\"$level\"}"
    }

    companion object {
        private val TYPES = setOf("UNPLUG", "REPLUG", "ARMED", "DISARMED", "BATTERY_FULL")
        private val LEVELS = setOf("POSSIBLE", "CONFIRMED")

        /** Inverse of [payload]. Returns null for a row this version cannot read, so one bad row never breaks the log. */
        fun decode(kind: String, deviceMs: Long, payload: String): LogInput? = try {
            @Suppress("UNCHECKED_CAST")
            val m = MiniJson.parse(payload) as Map<String, Any?>
            when (RawKind.valueOf(kind)) {
                RawKind.EVENT -> (m["type"] as String).takeIf { it in TYPES }
                    ?.let { Event((m["seq"] as Double).toLong(), it, deviceMs) }
                RawKind.ANSWER -> Answer((m["refSeq"] as Double).toLong(), m["yes"] as Boolean, deviceMs)
                RawKind.REPORT -> Report(deviceMs)
                RawKind.BACK -> Back(deviceMs)
                RawKind.AREA_OUTAGE -> (m["level"] as String).takeIf { it in LEVELS }
                    ?.let { AreaOutage((m["startMs"] as Double).toLong(), (m["endMs"] as Double?)?.toLong(), it) }
            }
        } catch (_: Exception) {
            null
        }
    }
}
