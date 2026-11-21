package app.outage.ui

import androidx.compose.foundation.ScrollState
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import app.outage.R

/**
 * Settings items (R4.1), in groups. Each opens the feature registered under its key, or "Coming soon" (R4.2). Each has
 * an iOS-style tile colour, the same mapping as the website (docs/design/daylight.md).
 */
object SettingsItems {
    class Item(val key: String, val titleRes: Int, val icon: Int, val tile: Color)
    class Group(val titleRes: Int, val items: List<Item>)

    const val ABOUT = "about"

    val groups = listOf(
        Group(
            R.string.settings_group_power,
            listOf(
                Item("followed_area", R.string.settings_followed_area, R.drawable.ic_sym_place, Tokens.Colors.tileBlue),
                Item("alarm_settings", R.string.settings_alarm, R.drawable.ic_sym_alarm, Tokens.Colors.tileRed),
            ),
        ),
        Group(
            R.string.settings_group_phone,
            listOf(
                Item("sensor", R.string.settings_sensor, R.drawable.ic_sym_bolt, Tokens.Colors.tileGreen),
                Item("battery", R.string.settings_battery, R.drawable.ic_sym_battery, Tokens.Colors.tileGreen),
                Item("notifications", R.string.settings_notifications, R.drawable.ic_sym_notifications, Tokens.Colors.tileRed),
                Item("self_test", R.string.settings_self_test, R.drawable.ic_sym_check, Tokens.Colors.tileIndigo),
                Item("language", R.string.settings_language, R.drawable.ic_sym_language, Tokens.Colors.tileBlue),
            ),
        ),
        Group(
            R.string.settings_group_about,
            listOf(
                Item("judge", R.string.demo_try, R.drawable.ic_sym_play, Tokens.Colors.tilePink),
                Item(ABOUT, R.string.settings_about, R.drawable.ic_sym_shield, Tokens.Colors.tileGrey),
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
    DayPage(scroll = scroll) {
        DestinationTitle(R.string.settings_title)
        SettingsItems.groups.forEach { group ->
            GroupHeader(stringResource(group.titleRes))
            DayCard {
                group.items.forEachIndexed { i, item ->
                    if (i > 0) RowDivider(TileInset)
                    DayRow(stringResource(item.titleRes), tile = item.icon to item.tile, chevron = true) { onOpen(item.key) }
                }
            }
        }
        Gap(24.dp)
        DayCard {
            DayRow(stringResource(R.string.settings_delete), titleColor = LocalStatusColors.current.confirmed.color) { if (!deleting) confirming = true }
        }
        GroupFooter(stringResource(R.string.settings_delete_footer))
        GroupFooter(stringResource(R.string.settings_version, versionName))
        GroupFooter(if (alias.isEmpty()) stringResource(R.string.settings_alias_none) else stringResource(R.string.settings_alias, alias))
    }
    if (confirming) {
        // R5.1: plain description of what is deleted before anything happens.
        AlertDialog(
            onDismissRequest = { confirming = false },
            containerColor = Day.card,
            title = { Text(stringResource(R.string.delete_title), style = DayType.title3, color = Day.ink) },
            text = { Text(stringResource(R.string.delete_body), style = DayType.subhead, color = Day.ink2) },
            confirmButton = {
                TextAction(stringResource(R.string.delete_confirm), { confirming = false; onDeleteConfirmed() }, color = LocalStatusColors.current.confirmed.color)
            },
            dismissButton = { TextAction(stringResource(R.string.delete_cancel), { confirming = false }) },
        )
    }
}
