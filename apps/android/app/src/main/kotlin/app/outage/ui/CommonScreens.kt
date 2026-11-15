package app.outage.ui

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import app.outage.R

/** Header with a back arrow for screens pushed above a destination. The arrow is a 48 dp target (R6.4). */
@Composable
fun SubScreenHeader(titleRes: Int, onBack: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp).clickable(onClick = onBack).padding(horizontal = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Image(
            painter = painterResource(R.drawable.ic_back),
            contentDescription = stringResource(R.string.back),
            modifier = Modifier.size(24.dp),
            colorFilter = ColorFilter.tint(MaterialTheme.colorScheme.onSurface),
        )
        Text(stringResource(titleRes), style = MaterialTheme.typography.titleLarge)
    }
}

/** Shown for any slot whose feature is not built yet (R3.2). Never crashes. */
@Composable
fun ComingSoonScreen(titleRes: Int, onBack: (() -> Unit)?) {
    Column(Modifier.fillMaxSize()) {
        if (onBack != null) SubScreenHeader(titleRes, onBack)
        Column(
            modifier = Modifier.fillMaxSize().padding(24.dp).verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.Center,
        ) {
            if (onBack == null) Text(stringResource(titleRes), style = MaterialTheme.typography.titleLarge)
            Text(stringResource(R.string.coming_soon), style = MaterialTheme.typography.headlineSmall)
            Text(stringResource(R.string.coming_soon_body), style = MaterialTheme.typography.bodyLarge)
        }
    }
}

@Composable
fun AboutScreen(onBack: () -> Unit) {
    Column(Modifier.fillMaxSize()) {
        SubScreenHeader(R.string.settings_about, onBack)
        Column(
            modifier = Modifier.fillMaxSize().padding(16.dp).verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(stringResource(R.string.about_what), style = MaterialTheme.typography.bodyLarge)
            Text(stringResource(R.string.privacy_cell), style = MaterialTheme.typography.bodyLarge)
            Text(stringResource(R.string.privacy_anonymous), style = MaterialTheme.typography.bodyLarge)
            Text(stringResource(R.string.privacy_sensors), style = MaterialTheme.typography.bodyLarge)
            Text(stringResource(R.string.privacy_delete), style = MaterialTheme.typography.bodyLarge)
        }
    }
}

/**
 * First run: one screen, one button (ADR 0026). The button records consent and asks for notifications where the phone
 * requires it. Nothing else blocks the first look: area, battery and Home Watch wait as cards on Home and in Settings.
 */
@Composable
fun FirstRunScreen(onOk: () -> Unit) {
    // https://developer.android.com/training/permissions/requesting (POST_NOTIFICATIONS is a runtime permission from API 33)
    val ask = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { onOk() }
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp).verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterVertically),
    ) {
        Text(stringResource(R.string.first_run_title), style = MaterialTheme.typography.headlineMedium)
        Text(stringResource(R.string.first_run_body), style = MaterialTheme.typography.bodyLarge)
        Text(stringResource(R.string.first_run_privacy), style = MaterialTheme.typography.bodyMedium)
        Button(
            onClick = { if (Build.VERSION.SDK_INT >= 33) ask.launch(Manifest.permission.POST_NOTIFICATIONS) else onOk() },
            modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp),
        ) { Text(stringResource(R.string.first_run_ok)) }
    }
}
