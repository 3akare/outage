package app.outage.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

// Material 3 colour schemes. https://developer.android.com/develop/ui/compose/designsystems/material3
// Dynamic colour is off so the status colours stay recognisable (app-shell design section 7).
// Colours come from Tokens (ADR 0028). primary = green, tertiary = amber, error = red. Each status also has an icon and a label (R6.2).
private val LightColors: ColorScheme = lightColorScheme(
    primary = Tokens.Light.primary,
    onPrimary = Tokens.Light.onPrimary,
    primaryContainer = Color(0xFFB7F2C6),
    onPrimaryContainer = Color(0xFF00210E),
    secondaryContainer = Tokens.Light.raised2,
    onSecondaryContainer = Tokens.Light.text,
    tertiary = Tokens.Light.possible,
    onTertiary = Color(0xFFFFFFFF),
    tertiaryContainer = Color(0xFFFFDEA6),
    onTertiaryContainer = Color(0xFF281800),
    error = Tokens.Light.confirmed,
    onError = Color(0xFFFFFFFF),
    errorContainer = Color(0xFFFFDAD6),
    onErrorContainer = Color(0xFF410002),
    background = Tokens.Light.bg,
    onBackground = Tokens.Light.text,
    surface = Tokens.Light.bg,
    onSurface = Tokens.Light.text,
    surfaceVariant = Tokens.Light.raised2,
    onSurfaceVariant = Tokens.Light.muted,
    surfaceContainer = Tokens.Light.raised,
    surfaceContainerHigh = Tokens.Light.raised2,
    outline = Tokens.Light.muted,
    outlineVariant = Tokens.Light.line,
)

// Dark is the default surface (ADR 0028 section 7): the same four state colours as the web.
private val DarkColors: ColorScheme = darkColorScheme(
    primary = Tokens.Dark.primary,
    onPrimary = Tokens.Dark.onPrimary,
    primaryContainer = Color(0xFF0E3B27),
    onPrimaryContainer = Tokens.Dark.normal,
    secondaryContainer = Tokens.Dark.raised2,
    onSecondaryContainer = Tokens.Dark.text,
    tertiary = Tokens.Dark.possible,
    onTertiary = Color(0xFF3A2900),
    tertiaryContainer = Color(0xFF4A3708),
    onTertiaryContainer = Tokens.Dark.possible,
    error = Tokens.Dark.confirmed,
    onError = Color(0xFF3B0508),
    errorContainer = Color(0xFF5A1A1D),
    onErrorContainer = Color(0xFFFFDAD8),
    background = Tokens.Dark.bg,
    onBackground = Tokens.Dark.text,
    surface = Tokens.Dark.bg,
    onSurface = Tokens.Dark.text,
    surfaceVariant = Tokens.Dark.raised2,
    onSurfaceVariant = Tokens.Dark.muted,
    surfaceContainer = Tokens.Dark.raised,
    surfaceContainerHigh = Tokens.Dark.raised2,
    outline = Tokens.Dark.muted,
    outlineVariant = Tokens.Dark.line,
)

@Composable
fun OutageTheme(darkTheme: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = if (darkTheme) DarkColors else LightColors, content = content)
}
