package app.outage.ui

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.ExperimentalTextApi
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import app.outage.R

// Outage Daylight (ADR 0054, docs/design/daylight.md): calm and light, in the manner of Apple's own apps. A soft grey page,
// white grouped cards with no border and no shadow, ink in three steps, ink pills for the main action, and Inter for every
// word. Colour is kept for the four power states. The same tokens the website's stylesheet is built from
// (core/shared/design/tokens.json), so the phone and the web match.
// Colour roles: https://developer.android.com/develop/ui/compose/designsystems/material3#color-scheme

/**
 * Inter, one variable font file (res/font/inter.ttf, OFL 1.1), at each weight the type scale uses. Variable fonts from
 * resources need API 26, the app's minSdk.
 * https://developer.android.com/develop/ui/compose/text/fonts#variable-fonts
 */
@OptIn(ExperimentalTextApi::class)
private fun inter(weight: Int) = Font(
    R.font.inter,
    weight = FontWeight(weight),
    variationSettings = FontVariation.Settings(FontVariation.weight(weight)),
)

val Inter: FontFamily = FontFamily(inter(400), inter(500), inter(600), inter(650), inter(700))

private fun style(spec: Tokens.TypeSpec, weight: Int = spec.weight) = TextStyle(
    fontFamily = Inter,
    fontWeight = FontWeight(weight),
    fontSize = spec.size.sp,
    lineHeight = spec.line.sp,
    letterSpacing = spec.tracking.em,
)

/** The Daylight type scale by name (docs/design/daylight.md). [Num] styles use tabular figures, so numbers do not jump. */
object DayType {
    val display = style(Tokens.Type.display)
    val largeTitle = style(Tokens.Type.largeTitle)
    val title1 = style(Tokens.Type.title1)
    val title2 = style(Tokens.Type.title2)
    val title3 = style(Tokens.Type.title3)
    val headline = style(Tokens.Type.headline)
    val body = style(Tokens.Type.body)
    val callout = style(Tokens.Type.callout)
    val subhead = style(Tokens.Type.subhead)
    val subheadStrong = style(Tokens.Type.subhead, 600)
    val footnote = style(Tokens.Type.footnote)
    val caption = style(Tokens.Type.caption)

    val displayNum = display.copy(fontFeatureSettings = "tnum")
    val title1Num = title1.copy(fontFeatureSettings = "tnum")
    val title2Num = title2.copy(fontFeatureSettings = "tnum")
}

/** The Daylight neutrals by role, so screens never reach for raw tokens. */
object Day {
    val page = Tokens.Colors.paper2
    val card = Tokens.Colors.paper
    val fill = Tokens.Colors.paper3
    val ink = Tokens.Colors.ink
    val ink2 = Tokens.Colors.ink2
    val muted = Tokens.Colors.muted
    val rule = Tokens.Colors.rule
    val rule2 = Tokens.Colors.rule2
    val link = Tokens.Colors.link
    val focus = Tokens.Colors.focus
    val onInk = Tokens.Colors.accentInk
}

private val LightColors: ColorScheme = lightColorScheme(
    primary = Tokens.Colors.ink,
    onPrimary = Tokens.Colors.accentInk,
    primaryContainer = Tokens.Colors.paper3,
    onPrimaryContainer = Tokens.Colors.ink,
    inversePrimary = Tokens.Colors.paper3,
    secondary = Tokens.Colors.ink2,
    onSecondary = Tokens.Colors.paper,
    secondaryContainer = Tokens.Colors.paper3,
    onSecondaryContainer = Tokens.Colors.ink,
    tertiary = Tokens.Colors.link,
    onTertiary = Tokens.Colors.paper,
    tertiaryContainer = Tokens.Colors.restoredContainer,
    onTertiaryContainer = Tokens.Colors.onRestoredContainer,
    error = Tokens.Colors.confirmed,
    onError = Tokens.Colors.onConfirmed,
    errorContainer = Tokens.Colors.confirmedContainer,
    onErrorContainer = Tokens.Colors.onConfirmedContainer,
    background = Tokens.Colors.paper2,
    onBackground = Tokens.Colors.ink,
    surface = Tokens.Colors.paper,
    onSurface = Tokens.Colors.ink,
    surfaceVariant = Tokens.Colors.paper3,
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
    surfaceContainerHigh = Tokens.Colors.paper,
    surfaceContainerHighest = Tokens.Colors.paper3,
)

/** One power state's colour family: the strong colour, and the container with its text colour. */
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
        ground = Tokens.Colors.paper, edge = Tokens.Colors.paper, spot = Tokens.Colors.link, backdrop = Tokens.Colors.rule2,
    ),
)

val LocalStatusColors = staticCompositionLocalOf { LightStatus }

/** Small controls 10 dp, buttons and inputs 14 dp, cards 20 dp, sheets 28 dp. */
private val DayShapes = Shapes(
    extraSmall = RoundedCornerShape(Tokens.cornerS),
    small = RoundedCornerShape(Tokens.cornerS),
    medium = RoundedCornerShape(Tokens.cornerM),
    large = RoundedCornerShape(Tokens.cornerL),
    extraLarge = RoundedCornerShape(Tokens.cornerXl),
)

/** The Material slots, filled from the Daylight scale so any Material component that falls back on them still matches. */
private val DayTypography = Typography(
    displayLarge = DayType.display,
    displayMedium = DayType.largeTitle,
    displaySmall = DayType.title1,
    headlineLarge = DayType.largeTitle,
    headlineMedium = DayType.title1,
    headlineSmall = DayType.title2,
    titleLarge = DayType.title2,
    titleMedium = DayType.headline,
    titleSmall = DayType.subheadStrong,
    bodyLarge = DayType.body,
    bodyMedium = DayType.subhead,
    bodySmall = DayType.footnote,
    labelLarge = DayType.headline.copy(fontSize = 16.sp),
    labelMedium = DayType.footnote.copy(fontWeight = FontWeight(500)),
    labelSmall = DayType.caption,
)

@Composable
fun OutageTheme(content: @Composable () -> Unit) {
    CompositionLocalProvider(LocalStatusColors provides LightStatus) {
        MaterialTheme(colorScheme = LightColors, shapes = DayShapes, typography = DayTypography, content = content)
    }
}
