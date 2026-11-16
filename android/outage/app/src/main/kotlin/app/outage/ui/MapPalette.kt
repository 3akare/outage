package app.outage.ui

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.compositeOver
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import app.outage.map.CellPattern
import app.outage.map.CellState
import app.outage.map.CellStyle

/**
 * Map colours by state, from the theme ([LocalStatusColors]), so the map follows light and dark mode like the web map
 * (`.hx` in web/ui/app/design.ts). Power on is a calm green; problems are strong. Colour never works alone: each state
 * also has a pattern (R6.2).
 */
object MapPalette {
    fun fill(state: CellState, c: MapColors): Color = when (state) {
        CellState.NORMAL -> c.normal.copy(alpha = 0.62f).compositeOver(c.ground)
        CellState.POSSIBLE -> c.possible.copy(alpha = 0.45f).compositeOver(c.ground)
        CellState.CONFIRMED -> c.confirmed
        CellState.RESTORED -> c.restored.copy(alpha = 0.4f).compositeOver(c.ground)
        CellState.NO_DATA -> c.noData.copy(alpha = 0.55f).compositeOver(c.ground)
    }

    fun accent(state: CellState, c: MapColors): Color = when (state) {
        CellState.NORMAL -> c.normal
        CellState.POSSIBLE -> c.possible
        CellState.CONFIRMED -> c.confirmed
        CellState.RESTORED -> c.restored
        CellState.NO_DATA -> c.noData
    }
}

/**
 * Paints one cell in whatever space the caller is in. [px] is the size of one screen pixel in that space, so line widths
 * and pattern spacing stay the same on screen at any zoom. The box is the cell's bounds in the same space.
 */
fun DrawScope.paintCell(
    state: CellState,
    path: Path,
    left: Float,
    top: Float,
    right: Float,
    bottom: Float,
    px: Float,
    colors: MapColors,
    detail: Boolean = true,
) {
    val style = CellStyle.of(state)
    val accent = MapPalette.accent(state, colors)
    drawPath(path, MapPalette.fill(state, colors))
    if (detail) when (style.pattern) {
        CellPattern.HATCH -> clipPath(path) {
            val step = 8f * px
            val h = bottom - top
            var x = left - h
            while (x < right) {
                drawLine(accent, Offset(x, bottom), Offset(x + h, top), 3f * px)
                x += step
            }
        }
        CellPattern.DOTS -> clipPath(path) {
            val step = 9f * px
            val dot = Color.Black.copy(alpha = 0.32f).compositeOver(accent)
            var y = top + step / 2
            var row = 0
            while (y < bottom) {
                var x = left + (if (row % 2 == 0) step / 2 else step)
                while (x < right) {
                    drawCircle(dot, 2f * px, Offset(x, y))
                    x += step
                }
                y += step * 0.8f
                row++
            }
        }
        CellPattern.OUTLINE -> drawPath(path, accent, style = Stroke(2.5f * px))
        CellPattern.PLAIN, CellPattern.SOLID -> Unit
    }
    // Cells are separated by the ground colour, like blocks on a map. No-data blocks get a dashed rim.
    drawPath(path, colors.edge, style = Stroke(2.2f * px))
    if (style.pattern == CellPattern.PLAIN) {
        drawPath(path, colors.backdrop, style = Stroke(1.4f * px, pathEffect = PathEffect.dashPathEffect(floatArrayOf(5f * px, 4f * px))))
    }
}
