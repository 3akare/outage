package app.outage.ui

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

// Outage Light (ADR 0053): a white map app in the manner of Google Maps. White surfaces, grey text in three steps,
// hairline greys, one blue, rounded cards and pill chips, and the system font (Roboto on Android), so nothing is bundled.
// The same colours the website's stylesheet is built from (core/shared/design/tokens.json), so the phone and the web match.
// One light theme: the street map underneath is light, and the four power states must read the same everywhere.
// Colour roles: https://developer.android.com/develop/ui/compose/designsystems/material3#color-scheme

private val LightColors: ColorScheme = lightColorScheme(
    primary = Tokens.Colors.accent,
    onPrimary = Tokens.Colors.accentInk,
    primaryContainer = Tokens.Colors.accent2,
    onPrimaryContainer = Tokens.Colors.accent,
    inversePrimary = Tokens.Colors.accent2,
    secondary = Tokens.Colors.ink2,
    onSecondary = Tokens.Colors.paper,
    secondaryContainer = Tokens.Colors.accent2,
    onSecondaryContainer = Tokens.Colors.ink,
    tertiary = Tokens.Colors.restored,
    onTertiary = Tokens.Colors.onRestored,
    tertiaryContainer = Tokens.Colors.restoredContainer,
    onTertiaryContainer = Tokens.Colors.onRestoredContainer,
    error = Tokens.Colors.confirmed,
    onError = Tokens.Colors.onConfirmed,
    errorContainer = Tokens.Colors.confirmedContainer,
    onErrorContainer = Tokens.Colors.onConfirmedContainer,
    background = Tokens.Colors.paper,
    onBackground = Tokens.Colors.ink,
    surface = Tokens.Colors.paper,
    onSurface = Tokens.Colors.ink,
    surfaceVariant = Tokens.Colors.paper2,
    onSurfaceVariant = Tokens.Colors.muted,
    surfaceTint = Color.Transparent,
    inverseSurface = Tokens.Colors.ink,
    inverseOnSurface = Tokens.Colors.paper,
    outline = Tokens.Colors.rule2,
    outlineVariant = Tokens.Colors.rule,
    scrim = Color.Black,
    surfaceBright = Tokens.Colors.paper,
    surfaceDim = Tokens.Colors.paper3,
    surfaceContainerLowest = Tokens.Colors.paper,
    surfaceContainerLow = Tokens.Colors.paper,
    surfaceContainer = Tokens.Colors.paper,
    surfaceContainerHigh = Tokens.Colors.paper2,
    surfaceContainerHighest = Tokens.Colors.paper3,
)

/** One power state's colour family: the strong colour, and the container with its text colour (Material custom colours). */
@Immutable
data class StateColors(val color: Color, val onColor: Color, val container: Color, val onContainer: Color)

/** The four power states as colour families, plus the map's fills. Read through [LocalStatusColors]. */
@Immutable
data class StatusColors(
    val normal: StateColors,
    val possible: StateColors,
    val confirmed: StateColors,
    val restored: StateColors,
    val map: MapColors,
)

/** Hex fills and lines on the map (the web's --map-* tokens), and the colours of swatches drawn on white. */
@Immutable
data class MapColors(
    val normal: Color,
    val possible: Color,
    val confirmed: Color,
    val restored: Color,
    val noData: Color,
    val ground: Color,
    val edge: Color,
    val spot: Color,
    val backdrop: Color,
)

private val LightStatus = StatusColors(
    normal = StateColors(Tokens.Colors.normal, Tokens.Colors.onNormal, Tokens.Colors.normalContainer, Tokens.Colors.onNormalContainer),
    possible = StateColors(Tokens.Colors.possible, Tokens.Colors.onPossible, Tokens.Colors.possibleContainer, Tokens.Colors.onPossibleContainer),
    confirmed = StateColors(Tokens.Colors.confirmed, Tokens.Colors.onConfirmed, Tokens.Colors.confirmedContainer, Tokens.Colors.onConfirmedContainer),
    restored = StateColors(Tokens.Colors.restored, Tokens.Colors.onRestored, Tokens.Colors.restoredContainer, Tokens.Colors.onRestoredContainer),
    map = MapColors(
        normal = Tokens.Map.normal, possible = Tokens.Map.possible, confirmed = Tokens.Map.confirmed,
        restored = Tokens.Map.restored, noData = Tokens.Map.nodata,
        ground = Tokens.Colors.paper, edge = Tokens.Colors.paper, spot = Tokens.Colors.accent, backdrop = Tokens.Colors.rule2,
    ),
)

val LocalStatusColors = staticCompositionLocalOf { LightStatus }

/** Rounded like a maps app: small controls 8 dp, cards 12 to 16 dp, sheets 28 dp. */
private val OutageShapes = Shapes(
    extraSmall = RoundedCornerShape(Tokens.cornerS / 2),
    small = RoundedCornerShape(Tokens.cornerS),
    medium = RoundedCornerShape(Tokens.cornerM),
    large = RoundedCornerShape(Tokens.cornerL),
    extraLarge = RoundedCornerShape(Tokens.cornerXl),
)

/** The default Material type scale on the system font (Roboto on Android). */
@Composable
fun OutageTheme(content: @Composable () -> Unit) {
    CompositionLocalProvider(LocalStatusColors provides LightStatus) {
        MaterialTheme(colorScheme = LightColors, shapes = OutageShapes, content = content)
    }
}
