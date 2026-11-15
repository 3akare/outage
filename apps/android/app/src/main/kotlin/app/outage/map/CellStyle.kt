package app.outage.map

import app.outage.shell.ColorRole

/** How a hex is filled. A pattern per state so colour is never the only signal (R6.2, ADR 0022). */
enum class CellPattern { PLAIN, SOLID, HATCH, DOTS, OUTLINE }

/**
 * Colour role, pattern and string names for one cell state (R1.2, R1.7, R6.2). Roles match `StatusStyle`
 * (green primary, amber tertiary, red error). Pure, so a test checks every state has its own pattern (AM5).
 * `labelName` and `describeName` are names in `values/strings.xml`.
 */
data class CellStyle(val role: ColorRole, val pattern: CellPattern, val labelName: String, val describeName: String) {
    companion object {
        fun of(state: CellState): CellStyle = when (state) {
            CellState.NORMAL -> CellStyle(ColorRole.PRIMARY, CellPattern.PLAIN, "status_normal", "map_desc_normal")
            CellState.POSSIBLE -> CellStyle(ColorRole.TERTIARY, CellPattern.HATCH, "status_possible", "map_desc_possible")
            CellState.CONFIRMED -> CellStyle(ColorRole.ERROR, CellPattern.SOLID, "status_confirmed", "map_desc_confirmed")
            CellState.RESTORED -> CellStyle(ColorRole.PRIMARY, CellPattern.DOTS, "status_restored", "map_desc_restored")
            CellState.NO_DATA -> CellStyle(ColorRole.PRIMARY, CellPattern.OUTLINE, "map_no_data", "map_desc_no_data")
        }
    }
}

/** A label to place: [w] and [h] are its size in pixels, ([x], [y]) its centre on screen. Earlier items win. */
data class LabelBox(val key: String, val x: Double, val y: Double, val w: Double, val h: Double)

/** Area-name label placement (design section 4): keep a label only if it clears every earlier kept label by [gap] pixels. */
object LabelPlacer {
    fun place(boxes: List<LabelBox>, viewW: Double, viewH: Double, gap: Double = 6.0): List<LabelBox> {
        val kept = ArrayList<LabelBox>()
        for (b in boxes) {
            val inView = b.x - b.w / 2 >= 0 && b.x + b.w / 2 <= viewW && b.y - b.h / 2 >= 0 && b.y + b.h / 2 <= viewH
            if (inView && kept.none { overlaps(it, b, gap) }) kept += b
        }
        return kept
    }

    private fun overlaps(a: LabelBox, b: LabelBox, gap: Double): Boolean =
        kotlin.math.abs(a.x - b.x) < (a.w + b.w) / 2 + gap && kotlin.math.abs(a.y - b.y) < (a.h + b.h) / 2 + gap
}
