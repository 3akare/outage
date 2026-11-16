package app.outage.ui

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
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
    Column(
        Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(stringResource(R.string.freezer_title), style = MaterialTheme.typography.headlineSmall)
        Text(stringResource(R.string.freezer_intro), style = MaterialTheme.typography.bodyMedium)
        SwitchRow(R.string.freezer_on, s.on) { update(s.copy(on = it)) }
        if (s.on && !notificationsOn) {
            Text(stringResource(R.string.freezer_notifications_off), color = MaterialTheme.colorScheme.error)
        }
        Stepper(
            stringResource(R.string.freezer_limit, s.limitHours),
            R.string.freezer_limit_less, R.string.freezer_limit_more,
            canLess = s.limitHours > FreezerRules.MIN_HOURS, canMore = s.limitHours < FreezerRules.MAX_HOURS,
            onLess = { update(s.copy(limitHours = s.limitHours - 1)) }, onMore = { update(s.copy(limitHours = s.limitHours + 1)) },
        )
        Text(stringResource(R.string.freezer_late_note), style = MaterialTheme.typography.bodySmall)
        Text(stringResource(R.string.freezer_reboot_note), style = MaterialTheme.typography.bodySmall)

        Text(
            stringResource(R.string.freezer_quiet_window, Fmt.hourOfDay(s.quietStartMin / 60), Fmt.hourOfDay(s.quietEndMin / 60)),
            style = MaterialTheme.typography.bodyLarge,
        )
        Stepper(
            Fmt.hourOfDay(s.quietStartMin / 60),
            R.string.freezer_quiet_start_less, R.string.freezer_quiet_start_more, true, true,
            { update(s.copy(quietStartMin = wrapHour(s.quietStartMin, -1))) }, { update(s.copy(quietStartMin = wrapHour(s.quietStartMin, 1))) },
        )
        Stepper(
            Fmt.hourOfDay(s.quietEndMin / 60),
            R.string.freezer_quiet_end_less, R.string.freezer_quiet_end_more, true, true,
            { update(s.copy(quietEndMin = wrapHour(s.quietEndMin, -1))) }, { update(s.copy(quietEndMin = wrapHour(s.quietEndMin, 1))) },
        )
        SwitchRow(R.string.freezer_quiet_sound, s.soundInQuietHours) { update(s.copy(soundInQuietHours = it)) }

        SwitchRow(R.string.freezer_exact, s.exactWanted && exactOk) { want ->
            update(s.copy(exactWanted = want))
            if (want && !exactOk) ctx.startActivity(exactAlarmIntent(ctx))
        }
        Text(stringResource(R.string.freezer_exact_body), style = MaterialTheme.typography.bodySmall)
        if (s.exactWanted && !exactOk) {
            Button(
                onClick = { ctx.startActivity(exactAlarmIntent(ctx)); exactOk = exactAllowed() },
                modifier = Modifier.heightIn(min = 48.dp),
            ) { Text(stringResource(R.string.freezer_exact_allow)) }
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

@Composable
internal fun SwitchRow(labelRes: Int, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(
        Modifier.fillMaxWidth().heightIn(min = 48.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(stringResource(labelRes), style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
        Switch(checked = checked, onCheckedChange = onChange)
    }
}

@Composable
internal fun Stepper(
    label: String,
    lessDesc: Int,
    moreDesc: Int,
    canLess: Boolean,
    canMore: Boolean,
    onLess: () -> Unit,
    onMore: () -> Unit,
) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(label, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
        StepButton(R.drawable.ic_remove, lessDesc, canLess, onLess)
        StepButton(R.drawable.ic_add, moreDesc, canMore, onMore)
    }
}

@Composable
private fun StepButton(icon: Int, desc: Int, enabled: Boolean, onClick: () -> Unit) {
    Button(onClick = onClick, enabled = enabled, modifier = Modifier.size(48.dp), contentPadding = androidx.compose.foundation.layout.PaddingValues(0.dp)) {
        Image(
            painter = painterResource(icon),
            contentDescription = stringResource(desc),
            modifier = Modifier.size(24.dp),
            colorFilter = ColorFilter.tint(androidx.compose.material3.LocalContentColor.current),
        )
    }
}
