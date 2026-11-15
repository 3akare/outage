package app.outage.ui.charts

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathMeasure
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Trend line over equally spaced points. A null point breaks the line (a week with no data is a gap, R8.5, IN3).
 * The line is drawn in with [progress] 0..1 and has a soft fill under it.
 */
@Composable
fun LineChart(
    values: List<Double?>,
    maxValue: Double,
    yTicks: List<Pair<Double, String>>,
    xLabels: List<Pair<Int, String>>,
    progress: Float,
    lineColor: Color,
    gridColor: Color,
    textColor: Color,
    summary: String,
    modifier: Modifier = Modifier,
) {
    val measurer = rememberTextMeasurer()
    val label = TextStyle(fontSize = 11.sp, color = textColor)
    Canvas(modifier.fillMaxWidth().height(170.dp).semantics { contentDescription = summary }) {
        val left = 34.dp.toPx()
        val top = 8.dp.toPx()
        val bottom = 20.dp.toPx()
        val right = 10.dp.toPx()
        val w = size.width - left - right
        val h = size.height - top - bottom
        if (w <= 0f || h <= 0f || values.size < 2) return@Canvas
        fun x(i: Int) = left + w * i / (values.size - 1)
        fun y(v: Double) = top + h - h * (v / maxValue).toFloat().coerceIn(0f, 1f)
        for ((v, text) in yTicks) {
            drawLine(gridColor, Offset(left, y(v)), Offset(size.width - right, y(v)), 1.dp.toPx())
            drawText(measurer, text, Offset(0f, y(v) - 7.dp.toPx()), label)
        }
        // One path per run of non-null points.
        val runs = ArrayList<List<Int>>()
        var cur = ArrayList<Int>()
        values.forEachIndexed { i, v ->
            if (v == null) { if (cur.isNotEmpty()) runs += cur; cur = ArrayList() } else cur += i
        }
        if (cur.isNotEmpty()) runs += cur
        val total = runs.sumOf { (it.last() - it.first()).coerceAtLeast(0) }.coerceAtLeast(1)
        var drawn = 0f
        for (run in runs) {
            val share = (run.last() - run.first()).toFloat() / total
            val local = if (share <= 0f) (if (progress >= 1f) 1f else 0f) else ((progress - drawn) / share).coerceIn(0f, 1f)
            drawn += share
            if (local <= 0f) continue
            val path = Path()
            run.forEachIndexed { k, i ->
                val px = x(i)
                val py = y(values[i]!!)
                if (k == 0) path.moveTo(px, py) else {
                    // Smooth with a horizontal-tangent cubic between neighbours.
                    val prev = run[k - 1]
                    val mx = (x(prev) + px) / 2
                    path.cubicTo(mx, y(values[prev]!!), mx, py, px, py)
                }
            }
            val measure = PathMeasure().also { it.setPath(path, false) }
            val part = Path()
            measure.getSegment(0f, measure.length * local, part, true)
            if (run.size > 1) {
                val fill = Path().apply {
                    addPath(part)
                    val endX = if (local >= 1f) x(run.last()) else x(run.first()) + (x(run.last()) - x(run.first())) * local
                    lineTo(endX, top + h)
                    lineTo(x(run.first()), top + h)
                    close()
                }
                drawPath(fill, Brush.verticalGradient(listOf(lineColor.copy(alpha = 0.30f), Color.Transparent), top, top + h))
            }
            drawPath(part, lineColor, style = Stroke(3.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round))
            if (local >= 1f) run.forEach { i -> drawCircle(lineColor, 3.5.dp.toPx(), Offset(x(i), y(values[i]!!))) }
        }
        for ((i, text) in xLabels) {
            val t = measurer.measure(text, label)
            drawText(t, textColor, Offset((x(i) - t.size.width / 2).coerceIn(left - 8.dp.toPx(), size.width - t.size.width.toFloat()), size.height - bottom + 4.dp.toPx()))
        }
    }
}
