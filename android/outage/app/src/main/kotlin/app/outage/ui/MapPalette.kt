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
    val backgroundTop = Tokens.Dark.bg
    val backgroundBottom = Tokens.Dark.bg
    val edge = Tokens.Dark.bg
    val spot = Tokens.Dark.accent
    val label = Tokens.Dark.text
    val labelBackdrop = Color(0xB30F141B)

    /** Same fills as the web map (`.hx` in web/ui/app/design.ts): green is solid, the others sit on the raised surface and carry a pattern. */
    fun fill(state: CellState): Color = when (state) {
        CellState.NORMAL -> Tokens.Dark.normal
        CellState.POSSIBLE, CellState.CONFIRMED, CellState.NO_DATA -> Tokens.Dark.raised2
        CellState.RESTORED -> Tokens.Dark.restored.copy(alpha = 0.35f)
    }

    fun accent(state: CellState): Color = when (state) {
        CellState.NORMAL -> Tokens.Dark.normal
        CellState.POSSIBLE -> Tokens.Dark.possible
        CellState.CONFIRMED -> Tokens.Dark.confirmed
        CellState.RESTORED -> Tokens.Dark.restored
        CellState.NO_DATA -> Tokens.Dark.noData
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
    drawPath(path, MapPalette.edge, style = Stroke(1.6f * px))
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
        CellPattern.OUTLINE -> drawPath(path, accent, style = Stroke(2.5f * px))
        CellPattern.PLAIN, CellPattern.SOLID -> Unit
    }
    if (style.pattern == CellPattern.PLAIN) drawPath(path, accent, style = Stroke(1.5f * px))
}
