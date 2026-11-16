package app.outage.log

/** Timeline states (power-log design section 3). */
enum class LogState { ON, OUT, OFF_CHARGER, UNKNOWN }

/** Why an interval has its state. */
enum class LogSource { SENSOR, ANSWER_YES, ANSWER_NO, AREA, REPORT, NONE }

/**
 * One timeline interval (R1.2). [endMs] null means open until now. [unsure] marks an `OUT` whose end is only a late
 * `REPLUG` or a sensor stop (R2.6). Times are the phone's wall clock and are shown only to this user (R1.3).
 */
data class LogInterval(
    val startMs: Long,
    val endMs: Long?,
    val state: LogState,
    val source: LogSource,
    val unsure: Boolean = false,
)

/**
 * Raw inputs to intervals (R1, R2, R7.2). Pure: no Android types, no clock, so the timeline is the same for any order
 * of delivery and any duplicates (PL1). Intervals never overlap and cover time from the first input to `nowMs`, with
 * `UNKNOWN` where nothing is known (PL2). An unlabeled unplug becomes `OUT` only with area or manual evidence (PL3).
 */
object TimelineBuilder {
    /** R2.6: an `OUT` ended only by a `REPLUG` later than this is marked unsure. */
    const val UNSURE_AFTER_MS = 12 * 3_600_000L

    private enum class Base { ON, OFF, UNKNOWN }
    private data class Segment(val start: Long, val end: Long?, val base: Base, val unplugSeq: Long?, val endType: String?)

    fun build(inputs: List<LogInput>, nowMs: Long): List<LogInterval> {
        val unique = LinkedHashMap<String, LogInput>()
        // Answers and area outages: the latest copy wins, picked by content so arrival order does not matter.
        // A closed area outage beats the open copy of the same outage.
        val order = compareBy<LogInput> { it.key }.thenBy { it.deviceMs }
            .thenBy { if (it is LogInput.AreaOutage && it.endMs != null) 1 else 0 }.thenBy { it.payload() }
        for (i in inputs.sortedWith(order)) {
            unique[i.key] = i
        }
        val all = unique.values
        val events = all.filterIsInstance<LogInput.Event>()
            .filter { it.type != "BATTERY_FULL" && it.deviceMs <= nowMs }
            .sortedWith(compareBy<LogInput.Event> { it.deviceMs }.thenBy { it.seq })
        val answers = all.filterIsInstance<LogInput.Answer>().associateBy { it.refSeq }
        val reports = all.filterIsInstance<LogInput.Report>().map { it.deviceMs }.filter { it <= nowMs }.sorted()
        val backs = all.filterIsInstance<LogInput.Back>().map { it.deviceMs }.filter { it <= nowMs }.sorted()
        val area = all.filterIsInstance<LogInput.AreaOutage>().sortedBy { it.startMs }

        val first = listOfNotNull(events.firstOrNull()?.deviceMs, reports.firstOrNull()).minOrNull() ?: return emptyList()
        val segments = segments(events, first, nowMs)
        val out = ArrayList<LogInterval>()
        for (seg in segments) out += intervalsOf(seg, answers, reports, backs, area, nowMs)
        return merge(out)
    }

    private fun segments(events: List<LogInput.Event>, first: Long, nowMs: Long): List<Segment> {
        val segs = ArrayList<Segment>()
        var start = first
        var base = Base.UNKNOWN
        var seq: Long? = null
        for (e in events) {
            if (e.deviceMs > start) segs += Segment(start, e.deviceMs, base, seq, e.type)
            start = maxOf(start, e.deviceMs)
            base = when (e.type) {
                "ARMED", "REPLUG" -> Base.ON
                "UNPLUG" -> Base.OFF
                else -> Base.UNKNOWN // DISARMED (R2.8)
            }
            seq = if (e.type == "UNPLUG") e.seq else null
        }
        segs += Segment(start, null, base, seq, null)
        return segs.filter { it.end == null || it.end > it.start }.let { s -> if (s.last().start > nowMs) s.dropLast(1) else s }
    }

    private fun intervalsOf(
        seg: Segment,
        answers: Map<Long, LogInput.Answer>,
        reports: List<Long>,
        backs: List<Long>,
        area: List<LogInput.AreaOutage>,
        nowMs: Long,
    ): List<LogInterval> {
        if (seg.base == Base.ON) return listOf(LogInterval(seg.start, seg.end, LogState.ON, LogSource.SENSOR)) // R2.7
        val segEnd = seg.end ?: nowMs
        val answer = seg.unplugSeq?.let { answers[it] }
        val baseState = if (seg.base == Base.OFF) LogState.OFF_CHARGER else LogState.UNKNOWN
        val baseSource = when {
            seg.base != Base.OFF -> LogSource.NONE
            answer?.yes == false -> LogSource.ANSWER_NO
            else -> LogSource.SENSOR
        }
        // Area evidence turns an unanswered OFF_CHARGER into OUT (R2.3); a "No" keeps it (R2.4).
        val areaAllowed = seg.base == Base.OFF && answer == null
        val overlapping = area.filter { it.startMs < segEnd && (it.endMs ?: Long.MAX_VALUE) > seg.start }

        val result = ArrayList<LogInterval>()
        var pos = seg.start
        var firstOut = true
        while (pos < segEnd) {
            // Next OUT start and its evidence.
            var start: Long? = null
            var source = LogSource.NONE
            if (firstOut && pos == seg.start && answer?.yes == true) {
                start = seg.start; source = LogSource.ANSWER_YES // R2.1
            }
            if (start == null && areaAllowed) {
                val a = overlapping.firstOrNull { (it.endMs ?: Long.MAX_VALUE) > pos }
                if (a != null) {
                    start = if (firstOut) seg.start else maxOf(pos, a.startMs); source = LogSource.AREA
                }
            }
            val r = reports.firstOrNull { it >= pos && it < segEnd }
            if (r != null && (start == null || r < start)) {
                start = r; source = LogSource.REPORT // R7.4
            }
            firstOut = false
            if (start == null || start >= segEnd) {
                result += LogInterval(pos, seg.end, baseState, baseSource)
                break
            }
            if (start > pos) result += LogInterval(pos, start, baseState, baseSource)

            // End: earliest of area restore, "Power is back", the segment end (R2.5).
            val areaEnd = if (source == LogSource.AREA || areaAllowed) {
                overlapping.filter { (it.endMs ?: Long.MAX_VALUE) > start }.mapNotNull { it.endMs }.minOrNull()
            } else null
            val back = backs.firstOrNull { it > start }
            val evidenceEnd = listOfNotNull(areaEnd, back).minOrNull()
            if (evidenceEnd != null && evidenceEnd < segEnd) {
                result += LogInterval(start, evidenceEnd, LogState.OUT, source)
                pos = evidenceEnd
                continue
            }
            val open = seg.end == null
            val unsure = !open && (seg.endType != "REPLUG" || seg.end!! - start > UNSURE_AFTER_MS) // R2.6
            result += LogInterval(start, seg.end, LogState.OUT, source, unsure)
            break
        }
        return result
    }

    /** Joins neighbouring non-OUT intervals of the same state and source. Each OUT stays its own interval. */
    private fun merge(list: List<LogInterval>): List<LogInterval> {
        val out = ArrayList<LogInterval>()
        for (i in list) {
            val last = out.lastOrNull()
            if (last != null && last.state != LogState.OUT && last.state == i.state && last.source == i.source && last.endMs == i.startMs) {
                out[out.size - 1] = last.copy(endMs = i.endMs)
            } else {
                out += i
            }
        }
        return out
    }
}
