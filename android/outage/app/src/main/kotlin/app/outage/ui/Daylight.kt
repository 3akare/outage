package app.outage.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import app.outage.R

// The Daylight building blocks (docs/design/daylight.md): the grey page, white grouped cards, inset rows with hairlines,
// iOS-style icon tiles, ink and fill pills, a segmented control, the status hero and a bottom sheet with a grabber.
// Every screen is made from these, so the whole app keeps one rhythm: a 20 dp gutter, 12 dp between cards, 32 between groups.

/** The screen gutter: every card and title starts here. */
val Gutter: Dp = 20.dp

private val CardShape = RoundedCornerShape(Tokens.cornerL)

/** A scrolling grey page. Pushed screens pass [onBack] for the back row; top-level screens pass a large [title]. */
@Composable
fun DayPage(
    title: String? = null,
    onBack: (() -> Unit)? = null,
    scroll: ScrollState = rememberScrollState(),
    trailing: @Composable RowScope.() -> Unit = {},
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(Modifier.fillMaxSize().background(Day.page)) {
        if (onBack != null) BackRow(onBack)
        Column(Modifier.fillMaxSize().verticalScroll(scroll).padding(bottom = 32.dp)) {
            if (title != null) LargeTitle(title, top = if (onBack != null) 0.dp else 12.dp, trailing = trailing)
            content()
        }
    }
}

/** The iOS large title: 34 sp bold, on the gutter. */
@Composable
fun LargeTitle(text: String, supporting: String? = null, top: Dp = 12.dp, trailing: @Composable RowScope.() -> Unit = {}) {
    Row(Modifier.fillMaxWidth().padding(start = Gutter, end = Gutter - 4.dp, top = top, bottom = 12.dp), verticalAlignment = Alignment.Bottom) {
        Column(Modifier.weight(1f)) {
            if (supporting != null) Text(supporting, style = DayType.subhead, color = Day.muted)
            Text(text, style = DayType.largeTitle, color = Day.ink)
        }
        trailing()
    }
}

/** A back chevron for pushed screens, a 48 dp target. */
@Composable
fun BackRow(onBack: () -> Unit) {
    Row(Modifier.fillMaxWidth().padding(start = 8.dp, top = 4.dp).heightIn(min = 48.dp), verticalAlignment = Alignment.CenterVertically) {
        val back = stringResource(R.string.back)
        Row(
            Modifier.clip(RoundedCornerShape(Tokens.cornerS)).clickable(role = Role.Button, onClick = onBack)
                .semantics { contentDescription = back }.heightIn(min = 48.dp).padding(horizontal = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Glyph(R.drawable.ic_sym_back, Day.ink, 24.dp)
            Text(back, style = DayType.body, color = Day.ink)
        }
    }
}

/** A tinted vector icon. */
@Composable
fun Glyph(icon: Int, tint: Color, size: Dp = 22.dp, modifier: Modifier = Modifier) {
    Image(painterResource(icon), contentDescription = null, modifier = modifier.size(size), colorFilter = ColorFilter.tint(tint))
}

/** A group's heading, above its card: footnote, muted, sentence case. */
@Composable
fun GroupHeader(text: String) {
    Text(text, style = DayType.footnote, color = Day.muted, modifier = Modifier.padding(start = Gutter + 16.dp, end = Gutter, top = 24.dp, bottom = 8.dp))
}

/** A footnote under a group. */
@Composable
fun GroupFooter(text: String) {
    Text(text, style = DayType.footnote, color = Day.muted, modifier = Modifier.padding(start = Gutter + 16.dp, end = Gutter + 8.dp, top = 8.dp))
}

/** A white card on the gutter. Rows go in [content]; separate them with [RowDivider]. */
@Composable
fun DayCard(modifier: Modifier = Modifier, padding: Dp = 0.dp, content: @Composable ColumnScope.() -> Unit) {
    Column(
        modifier.fillMaxWidth().padding(horizontal = Gutter).clip(CardShape).background(Day.card).padding(padding),
        content = content,
    )
}

/** The hairline between rows, inset past the icon tile when the rows have one. */
@Composable
fun RowDivider(inset: Dp = 16.dp) {
    Box(Modifier.fillMaxWidth().padding(start = inset).height(0.5.dp).background(Day.rule))
}

/** The inset for [RowDivider] under rows that lead with an [IconTile]. */
val TileInset: Dp = 16.dp + 30.dp + 14.dp

/** An iOS Settings tile: a 30 dp rounded square of one colour with a white glyph. */
@Composable
fun IconTile(icon: Int, color: Color) {
    Box(Modifier.size(30.dp).clip(RoundedCornerShape(8.dp)).background(color), contentAlignment = Alignment.Center) {
        Glyph(icon, Color.White, 18.dp)
    }
}

/**
 * One row of a grouped list: optional tile, a title, an optional line under it, and a trailing value, control or chevron.
 * At least 52 dp tall, and the whole row is the target when [onClick] is set.
 */
@Composable
fun DayRow(
    title: String,
    subtitle: String? = null,
    tile: Pair<Int, Color>? = null,
    value: String? = null,
    titleColor: Color = Day.ink,
    chevron: Boolean = false,
    trailing: (@Composable () -> Unit)? = null,
    onClick: (() -> Unit)? = null,
) {
    val base = Modifier.fillMaxWidth().heightIn(min = 52.dp)
    Row(
        (if (onClick != null) base.clickable(role = Role.Button, onClick = onClick) else base).padding(horizontal = 16.dp, vertical = 11.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        tile?.let { (icon, color) -> IconTile(icon, color) }
        Column(Modifier.weight(1f)) {
            Text(title, style = DayType.body, color = titleColor)
            if (subtitle != null) Text(subtitle, style = DayType.subhead, color = Day.muted)
        }
        if (value != null) Text(value, style = DayType.body, color = Day.muted, textAlign = TextAlign.End)
        trailing?.invoke()
        if (chevron) Glyph(R.drawable.ic_sym_chevron, Day.rule2, 20.dp)
    }
}

/** A row with a switch; the row toggles it too. Green when on, like iOS. */
@Composable
fun SwitchRow(title: String, subtitle: String? = null, checked: Boolean, tile: Pair<Int, Color>? = null, enabled: Boolean = true, onChange: (Boolean) -> Unit) {
    DayRow(title, subtitle, tile, onClick = if (enabled) ({ onChange(!checked) }) else null, trailing = {
        DaySwitch(checked, enabled, onChange)
    })
}

@Composable
fun DaySwitch(checked: Boolean, enabled: Boolean = true, onChange: (Boolean) -> Unit) {
    Switch(
        checked = checked, onCheckedChange = onChange, enabled = enabled,
        colors = SwitchDefaults.colors(
            checkedTrackColor = Tokens.Map.normal, checkedThumbColor = Color.White, checkedBorderColor = Color.Transparent,
            uncheckedTrackColor = Day.fill, uncheckedThumbColor = Color.White, uncheckedBorderColor = Color.Transparent,
        ),
    )
}

/** The main action: an ink pill, 52 dp tall, white text. */
@Composable
fun InkButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true, busy: Boolean = false) {
    PillButton(text, onClick, modifier, enabled && !busy, if (enabled) Day.ink else Day.rule2, Day.onInk, busy)
}

/** A second action: a grey pill with ink text. */
@Composable
fun FillButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true, color: Color = Day.ink) {
    PillButton(text, onClick, modifier, enabled, Day.fill, if (enabled) color else Day.muted, false)
}

/** A plain text action in link blue, a 48 dp target. */
@Composable
fun TextAction(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true, color: Color = Day.link) {
    Box(
        modifier.heightIn(min = 48.dp).clip(RoundedCornerShape(Tokens.cornerS)).clickable(enabled = enabled, role = Role.Button, onClick = onClick).padding(horizontal = 12.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(text, style = DayType.headline, color = if (enabled) color else Day.muted)
    }
}

@Composable
private fun PillButton(text: String, onClick: () -> Unit, modifier: Modifier, enabled: Boolean, bg: Color, fg: Color, busy: Boolean) {
    Row(
        modifier.heightIn(min = 52.dp).clip(CircleShape).background(bg).clickable(enabled = enabled, role = Role.Button, onClick = onClick).padding(horizontal = 22.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp, Alignment.CenterHorizontally),
    ) {
        if (busy) CircularProgressIndicator(Modifier.size(18.dp), color = fg, strokeWidth = 2.dp)
        Text(text, style = DayType.headline, color = fg, textAlign = TextAlign.Center)
    }
}

/** The iOS segmented control: a grey track, the picked segment a white thumb. */
@Composable
fun Segmented(options: List<String>, selected: Int, onSelect: (Int) -> Unit, modifier: Modifier = Modifier) {
    Row(
        modifier.fillMaxWidth().heightIn(min = 40.dp).clip(RoundedCornerShape(Tokens.cornerS)).background(Day.fill).padding(3.dp).selectableGroup(),
        horizontalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        options.forEachIndexed { i, label ->
            val on = i == selected
            Box(
                Modifier.weight(1f).heightIn(min = 34.dp).clip(RoundedCornerShape(Tokens.cornerS - 2.dp))
                    .then(if (on) Modifier.background(Day.card).border(0.5.dp, Day.rule, RoundedCornerShape(Tokens.cornerS - 2.dp)) else Modifier)
                    .selectable(selected = on, role = Role.Tab, onClick = { onSelect(i) }),
                contentAlignment = Alignment.Center,
            ) {
                Text(label, style = if (on) DayType.subheadStrong else DayType.subhead, color = Day.ink, maxLines = 1)
            }
        }
    }
}

/** A big number with what it means under it, for stat cards. */
@Composable
fun Stat(value: String, label: String, modifier: Modifier = Modifier, valueColor: Color = Day.ink, note: String? = null, noteColor: Color = Day.muted) {
    Column(modifier.clip(CardShape).background(Day.card).padding(16.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(value, style = DayType.title1Num, color = valueColor, maxLines = 1)
        Text(label, style = DayType.subhead, color = Day.ink2)
        if (note != null) Text(note, style = DayType.footnote, color = noteColor)
    }
}

/** Two stat cards side by side on the gutter. */
@Composable
fun StatPair(left: @Composable (Modifier) -> Unit, right: @Composable (Modifier) -> Unit) {
    Row(Modifier.fillMaxWidth().padding(horizontal = Gutter), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        left(Modifier.weight(1f))
        right(Modifier.weight(1f))
    }
}

/** A card's own title, inside a padded [DayCard]. */
@Composable
fun CardTitle(text: String, supporting: String? = null) {
    Column(Modifier.padding(bottom = 12.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(text, style = DayType.title3, color = Day.ink)
        if (supporting != null) Text(supporting, style = DayType.subhead, color = Day.muted)
    }
}

/** A paragraph on the page, on the gutter. */
@Composable
fun PageText(text: String, color: Color = Day.ink2, style: TextStyle = DayType.callout) {
    Text(text, style = style, color = color, modifier = Modifier.fillMaxWidth().padding(horizontal = Gutter, vertical = 4.dp))
}

/** Vertical space between groups. */
@Composable
fun Gap(h: Dp = 12.dp) = Spacer(Modifier.height(h))

/** Actions at the bottom of a page: full width pills on the gutter. */
@Composable
fun ActionStack(content: @Composable ColumnScope.() -> Unit) {
    Column(Modifier.fillMaxWidth().padding(horizontal = Gutter, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(10.dp), content = content)
}

/**
 * The four steps a blackout goes through, On, Maybe, Out, Back, with the current one lit in its colour (R6.2: the word
 * is always there, colour never works alone).
 */
@Composable
fun StepTrack(current: Int, labels: List<String>, colors: List<Color>) {
    // A negative [current] lights nothing: the state is not known.
    val lit = colors.getOrNull(current) ?: Day.muted
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        labels.forEachIndexed { i, label ->
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Box(Modifier.fillMaxWidth().height(4.dp).clip(CircleShape).background(if (i <= current) lit else Day.fill))
                Text(label, style = DayType.caption.copy(color = if (i == current) lit else Day.muted, fontWeight = androidx.compose.ui.text.font.FontWeight(if (i == current) 600 else 500)), maxLines = 1)
            }
        }
    }
}

/** The mark, tinted: the disc half solid and half ring. */
@Composable
fun Mark(tint: Color, size: Dp = 28.dp) = Glyph(R.drawable.ic_mark, tint, size)

/** A floating notice card: the mark on an ink tile, a title and a line. */
@Composable
fun BannerCard(title: String, body: String?, modifier: Modifier = Modifier) {
    Row(
        modifier.fillMaxWidth().clip(CardShape).background(Day.card).border(0.5.dp, Day.rule, CardShape).padding(14.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(36.dp).clip(RoundedCornerShape(9.dp)).background(Day.ink), contentAlignment = Alignment.Center) { Mark(Color.White, 20.dp) }
        Column(Modifier.weight(1f)) {
            Text(title, style = DayType.headline, color = Day.ink)
            if (body != null) Text(body, style = DayType.subhead, color = Day.ink2)
        }
    }
}

/** A short state word in its strong colour on its pale container, like a status capsule. */
@Composable
fun StatePill(text: String, family: StateColors) {
    Box(Modifier.clip(CircleShape).background(family.container).padding(horizontal = 10.dp, vertical = 4.dp)) {
        Text(text, style = DayType.footnote.copy(fontWeight = androidx.compose.ui.text.font.FontWeight(600)), color = family.onContainer, maxLines = 1)
    }
}

/** A modal sheet: white, 28 dp top corners, a grabber. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DaySheet(onDismiss: () -> Unit, content: @Composable ColumnScope.() -> Unit) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = false),
        containerColor = Day.card,
        shape = RoundedCornerShape(topStart = Tokens.cornerXl, topEnd = Tokens.cornerXl),
        tonalElevation = 0.dp,
        dragHandle = { Box(Modifier.padding(top = 8.dp, bottom = 12.dp).size(width = 36.dp, height = 5.dp).clip(CircleShape).background(Day.rule2)) },
        content = content,
    )
}

/** A thin bar: [fraction] of the track filled, with an optional marker (a promise) as a short ink tick. */
@Composable
fun MeterBar(fraction: Float, color: Color, marker: Float? = null, modifier: Modifier = Modifier) {
    Canvas(modifier.fillMaxWidth().height(10.dp)) {
        val r = CornerRadius(size.height / 2, size.height / 2)
        drawRoundRect(Day.fill, cornerRadius = r)
        val f = fraction.coerceIn(0f, 1f)
        if (f > 0f) drawRoundRect(color, size = Size(size.width * f, size.height), cornerRadius = r)
        marker?.let { m ->
            val x = size.width * m.coerceIn(0f, 1f)
            drawLine(Day.ink, Offset(x, -3f), Offset(x, size.height + 3f), strokeWidth = 2.dp.toPx())
        }
    }
}

/** Spacer that takes the rest of a row. */
@Composable
fun RowScope.Fill() = Spacer(Modifier.weight(1f))

/** A fixed-width spacer. */
@Composable
fun HGap(w: Dp) = Spacer(Modifier.width(w))

/** The back action of the screen on top, set by the shell for pushed feature screens. Null on a top-level destination. */
val LocalBack = androidx.compose.runtime.staticCompositionLocalOf<(() -> Unit)?> { null }

/** A pushed feature screen: the back row from [LocalBack], a large title, then the content on the grey page. */
@Composable
fun FeaturePage(
    titleRes: Int,
    scroll: ScrollState = rememberScrollState(),
    trailing: @Composable RowScope.() -> Unit = {},
    content: @Composable ColumnScope.() -> Unit,
) {
    DayPage(title = stringResource(titleRes), onBack = LocalBack.current, scroll = scroll, trailing = trailing, content = content)
}

/** A label, then a value between a minus and a plus button; each button is a 48 dp target. */
@Composable
fun StepperRow(label: String, value: String, lessDesc: Int, moreDesc: Int, canLess: Boolean, canMore: Boolean, onLess: () -> Unit, onMore: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().heightIn(min = 56.dp).padding(start = 16.dp, end = 8.dp, top = 4.dp, bottom = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, style = DayType.body, color = Day.ink, modifier = Modifier.weight(1f))
        StepButton(R.drawable.ic_sym_remove, lessDesc, canLess, onLess)
        Text(value, style = DayType.headline.copy(fontFeatureSettings = "tnum"), color = Day.ink, textAlign = TextAlign.Center, modifier = Modifier.width(64.dp))
        StepButton(R.drawable.ic_sym_add, moreDesc, canMore, onMore)
    }
}

@Composable
private fun StepButton(icon: Int, desc: Int, enabled: Boolean, onClick: () -> Unit) {
    val d = stringResource(desc)
    Box(
        Modifier.size(48.dp).clip(CircleShape).clickable(enabled = enabled, role = Role.Button, onClick = onClick).semantics { contentDescription = d },
        contentAlignment = Alignment.Center,
    ) {
        Box(Modifier.size(34.dp).clip(CircleShape).background(Day.fill), contentAlignment = Alignment.Center) {
            Glyph(icon, if (enabled) Day.ink else Day.rule2, 18.dp)
        }
    }
}

/** A check-list line: a green check or a red alert, the words, and an optional fix action under them. */
@Composable
fun CheckRow(text: String, ok: Boolean, fix: String? = null, onFix: (() -> Unit)? = null) {
    val s = LocalStatusColors.current
    Row(Modifier.fillMaxWidth().heightIn(min = 52.dp).padding(start = 16.dp, end = 16.dp, top = 14.dp, bottom = if (fix != null) 2.dp else 14.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Glyph(if (ok) R.drawable.ic_sym_check else R.drawable.ic_sym_alert, if (ok) s.normal.color else s.confirmed.color, 22.dp)
        Column(Modifier.weight(1f)) {
            Text(text, style = DayType.body, color = Day.ink)
            if (fix != null && onFix != null) {
                Box(Modifier.padding(top = 2.dp)) { TextAction(fix, onFix, Modifier.padding(start = 0.dp)) }
            }
        }
    }
}
