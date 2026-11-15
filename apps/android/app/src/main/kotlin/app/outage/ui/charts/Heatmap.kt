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
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Weekday (rows, Monday first) by hour (columns) grid. Shade is the share of observed time without power (R8.1).
 * A null share is a slot seen under 3 times: drawn as a faint outline, never as "no outage" (R8.2, IN2).
 * [shares] has 7 * 24 entries, row-major. Tap a slot to select it; [selected] is the row-major index.
 */
@Composable
fun Heatmap(
    shares: List<Double?>,
    dayLabels: List<String>,
    hourLabels: List<Pair<Int, String>>,
    selected: Int?,
    onSelect: (Int?) -> Unit,
    progress: Float,
    lowColor: Color,
    highColor: Color,
    emptyColor: Color,
    textColor: Color,
    summary: String,
    modifier: Modifier = Modifier,
) {
    val measurer = rememberTextMeasurer()
    val label = TextStyle(fontSize = 11.sp, color = textColor)
    Canvas(
        modifier.fillMaxWidth().height(190.dp).semantics { contentDescription = summary }
            .pointerInput(shares) {
                val left = 34.dp.toPx()
                val top = 16.dp.toPx()
                detectTapGestures { p ->
                    val cw = (size.width - left) / 24f
                    val ch = (size.height - top) / 7f
                    val col = ((p.x - left) / cw).toInt()
                    val row = ((p.y - top) / ch).toInt()
                    val idx = row * 24 + col
                    onSelect(if (p.x >= left && p.y >= top && col in 0..23 && row in 0..6 && idx != selected) idx else null)
                }
            },
    ) {
        val left = 34.dp.toPx()
        val top = 16.dp.toPx()
        val cw = (size.width - left) / 24f
        val ch = (size.height - top) / 7f
        if (cw <= 0f || ch <= 0f || shares.size < 168) return@Canvas
        val gap = 1.5.dp.toPx()
        for (r in 0 until 7) {
            val t = measurer.measure(dayLabels.getOrElse(r) { "" }, label)
            drawText(t, textColor, Offset(0f, top + ch * r + (ch - t.size.height) / 2))
            for (c in 0 until 24) {
                val i = r * 24 + c
                val share = shares[i]
                val topLeft = Offset(left + cw * c + gap / 2, top + ch * r + gap / 2)
                val sz = Size(cw - gap, ch - gap)
                val radius = CornerRadius(3.dp.toPx())
                // Staggered reveal: columns appear left to right as progress grows.
                val reveal = ((progress * 1.6f) - c / 24f).coerceIn(0f, 1f)
                if (share == null) {
                    drawRoundRect(emptyColor.copy(alpha = 0.5f * reveal), topLeft, sz, radius, style = Stroke(1.dp.toPx()))
                } else {
                    // Square root lifts small shares so a 10% slot is still visible.
                    val f = kotlin.math.sqrt(share.coerceIn(0.0, 1.0)).toFloat()
                    drawRoundRect(lerp(lowColor, highColor, f).copy(alpha = reveal), topLeft, sz, radius)
                }
                if (i == selected) drawRoundRect(textColor, topLeft, sz, radius, style = Stroke(2.dp.toPx()))
            }
        }
        for ((h, text) in hourLabels) {
            val t = measurer.measure(text, label)
            drawText(t, textColor, Offset(left + cw * h + cw / 2 - t.size.width / 2, 0f))
        }
    }
}
