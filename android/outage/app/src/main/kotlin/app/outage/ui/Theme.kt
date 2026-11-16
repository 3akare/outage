package app.outage.ui

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.material3.Typography
import androidx.compose.ui.text.ExperimentalTextApi
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.em
import app.outage.R

// Theme Midnight, built with Hallmark (ADR 0052): midnight-blue ground, cool white ink, square surfaces, one azure signal,
// Mona Sans. The same file the website's stylesheet is built from (core/shared/design/tokens.json), so the phone and the web
// look the same. No light mode and no dynamic colour: the globe and the four power states must look the same everywhere.

// Theme Midnight's colours on the Material colour roles that Compose components read.
private val DarkColors: ColorScheme = darkColorScheme(
    primary = Tokens.Colors.accent,
    onPrimary = Tokens.Colors.accentInk,
    primaryContainer = Tokens.Colors.paper3,
    onPrimaryContainer = Tokens.Colors.ink,
    inversePrimary = Tokens.Colors.accent2,
    secondary = Tokens.Colors.ink2,
    onSecondary = Tokens.Colors.accentInk,
    secondaryContainer = Tokens.Colors.paper3,
    onSecondaryContainer = Tokens.Colors.ink,
    tertiary = Tokens.Colors.accent2,
    onTertiary = Tokens.Colors.ink,
    tertiaryContainer = Tokens.Colors.paper3,
    onTertiaryContainer = Tokens.Colors.ink2,
    error = Tokens.Colors.confirmed,
    onError = Tokens.Colors.onConfirmed,
    errorContainer = Tokens.Colors.confirmedContainer,
    onErrorContainer = Tokens.Colors.onConfirmedContainer,
    background = Tokens.Colors.paper,
    onBackground = Tokens.Colors.ink,
    surface = Tokens.Colors.paper,
    onSurface = Tokens.Colors.ink,
    surfaceVariant = Tokens.Colors.paper3,
    onSurfaceVariant = Tokens.Colors.muted,
    surfaceTint = Tokens.Colors.paper,
    inverseSurface = Tokens.Colors.ink,
    inverseOnSurface = Tokens.Colors.paper,
    outline = Tokens.Colors.rule2,
    outlineVariant = Tokens.Colors.rule,
    scrim = Tokens.Colors.paper,
    surfaceBright = Tokens.Colors.paper3,
    surfaceDim = Tokens.Colors.paper,
    surfaceContainerLowest = Tokens.Colors.paper,
    surfaceContainerLow = Tokens.Colors.paper2,
    surfaceContainer = Tokens.Colors.paper2,
    surfaceContainerHigh = Tokens.Colors.paper3,
    surfaceContainerHighest = Tokens.Colors.paper3,
)

/** One power state's colour family: the strong colour, and the container with its text colour (Material custom colours). */
@Immutable
data class StateColors(val color: Color, val onColor: Color, val container: Color, val onContainer: Color)

/** The four power states as colour families, plus the globe's fills. Read through [LocalStatusColors]. */
@Immutable
data class StatusColors(
    val normal: StateColors,
    val possible: StateColors,
    val confirmed: StateColors,
    val restored: StateColors,
    val map: MapColors,
)

/** Map and globe fills and lines (the web's --map-* tokens). */
@Immutable
data class MapColors(
    val normal: Color,
    val possible: Color,
    val confirmed: Color,
    val restored: Color,
    val noData: Color,
    val ground: Color,
    val edge: Color,
    val label: Color,
    val labelHalo: Color,
    val spot: Color,
    val backdrop: Color,
    val space: Color,
)

private val DarkStatus = StatusColors(
    normal = StateColors(Tokens.Colors.normal, Tokens.Colors.onNormal, Tokens.Colors.normalContainer, Tokens.Colors.onNormalContainer),
    possible = StateColors(Tokens.Colors.possible, Tokens.Colors.onPossible, Tokens.Colors.possibleContainer, Tokens.Colors.onPossibleContainer),
    confirmed = StateColors(Tokens.Colors.confirmed, Tokens.Colors.onConfirmed, Tokens.Colors.confirmedContainer, Tokens.Colors.onConfirmedContainer),
    restored = StateColors(Tokens.Colors.restored, Tokens.Colors.onRestored, Tokens.Colors.restoredContainer, Tokens.Colors.onRestoredContainer),
    map = MapColors(
        normal = Tokens.Map.normal, possible = Tokens.Map.possible, confirmed = Tokens.Map.confirmed,
        restored = Tokens.Map.restored, noData = Tokens.Map.nodata,
        ground = Tokens.Colors.paper2, edge = Tokens.Colors.paper2, label = Tokens.Colors.ink,
        labelHalo = Tokens.Colors.paper, spot = Tokens.Colors.ink, backdrop = Tokens.Colors.rule2, space = Tokens.Colors.paper,
    ),
)

val LocalStatusColors = staticCompositionLocalOf { DarkStatus }

/** Theme Midnight is square end to end: every surface, control and sheet is cut at radius 0. */
private val Square = RoundedCornerShape(Tokens.cornerNone)
private val OutageShapes = Shapes(extraSmall = Square, small = Square, medium = Square, large = Square, extraLarge = Square)

// Mona Sans (OFL 1.1), one variable family: the expanded light cut for display and headlines, the normal width for reading.
// https://developer.android.com/develop/ui/compose/text/fonts#variable-fonts
@OptIn(ExperimentalTextApi::class)
private fun mona(weight: Int, width: Float) = Font(
    R.font.mona_sans,
    weight = FontWeight(weight),
    variationSettings = FontVariation.Settings(FontVariation.weight(weight), FontVariation.width(width)),
)
private val MonaWide = FontFamily(mona(300, 125f))
private val Mona = FontFamily(mona(400, 100f), mona(500, 100f))

private val OutageType: Typography = Typography().let { d ->
    fun TextStyle.wide() = copy(fontFamily = MonaWide, fontWeight = FontWeight(300), letterSpacing = (-0.015).em)
    fun TextStyle.body() = copy(fontFamily = Mona)
    Typography(
        displayLarge = d.displayLarge.wide(), displayMedium = d.displayMedium.wide(), displaySmall = d.displaySmall.wide(),
        headlineLarge = d.headlineLarge.wide(), headlineMedium = d.headlineMedium.wide(), headlineSmall = d.headlineSmall.wide(),
        titleLarge = d.titleLarge.body(), titleMedium = d.titleMedium.body(), titleSmall = d.titleSmall.body(),
        bodyLarge = d.bodyLarge.body(), bodyMedium = d.bodyMedium.body(), bodySmall = d.bodySmall.body(),
        labelLarge = d.labelLarge.body(), labelMedium = d.labelMedium.body(), labelSmall = d.labelSmall.body(),
    )
}

@Composable
fun OutageTheme(content: @Composable () -> Unit) {
    CompositionLocalProvider(LocalStatusColors provides DarkStatus) {
        MaterialTheme(colorScheme = DarkColors, shapes = OutageShapes, typography = OutageType, content = content)
    }
}
