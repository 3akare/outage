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
// primary = green, tertiary = amber, error = red. Each status also has an icon and a label (R6.2).
private val LightColors: ColorScheme = lightColorScheme(
    primary = Color(0xFF1B6B3A),
    onPrimary = Color(0xFFFFFFFF),
    primaryContainer = Color(0xFFB7F2C6),
    onPrimaryContainer = Color(0xFF00210E),
    tertiary = Color(0xFF7A5100),
    onTertiary = Color(0xFFFFFFFF),
    tertiaryContainer = Color(0xFFFFDEA6),
    onTertiaryContainer = Color(0xFF281800),
    error = Color(0xFFBA1A1A),
    onError = Color(0xFFFFFFFF),
    errorContainer = Color(0xFFFFDAD6),
    onErrorContainer = Color(0xFF410002),
)

private val DarkColors: ColorScheme = darkColorScheme(
    primary = Color(0xFF9CD6AC),
    onPrimary = Color(0xFF003918),
    primaryContainer = Color(0xFF00522A),
    onPrimaryContainer = Color(0xFFB7F2C6),
    tertiary = Color(0xFFF8BC4C),
    onTertiary = Color(0xFF422C00),
    tertiaryContainer = Color(0xFF5E4000),
    onTertiaryContainer = Color(0xFFFFDEA6),
    error = Color(0xFFFFB4AB),
    onError = Color(0xFF690005),
    errorContainer = Color(0xFF93000A),
    onErrorContainer = Color(0xFFFFDAD6),
)

@Composable
fun OutageTheme(darkTheme: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = if (darkTheme) DarkColors else LightColors, content = content)
}
