package app.outage.ui

import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import android.os.Build
import androidx.compose.ui.graphics.toArgb
import androidx.core.content.res.ResourcesCompat
import androidx.core.content.FileProvider
import app.outage.R
import app.outage.log.ShareFacts
import java.io.File

/**
 * The monthly share card as a picture (power-log R8, ADR 0040). Drawn on the phone with `android.graphics.Canvas` into a
 * bitmap, written to the app's cache and shared through `FileProvider` and `ACTION_SEND`. It draws the same facts as
 * [ShareCardText]: the month, Light Score, hours of power, outage count, the word "estimate" with the days covered, and the
 * app link. No location, area name, install ID or name is ever passed in (R8.2, PL9), because [ShareFacts] has none.
 * https://developer.android.com/reference/androidx/core/content/FileProvider
 * https://developer.android.com/training/sharing/send#send-binary-content
 */
object ShareCardImage {
    const val WIDTH = 1080
    const val HEIGHT = 1350
    private const val DIR = "share"
    private const val FILE = "outage-light-score.png"
    const val AUTHORITY_SUFFIX = ".share"

    /** Draws the card. Call off the main thread. */
    fun render(ctx: Context, f: ShareFacts): Bitmap {
        val bmp = Bitmap.createBitmap(WIDTH, HEIGHT, Bitmap.Config.ARGB_8888)
        val c = Canvas(bmp)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        // Daylight (ADR 0054): the grey page, one white card, ink text, the "on" green for the ring, Inter.
        val page = Tokens.Colors.paper2.toArgb()
        val ink = Tokens.Colors.ink.toArgb()
        val muted = Tokens.Colors.muted.toArgb()
        val inter = runCatching { ResourcesCompat.getFont(ctx, R.font.inter) }.getOrNull() ?: Typeface.DEFAULT
        c.drawColor(page)
        paint.color = Tokens.Colors.paper.toArgb()
        c.drawRoundRect(RectF(60f, 60f, WIDTH - 60f, HEIGHT - 60f), 72f, 72f, paint)

        fun text(s: String, x: Float, y: Float, size: Float, color: Int, bold: Boolean = false, align: Paint.Align = Paint.Align.CENTER) {
            paint.color = color
            paint.textSize = size
            paint.textAlign = align
            paint.typeface = if (Build.VERSION.SDK_INT >= 28) Typeface.create(inter, if (bold) 700 else 400, false) else Typeface.create(inter, if (bold) Typeface.BOLD else Typeface.NORMAL)
            paint.letterSpacing = if (size >= 100f) -0.03f else -0.01f
            c.drawText(s, x, y, paint)
        }

        val mid = WIDTH / 2f
        text(ctx.getString(R.string.log_share_card_title, ShareCardText.monthName(f)), mid, 190f, 52f, muted, bold = true)

        // Ring: the Light Score as a share of the circle.
        val ring = RectF(mid - 260f, 280f, mid + 260f, 800f)
        paint.style = Paint.Style.STROKE
        paint.strokeWidth = 44f
        paint.strokeCap = Paint.Cap.ROUND
        paint.color = Tokens.Colors.paper3.toArgb()
        c.drawArc(ring, 0f, 360f, false, paint)
        paint.color = Tokens.Map.normal.toArgb()
        c.drawArc(ring, -90f, 360f * ((f.score ?: 0) / 100f), false, paint)
        paint.style = Paint.Style.FILL
        text(ShareCardText.scoreText(ctx, f), mid, 590f, if (f.score == null) 64f else 190f, ink, bold = true)
        text(ctx.getString(R.string.ins_ring_title), mid, 670f, 48f, muted)

        text(ctx.getString(R.string.log_share_card_hours, f.powerHours), mid, 940f, 72f, ink, bold = true)
        text(ctx.getString(R.string.log_share_card_outages, f.outageCount), mid, 1025f, 56f, ink)
        text(ctx.getString(R.string.log_share_card_estimate, f.daysCovered), mid, 1095f, 44f, muted)

        text(ctx.getString(R.string.log_share_card_name), mid, 1210f, 60f, ink, bold = true)
        ShareCardText.link()?.let { text(it, mid, 1262f, 36f, muted) }
        return bmp
    }

    /** Writes the card to the cache and opens the share sheet. Call off the main thread; start the activity from [Context]. */
    fun share(ctx: Context, f: ShareFacts) {
        val dir = File(ctx.cacheDir, DIR).apply { mkdirs() }
        val file = File(dir, FILE)
        val bmp = render(ctx, f)
        file.outputStream().use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
        bmp.recycle()
        val uri = FileProvider.getUriForFile(ctx, ctx.packageName + AUTHORITY_SUFFIX, file)
        val send = Intent(Intent.ACTION_SEND)
            .setType("image/png")
            .putExtra(Intent.EXTRA_STREAM, uri)
            .putExtra(Intent.EXTRA_TEXT, ShareCardText.build(ctx, f))
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        send.clipData = ClipData.newRawUri("", uri)
        ctx.startActivity(Intent.createChooser(send, ctx.getString(R.string.log_share_chooser)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    /** Delete-my-data: the cached picture holds this month's numbers. */
    fun clear(ctx: Context) {
        File(ctx.cacheDir, DIR).deleteRecursively()
    }
}
