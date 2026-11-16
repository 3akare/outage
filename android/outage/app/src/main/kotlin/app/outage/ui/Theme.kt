package app.outage.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

// Material 3 theme (ADR 0028, ADR 0048). Every colour comes from Tokens, generated from core/shared/design/tokens.json,
// the same file the website's stylesheet is built from, so the phone and the web look the same.
// https://developer.android.com/develop/ui/compose/designsystems/material3
// Dynamic colour is off on purpose: the four power states must look the same on every phone (app-shell design section 7).

private val LightColors: ColorScheme = lightColorScheme(
    primary = Tokens.Light.primary,
    onPrimary = Tokens.Light.onPrimary,
    primaryContainer = Tokens.Light.primaryContainer,
    onPrimaryContainer = Tokens.Light.onPrimaryContainer,
    inversePrimary = Tokens.Light.inversePrimary,
    secondary = Tokens.Light.secondary,
    onSecondary = Tokens.Light.onSecondary,
    secondaryContainer = Tokens.Light.secondaryContainer,
    onSecondaryContainer = Tokens.Light.onSecondaryContainer,
    tertiary = Tokens.Light.tertiary,
    onTertiary = Tokens.Light.onTertiary,
    tertiaryContainer = Tokens.Light.tertiaryContainer,
    onTertiaryContainer = Tokens.Light.onTertiaryContainer,
    error = Tokens.Light.error,
    onError = Tokens.Light.onError,
    errorContainer = Tokens.Light.errorContainer,
    onErrorContainer = Tokens.Light.onErrorContainer,
    background = Tokens.Light.background,
    onBackground = Tokens.Light.onBackground,
    surface = Tokens.Light.surface,
    onSurface = Tokens.Light.onSurface,
    surfaceVariant = Tokens.Light.surfaceVariant,
    onSurfaceVariant = Tokens.Light.onSurfaceVariant,
    surfaceTint = Tokens.Light.primary,
    inverseSurface = Tokens.Light.inverseSurface,
    inverseOnSurface = Tokens.Light.inverseOnSurface,
    outline = Tokens.Light.outline,
    outlineVariant = Tokens.Light.outlineVariant,
    scrim = Tokens.Light.scrim,
    surfaceBright = Tokens.Light.surfaceBright,
    surfaceDim = Tokens.Light.surfaceDim,
    surfaceContainerLowest = Tokens.Light.surfaceContainerLowest,
    surfaceContainerLow = Tokens.Light.surfaceContainerLow,
    surfaceContainer = Tokens.Light.surfaceContainer,
    surfaceContainerHigh = Tokens.Light.surfaceContainerHigh,
    surfaceContainerHighest = Tokens.Light.surfaceContainerHighest,
)

private val DarkColors: ColorScheme = darkColorScheme(
    primary = Tokens.Dark.primary,
    onPrimary = Tokens.Dark.onPrimary,
    primaryContainer = Tokens.Dark.primaryContainer,
    onPrimaryContainer = Tokens.Dark.onPrimaryContainer,
    inversePrimary = Tokens.Dark.inversePrimary,
    secondary = Tokens.Dark.secondary,
    onSecondary = Tokens.Dark.onSecondary,
    secondaryContainer = Tokens.Dark.secondaryContainer,
    onSecondaryContainer = Tokens.Dark.onSecondaryContainer,
    tertiary = Tokens.Dark.tertiary,
    onTertiary = Tokens.Dark.onTertiary,
    tertiaryContainer = Tokens.Dark.tertiaryContainer,
    onTertiaryContainer = Tokens.Dark.onTertiaryContainer,
    error = Tokens.Dark.error,
    onError = Tokens.Dark.onError,
    errorContainer = Tokens.Dark.errorContainer,
    onErrorContainer = Tokens.Dark.onErrorContainer,
    background = Tokens.Dark.background,
    onBackground = Tokens.Dark.onBackground,
    surface = Tokens.Dark.surface,
    onSurface = Tokens.Dark.onSurface,
    surfaceVariant = Tokens.Dark.surfaceVariant,
    onSurfaceVariant = Tokens.Dark.onSurfaceVariant,
    surfaceTint = Tokens.Dark.primary,
    inverseSurface = Tokens.Dark.inverseSurface,
    inverseOnSurface = Tokens.Dark.inverseOnSurface,
    outline = Tokens.Dark.outline,
    outlineVariant = Tokens.Dark.outlineVariant,
    scrim = Tokens.Dark.scrim,
    surfaceBright = Tokens.Dark.surfaceBright,
    surfaceDim = Tokens.Dark.surfaceDim,
    surfaceContainerLowest = Tokens.Dark.surfaceContainerLowest,
    surfaceContainerLow = Tokens.Dark.surfaceContainerLow,
    surfaceContainer = Tokens.Dark.surfaceContainer,
    surfaceContainerHigh = Tokens.Dark.surfaceContainerHigh,
    surfaceContainerHighest = Tokens.Dark.surfaceContainerHighest,
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

/** Map fills and lines (the web's --md-map-* tokens). The map follows light and dark like the rest of the app. */
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
)

private val LightStatus = StatusColors(
    normal = StateColors(Tokens.Light.normal, Tokens.Light.onNormal, Tokens.Light.normalContainer, Tokens.Light.onNormalContainer),
    possible = StateColors(Tokens.Light.possible, Tokens.Light.onPossible, Tokens.Light.possibleContainer, Tokens.Light.onPossibleContainer),
    confirmed = StateColors(Tokens.Light.confirmed, Tokens.Light.onConfirmed, Tokens.Light.confirmedContainer, Tokens.Light.onConfirmedContainer),
    restored = StateColors(Tokens.Light.restored, Tokens.Light.onRestored, Tokens.Light.restoredContainer, Tokens.Light.onRestoredContainer),
    map = MapColors(
        normal = Tokens.MapLight.normal, possible = Tokens.MapLight.possible, confirmed = Tokens.MapLight.confirmed,
        restored = Tokens.MapLight.restored, noData = Tokens.MapLight.nodata,
        ground = Tokens.Light.surfaceContainer, edge = Tokens.Light.surfaceContainer, label = Tokens.Light.onSurface,
        labelHalo = Tokens.Light.surfaceContainer, spot = Tokens.Light.primary, backdrop = Tokens.Light.outlineVariant,
    ),
)

private val DarkStatus = StatusColors(
    normal = StateColors(Tokens.Dark.normal, Tokens.Dark.onNormal, Tokens.Dark.normalContainer, Tokens.Dark.onNormalContainer),
    possible = StateColors(Tokens.Dark.possible, Tokens.Dark.onPossible, Tokens.Dark.possibleContainer, Tokens.Dark.onPossibleContainer),
    confirmed = StateColors(Tokens.Dark.confirmed, Tokens.Dark.onConfirmed, Tokens.Dark.confirmedContainer, Tokens.Dark.onConfirmedContainer),
    restored = StateColors(Tokens.Dark.restored, Tokens.Dark.onRestored, Tokens.Dark.restoredContainer, Tokens.Dark.onRestoredContainer),
    map = MapColors(
        normal = Tokens.MapDark.normal, possible = Tokens.MapDark.possible, confirmed = Tokens.MapDark.confirmed,
        restored = Tokens.MapDark.restored, noData = Tokens.MapDark.nodata,
        ground = Tokens.Dark.surfaceContainer, edge = Tokens.Dark.surfaceContainer, label = Tokens.Dark.onSurface,
        labelHalo = Tokens.Dark.surfaceContainer, spot = Tokens.Dark.primary, backdrop = Tokens.Dark.outlineVariant,
    ),
)

val LocalStatusColors = staticCompositionLocalOf { LightStatus }

/** Material 3 corner scale from the tokens. */
private val OutageShapes = Shapes(
    extraSmall = RoundedCornerShape(Tokens.cornerExtraSmall),
    small = RoundedCornerShape(Tokens.cornerSmall),
    medium = RoundedCornerShape(Tokens.cornerMedium),
    large = RoundedCornerShape(Tokens.cornerLarge),
    extraLarge = RoundedCornerShape(Tokens.cornerExtraLarge),
)

@Composable
fun OutageTheme(darkTheme: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
    CompositionLocalProvider(LocalStatusColors provides if (darkTheme) DarkStatus else LightStatus) {
        // The default Material 3 type scale, set in Roboto: the same sizes the website uses.
        MaterialTheme(colorScheme = if (darkTheme) DarkColors else LightColors, shapes = OutageShapes, content = content)
    }
}
