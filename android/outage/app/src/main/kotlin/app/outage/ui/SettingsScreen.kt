package app.outage.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.res.painterResource
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

/** Settings items (R4.1), in groups like the web copy (ADR 0050). Each opens the feature registered under its key, or "Coming soon" (R4.2). */
object SettingsItems {
    class Item(val key: String, val titleRes: Int, val icon: Int)
    class Group(val titleRes: Int, val items: List<Item>)

    const val ABOUT = "about"

    val groups = listOf(
        Group(
            R.string.settings_group_power,
            listOf(
                Item("followed_area", R.string.settings_followed_area, R.drawable.ic_sym_place),
                Item("alarm_settings", R.string.settings_alarm, R.drawable.ic_sym_alarm),
                Item("freezer_guard", R.string.settings_freezer, R.drawable.ic_sym_freezer),
                Item("home_watch", R.string.settings_home_watch, R.drawable.ic_sym_phone),
                Item("station", R.string.settings_station, R.drawable.ic_sym_home),
            ),
        ),
        Group(
            R.string.settings_group_phone,
            listOf(
                Item("sensor", R.string.settings_sensor, R.drawable.ic_sym_bolt),
                Item("battery", R.string.settings_battery, R.drawable.ic_sym_battery),
                Item("notifications", R.string.settings_notifications, R.drawable.ic_sym_notifications),
                Item("self_test", R.string.settings_self_test, R.drawable.ic_sym_check),
                Item("diagnostics", R.string.settings_diagnostics, R.drawable.ic_sym_chart),
                Item("language", R.string.settings_language, R.drawable.ic_sym_language),
            ),
        ),
        Group(
            R.string.settings_group_about,
            listOf(
                Item("judge", R.string.demo_try, R.drawable.ic_sym_play),
                Item(ABOUT, R.string.settings_about, R.drawable.ic_sym_shield),
            ),
        ),
    )

    val all: List<Item> = groups.flatMap { it.items }.filter { it.key != ABOUT }

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
    Column(Modifier.fillMaxWidth().verticalScroll(scroll).padding(bottom = 16.dp)) {
        DestinationTitle(R.string.settings_title)
        SettingsItems.groups.forEach { group ->
            Text(
                stringResource(group.titleRes),
                style = MaterialTheme.typography.titleSmall,
                color = MaterialTheme.colorScheme.primary,
                modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 16.dp, bottom = 8.dp),
            )
            group.items.forEach { item -> SettingsRow(stringResource(item.titleRes), item.icon) { onOpen(item.key) } }
        }
        HorizontalDivider(Modifier.padding(vertical = 8.dp))
        SettingsRow(stringResource(R.string.settings_delete), R.drawable.ic_sym_delete, danger = true) { if (!deleting) confirming = true }
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(stringResource(R.string.settings_version, versionName), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(
                if (alias.isEmpty()) stringResource(R.string.settings_alias_none) else stringResource(R.string.settings_alias, alias),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
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

/** One Material 3 list item: a tonal circle with the icon, the label, and a chevron. A 56 dp target. */
@Composable
private fun SettingsRow(label: String, icon: Int, danger: Boolean = false, onClick: () -> Unit) {
    val scheme = MaterialTheme.colorScheme
    Row(
        modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp).clickable(onClick = onClick).padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Box(
            Modifier.size(40.dp).background(if (danger) scheme.errorContainer else scheme.secondaryContainer, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Image(painterResource(icon), null, Modifier.size(24.dp), colorFilter = ColorFilter.tint(if (danger) scheme.onErrorContainer else scheme.onSecondaryContainer))
        }
        Text(label, style = MaterialTheme.typography.bodyLarge, color = if (danger) scheme.error else scheme.onSurface, modifier = Modifier.weight(1f))
        if (!danger) Image(painterResource(R.drawable.ic_sym_chevron), null, Modifier.size(24.dp), colorFilter = ColorFilter.tint(scheme.onSurfaceVariant))
    }
}
