package app.outage.ui.charts

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/** A progress ring: [fraction] 0..1 of the track, swept in with [progress]. Centre content is the caller's (R8.7). */
@Composable
fun Ring(
    fraction: Float,
    progress: Float,
    startColor: Color,
    endColor: Color,
    trackColor: Color,
    summary: String,
    modifier: Modifier = Modifier,
    diameter: Dp = 120.dp,
    centre: @Composable () -> Unit,
) {
    Box(modifier.size(diameter).semantics { contentDescription = summary }, contentAlignment = Alignment.Center) {
        Canvas(Modifier.size(diameter)) {
            val stroke = 12.dp.toPx()
            val inset = stroke / 2
            val arcSize = Size(size.width - stroke, size.height - stroke)
            drawArc(trackColor, 0f, 360f, false, Offset(inset, inset), arcSize, style = Stroke(stroke))
            val sweep = 360f * fraction.coerceIn(0f, 1f) * progress
            drawArc(
                Brush.sweepGradient(listOf(startColor, endColor, startColor)), -90f, sweep, false,
                Offset(inset, inset), arcSize, style = Stroke(stroke, cap = StrokeCap.Round),
            )
        }
        centre()
    }
}
