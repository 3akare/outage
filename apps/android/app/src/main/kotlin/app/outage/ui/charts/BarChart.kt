package app.outage.ui.charts

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Bars of hours of power per day with an optional dashed promise line (R7.2). A null value is a day without enough data:
 * it is drawn as a faint dashed stub, never as a zero bar (R7.3, IN4). Bars below the promise use [lowColor].
 * Tap a bar to select it. [progress] 0..1 drives the draw-in animation. Text summary is [summary] (R6.5).
 */
@Composable
fun BarChart(
    values: List<Double?>,
    maxValue: Double,
    promise: Double?,
    promiseLabel: String,
    yTicks: List<Pair<Double, String>>,
    xLabels: List<Pair<Int, String>>,
    selected: Int?,
    onSelect: (Int?) -> Unit,
    progress: Float,
    okColor: Color,
    lowColor: Color,
    gridColor: Color,
    textColor: Color,
    summary: String,
    modifier: Modifier = Modifier,
) {
    val measurer = rememberTextMeasurer()
    val label = TextStyle(fontSize = 11.sp, color = textColor)
    Canvas(
        modifier.fillMaxWidth().height(200.dp).semantics { contentDescription = summary }
            .pointerInput(values) {
                val left = 34.dp.toPx()
                val right = 4.dp.toPx()
                detectTapGestures { p ->
                    val w = size.width - left - right
                    val slot = w / values.size.coerceAtLeast(1)
                    val i = ((p.x - left) / slot).toInt()
                    onSelect(if (p.x >= left && i in values.indices && i != selected) i else null)
                }
            },
    ) {
        val left = 34.dp.toPx()
        val top = 8.dp.toPx()
        val bottom = 20.dp.toPx()
        val right = 4.dp.toPx()
        val w = size.width - left - right
        val h = size.height - top - bottom
        if (w <= 0f || h <= 0f || values.isEmpty()) return@Canvas
        fun y(v: Double) = top + h - (h * (v / maxValue).toFloat().coerceIn(0f, 1f))

        for ((v, text) in yTicks) {
            drawLine(gridColor, Offset(left, y(v)), Offset(size.width - right, y(v)), 1.dp.toPx())
            drawText(measurer, text, Offset(0f, y(v) - 7.dp.toPx()), label)
        }
        val slot = w / values.size
        val bw = (slot * 0.68f).coerceAtLeast(2f)
        values.forEachIndexed { i, v ->
            val x = left + slot * i + (slot - bw) / 2
            val dim = if (selected != null && selected != i) 0.45f else 1f
            if (v == null) {
                drawRoundRect(
                    gridColor, Offset(x, y(0.0) - 6.dp.toPx()), Size(bw, 6.dp.toPx()), CornerRadius(2.dp.toPx()),
                    style = Stroke(1.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(4f, 4f))),
                )
            } else {
                val full = h * (v / maxValue).toFloat().coerceIn(0f, 1f)
                val bh = full * progress
                val c = if (promise != null && v < promise) lowColor else okColor
                drawRoundRect(c.copy(alpha = dim), Offset(x, top + h - bh), Size(bw, bh.coerceAtLeast(0f)), CornerRadius(bw / 3))
            }
        }
        if (promise != null) {
            drawLine(
                textColor, Offset(left, y(promise)), Offset(size.width - right, y(promise)), 1.5.dp.toPx(),
                pathEffect = PathEffect.dashPathEffect(floatArrayOf(14f, 9f)),
            )
            val t = measurer.measure(promiseLabel, label)
            drawText(t, textColor, Offset(size.width - right - t.size.width, y(promise) - t.size.height - 1.dp.toPx()))
        }
        for ((i, text) in xLabels) {
            val t = measurer.measure(text, label)
            val cx = left + slot * i + slot / 2
            drawText(t, textColor, Offset((cx - t.size.width / 2).coerceIn(left, size.width - t.size.width.toFloat()), size.height - bottom + 4.dp.toPx()))
        }
    }
}
