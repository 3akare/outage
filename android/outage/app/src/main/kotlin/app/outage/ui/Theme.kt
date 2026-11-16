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

// The Outage night theme (ADR 0051): one dark palette, the same file the website's stylesheet is built from
// (core/shared/design/tokens.json), so the phone and the web look the same. Compose components read it through the colour
// roles. There is no light mode and no dynamic colour: the globe and the four power states must look the same everywhere.

private val DarkColors: ColorScheme = darkColorScheme(
    primary = Tokens.Colors.primary,
    onPrimary = Tokens.Colors.onPrimary,
    primaryContainer = Tokens.Colors.primaryContainer,
    onPrimaryContainer = Tokens.Colors.onPrimaryContainer,
    inversePrimary = Tokens.Colors.inversePrimary,
    secondary = Tokens.Colors.secondary,
    onSecondary = Tokens.Colors.onSecondary,
    secondaryContainer = Tokens.Colors.secondaryContainer,
    onSecondaryContainer = Tokens.Colors.onSecondaryContainer,
    tertiary = Tokens.Colors.tertiary,
    onTertiary = Tokens.Colors.onTertiary,
    tertiaryContainer = Tokens.Colors.tertiaryContainer,
    onTertiaryContainer = Tokens.Colors.onTertiaryContainer,
    error = Tokens.Colors.error,
    onError = Tokens.Colors.onError,
    errorContainer = Tokens.Colors.errorContainer,
    onErrorContainer = Tokens.Colors.onErrorContainer,
    background = Tokens.Colors.background,
    onBackground = Tokens.Colors.onBackground,
    surface = Tokens.Colors.surface,
    onSurface = Tokens.Colors.onSurface,
    surfaceVariant = Tokens.Colors.surfaceVariant,
    onSurfaceVariant = Tokens.Colors.onSurfaceVariant,
    surfaceTint = Tokens.Colors.primary,
    inverseSurface = Tokens.Colors.inverseSurface,
    inverseOnSurface = Tokens.Colors.inverseOnSurface,
    outline = Tokens.Colors.outline,
    outlineVariant = Tokens.Colors.outlineVariant,
    scrim = Tokens.Colors.scrim,
    surfaceBright = Tokens.Colors.surfaceBright,
    surfaceDim = Tokens.Colors.surfaceDim,
    surfaceContainerLowest = Tokens.Colors.surfaceContainerLowest,
    surfaceContainerLow = Tokens.Colors.surfaceContainerLow,
    surfaceContainer = Tokens.Colors.surfaceContainer,
    surfaceContainerHigh = Tokens.Colors.surfaceContainerHigh,
    surfaceContainerHighest = Tokens.Colors.surfaceContainerHighest,
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
        ground = Tokens.Colors.surfaceContainer, edge = Color(0xE6070B1C), label = Tokens.Colors.onSurface,
        labelHalo = Color(0xFF070B1C), spot = Tokens.Colors.restored, backdrop = Tokens.Colors.outlineVariant, space = Tokens.Colors.space,
    ),
)

val LocalStatusColors = staticCompositionLocalOf { DarkStatus }

/** Material 3 corner scale from the tokens. */
private val OutageShapes = Shapes(
    extraSmall = RoundedCornerShape(Tokens.cornerSmall),
    small = RoundedCornerShape(Tokens.cornerSmall),
    medium = RoundedCornerShape(Tokens.cornerMedium),
    large = RoundedCornerShape(Tokens.cornerLarge),
    extraLarge = RoundedCornerShape(Tokens.cornerExtraLarge),
)

@Composable
fun OutageTheme(content: @Composable () -> Unit) {
    CompositionLocalProvider(LocalStatusColors provides DarkStatus) {
        MaterialTheme(colorScheme = DarkColors, shapes = OutageShapes, content = content)
    }
}
