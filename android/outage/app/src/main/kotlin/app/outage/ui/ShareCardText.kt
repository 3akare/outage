package app.outage.ui

import android.content.Context
import app.outage.BuildConfig
import app.outage.R
import app.outage.log.ShareFacts
import java.time.format.TextStyle
import java.util.Locale

/**
 * The share card, as text only (power-log R8.4). Carries the Light Score, hours of power,
 * outage count, the number of days covered, the word "estimate" and the app link, and nothing else (R8.1 to R8.3).
 */
object ShareCardText {
    /** The install page of the project's own Worker. Blank in a demo build, then the link line is left out. */
    fun link(apiBase: String = BuildConfig.API_BASE): String? =
        apiBase.takeIf { it.isNotBlank() }?.trimEnd('/')?.plus("/install")

    fun monthName(f: ShareFacts): String = f.month.month.getDisplayName(TextStyle.FULL, Locale.getDefault())

    fun scoreText(ctx: Context, f: ShareFacts): String =
        f.score?.let { ctx.getString(R.string.log_score_value, it) } ?: ctx.getString(R.string.log_share_score_none)

    fun build(ctx: Context, f: ShareFacts): String {
        val head = ctx.getString(R.string.log_share_text, monthName(f), scoreText(ctx, f), f.powerHours, f.outageCount, f.daysCovered)
        val link = link() ?: return head
        return head + "\n" + ctx.getString(R.string.log_share_text_link, link)
    }
}
