package app.outage.ui

import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import app.outage.R

/** Settings items (R4.1). Each opens the feature registered under its key, or "Coming soon" (R4.2). */
object SettingsItems {
    class Item(val key: String, val titleRes: Int)

    const val ABOUT = "about"

    val all = listOf(
        Item("alarm_settings", R.string.settings_alarm),
        Item("notifications", R.string.settings_notifications),
        Item("sensor", R.string.settings_sensor),
        Item("battery", R.string.settings_battery),
        Item("station", R.string.settings_station),
        Item("home_watch", R.string.settings_home_watch),
        Item("followed_area", R.string.settings_followed_area),
        Item("language", R.string.settings_language),
        Item("diagnostics", R.string.settings_diagnostics),
        Item("judge", R.string.demo_try),
    )

    fun titleFor(key: String): Int? = (all.firstOrNull { it.key == key })?.titleRes
}

@Composable
fun SettingsScreen(
    versionName: String,
    alias: String,
    scroll: ScrollState,
    deleting: Boolean,
    onOpen: (String) -> Unit,
    onDeleteConfirmed: () -> Unit,
) {
    var confirming by rememberSaveable { mutableStateOf(false) }
    Column(Modifier.fillMaxWidth().verticalScroll(scroll)) {
        Text(
            stringResource(R.string.settings_title),
            style = MaterialTheme.typography.headlineMedium,
            modifier = Modifier.padding(16.dp),
        )
        SettingsItems.all.forEach { item -> SettingsRow(stringResource(item.titleRes)) { onOpen(item.key) } }
        SettingsRow(stringResource(R.string.settings_about)) { onOpen(SettingsItems.ABOUT) }
        HorizontalDivider()
        SettingsRow(stringResource(R.string.settings_delete), danger = true) { if (!deleting) confirming = true }
        HorizontalDivider()
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(stringResource(R.string.settings_version, versionName), style = MaterialTheme.typography.bodyMedium)
            Text(
                if (alias.isEmpty()) stringResource(R.string.settings_alias_none) else stringResource(R.string.settings_alias, alias),
                style = MaterialTheme.typography.bodyMedium,
            )
        }
    }
    if (confirming) {
        // R5.1: plain description of what is deleted before anything happens.
        AlertDialog(
            onDismissRequest = { confirming = false },
            title = { Text(stringResource(R.string.delete_title)) },
            text = { Text(stringResource(R.string.delete_body)) },
            confirmButton = {
                TextButton(
                    onClick = { confirming = false; onDeleteConfirmed() },
                    modifier = Modifier.heightIn(min = 48.dp),
                ) { Text(stringResource(R.string.delete_confirm)) }
            },
            dismissButton = {
                TextButton(onClick = { confirming = false }, modifier = Modifier.heightIn(min = 48.dp)) {
                    Text(stringResource(R.string.delete_cancel))
                }
            },
        )
    }
}

@Composable
private fun SettingsRow(label: String, danger: Boolean = false, onClick: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp).clickable(onClick = onClick).padding(horizontal = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            label,
            style = MaterialTheme.typography.bodyLarge,
            color = if (danger) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface,
        )
    }
}
