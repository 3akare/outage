package app.outage.ui

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import app.outage.map.CellPattern
import app.outage.map.CellState
import app.outage.map.CellStyle

/**
 * Fixed dark palette for the map, so it looks the same in light and dark mode. Hues follow `StatusStyle`
 * (green is power on, amber is possible, red is out). Colour never works alone: each state also has a pattern (R6.2).
 */
object MapPalette {
    val backgroundTop = Color(0xFF10202C)
    val backgroundBottom = Color(0xFF070F16)
    val edge = Color(0xFF0A141C)
    val spot = Color(0xFFFFFFFF)
    val label = Color(0xFFEAF2F8)
    val labelBackdrop = Color(0xB3071017)

    fun fill(state: CellState): Color = when (state) {
        CellState.NORMAL -> Color(0xFF1F7A52)
        CellState.POSSIBLE -> Color(0xFF8A5E12)
        CellState.CONFIRMED -> Color(0xFFD9363E)
        CellState.RESTORED -> Color(0xFF168F86)
        CellState.NO_DATA -> Color(0xFF14222D)
    }

    fun accent(state: CellState): Color = when (state) {
        CellState.NORMAL -> Color(0xFF5FD39A)
        CellState.POSSIBLE -> Color(0xFFF8BC4C)
        CellState.CONFIRMED -> Color(0xFFFF7A80)
        CellState.RESTORED -> Color(0xFF63E0D3)
        CellState.NO_DATA -> Color(0xFF53697A)
    }
}

/**
 * Paints one cell in whatever space the caller is in. [px] is the size of one screen pixel in that space, so line widths
 * and pattern spacing stay the same on screen at any zoom. The box is the cell's bounds in the same space.
 */
fun DrawScope.paintCell(state: CellState, path: Path, left: Float, top: Float, right: Float, bottom: Float, px: Float, detail: Boolean = true) {
    val style = CellStyle.of(state)
    val fill = MapPalette.fill(state)
    val accent = MapPalette.accent(state)
    drawPath(path, fill)
    if (detail) when (style.pattern) {
        CellPattern.HATCH -> clipPath(path) {
            val step = 7f * px
            val h = bottom - top
            var x = left - h
            while (x < right) {
                drawLine(accent.copy(alpha = 0.85f), Offset(x, bottom), Offset(x + h, top), 2f * px)
                x += step
            }
        }
        CellPattern.DOTS -> clipPath(path) {
            val step = 8f * px
            var y = top + step / 2
            var row = 0
            while (y < bottom) {
                var x = left + (if (row % 2 == 0) step / 2 else step)
                while (x < right) {
                    drawCircle(accent.copy(alpha = 0.9f), 1.8f * px, Offset(x, y))
                    x += step
                }
                y += step * 0.8f
                row++
            }
        }
        CellPattern.OUTLINE -> drawPath(path, accent.copy(alpha = 0.7f), style = Stroke(1.2f * px))
        CellPattern.PLAIN, CellPattern.SOLID -> Unit
    }
    drawPath(path, MapPalette.edge, style = Stroke(1.6f * px))
}
