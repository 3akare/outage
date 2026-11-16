package app.outage.ui

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import app.outage.R
import app.outage.freezer.FreezerGuard
import app.outage.freezer.FreezerRules
import app.outage.freezer.FreezerSettings

/** Settings "freezer_guard" (power-log R6.1, R6.5 to R6.7). Every change is saved and the alarm is re-planned at once. */
@Composable
fun FreezerScreen(guard: FreezerGuard, exactAllowed: () -> Boolean) {
    val ctx = LocalContext.current
    var s by remember { mutableStateOf(guard.settings()) }
    var exactOk by remember { mutableStateOf(exactAllowed()) }
    val notificationsOn = remember { ctx.getSystemService(android.app.NotificationManager::class.java)?.areNotificationsEnabled() ?: true }
    fun update(n: FreezerSettings) {
        s = n
        guard.save(n)
    }
    FeaturePage(R.string.freezer_title) {
        PageText(stringResource(R.string.freezer_intro))
        Gap()
        DayCard {
            SwitchRow(R.string.freezer_on, s.on, R.drawable.ic_sym_freezer to Tokens.Colors.tileTeal) { update(s.copy(on = it)) }
            RowDivider(TileInset)
            StepperRow(
                stringResource(R.string.freezer_limit_label), stringResource(R.string.freezer_hours_value, s.limitHours),
                R.string.freezer_limit_less, R.string.freezer_limit_more,
                canLess = s.limitHours > FreezerRules.MIN_HOURS, canMore = s.limitHours < FreezerRules.MAX_HOURS,
                onLess = { update(s.copy(limitHours = s.limitHours - 1)) }, onMore = { update(s.copy(limitHours = s.limitHours + 1)) },
            )
        }
        if (s.on && !notificationsOn) GroupFooter(stringResource(R.string.freezer_notifications_off))
        GroupFooter(stringResource(R.string.freezer_late_note))
        GroupFooter(stringResource(R.string.freezer_reboot_note))

        GroupHeader(stringResource(R.string.freezer_quiet_window, Fmt.hourOfDay(s.quietStartMin / 60), Fmt.hourOfDay(s.quietEndMin / 60)))
        DayCard {
            StepperRow(
                stringResource(R.string.freezer_quiet_start_label), Fmt.hourOfDay(s.quietStartMin / 60),
                R.string.freezer_quiet_start_less, R.string.freezer_quiet_start_more, true, true,
                { update(s.copy(quietStartMin = wrapHour(s.quietStartMin, -1))) }, { update(s.copy(quietStartMin = wrapHour(s.quietStartMin, 1))) },
            )
            RowDivider()
            StepperRow(
                stringResource(R.string.freezer_quiet_end_label), Fmt.hourOfDay(s.quietEndMin / 60),
                R.string.freezer_quiet_end_less, R.string.freezer_quiet_end_more, true, true,
                { update(s.copy(quietEndMin = wrapHour(s.quietEndMin, -1))) }, { update(s.copy(quietEndMin = wrapHour(s.quietEndMin, 1))) },
            )
            RowDivider()
            SwitchRow(R.string.freezer_quiet_sound, s.soundInQuietHours) { update(s.copy(soundInQuietHours = it)) }
        }

        Gap(24.dp)
        DayCard {
            SwitchRow(R.string.freezer_exact, s.exactWanted && exactOk, R.drawable.ic_sym_clock to Tokens.Colors.tileOrange) { want ->
                update(s.copy(exactWanted = want))
                if (want && !exactOk) ctx.startActivity(exactAlarmIntent(ctx))
            }
        }
        GroupFooter(stringResource(R.string.freezer_exact_body))
        if (s.exactWanted && !exactOk) {
            Gap()
            ActionStack {
                InkButton(stringResource(R.string.freezer_exact_allow), { ctx.startActivity(exactAlarmIntent(ctx)); exactOk = exactAllowed() }, Modifier.fillMaxWidth())
            }
        }
    }
}


private fun wrapHour(minutes: Int, delta: Int): Int = (((minutes / 60 + delta) % 24 + 24) % 24) * 60

/** "Alarms & reminders" page. https://developer.android.com/reference/android/provider/Settings#ACTION_REQUEST_SCHEDULE_EXACT_ALARM */
private fun exactAlarmIntent(ctx: android.content.Context): Intent =
    (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + ctx.packageName))
    } else {
        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + ctx.packageName))
    }).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

/** A switch row named by a string resource; the switch is labelled with the same words. */
@Composable
internal fun SwitchRow(labelRes: Int, checked: Boolean, tile: Pair<Int, androidx.compose.ui.graphics.Color>? = null, onChange: (Boolean) -> Unit) {
    SwitchRow(title = stringResource(labelRes), checked = checked, tile = tile, onChange = onChange)
}
