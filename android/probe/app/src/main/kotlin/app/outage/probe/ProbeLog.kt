package app.outage.probe

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import android.os.SystemClock

/**
 * Local log (design section 3): table log(id, kind, mono_ms, wall_ms, boot_count, fields_json, uploaded).
 * Platform SQLite only. Writes are synchronous so a row exists before the caller acts (record first, then act).
 */
class ProbeLog private constructor(private val ctx: Context) : SQLiteOpenHelper(ctx, "probe.db", null, 1) {
    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL("CREATE TABLE log (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, mono_ms INTEGER NOT NULL, wall_ms INTEGER NOT NULL, boot_count INTEGER NOT NULL, fields_json TEXT NOT NULL, uploaded INTEGER NOT NULL DEFAULT 0)")
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) = Unit

    /** Append a row. `monoMs` defaults to now; receivers pass the time they saw the broadcast. Returns the row id. */
    @Synchronized
    fun append(kind: String, fields: Map<String, Any?>, monoMs: Long = SystemClock.elapsedRealtime(), wallMs: Long = System.currentTimeMillis()): Long {
        require(kind in Contract.KINDS) { "unknown kind $kind" }
        val v = ContentValues().apply {
            put("kind", kind); put("mono_ms", monoMs); put("wall_ms", wallMs); put("boot_count", Facts.bootCount(ctx))
            put("fields_json", Json.encode(fields))
        }
        return writableDatabase.insertOrThrow("log", null, v)
    }

    private fun query(where: String?, args: Array<String>?, order: String, limit: Int?): List<LogRow> {
        val out = ArrayList<LogRow>()
        readableDatabase.query("log", arrayOf("id", "kind", "mono_ms", "wall_ms", "boot_count", "fields_json"), where, args, null, null, order, limit?.toString()).use { c ->
            while (c.moveToNext()) {
                @Suppress("UNCHECKED_CAST")
                val fields = (runCatching { Json.parse(c.getString(5)) }.getOrNull() as? Map<String, Any?>) ?: emptyMap()
                out.add(LogRow(c.getLong(0), c.getString(1), c.getLong(2), c.getLong(3), c.getInt(4), fields))
            }
        }
        return out
    }

    fun all(): List<LogRow> = query(null, null, "id ASC", null)
    fun recent(n: Int): List<LogRow> = query(null, null, "id DESC", n)
    fun pending(limit: Int): List<LogRow> = query("uploaded = 0", null, "id ASC", limit)
    fun pendingCount(): Long = readableDatabase.compileStatement("SELECT COUNT(*) FROM log WHERE uploaded = 0").simpleQueryForLong()
    fun since(id: Long): List<LogRow> = query("id >= ?", arrayOf(id.toString()), "id ASC", null)

    @Synchronized
    fun markUploaded(ids: List<Long>) {
        if (ids.isEmpty()) return
        writableDatabase.execSQL("UPDATE log SET uploaded = 1 WHERE id BETWEEN ? AND ?", arrayOf<Any>(ids.min(), ids.max()))
    }

    @Synchronized
    fun clear() { writableDatabase.delete("log", null, null) }

    fun counts(): Map<String, Long> {
        val out = linkedMapOf<String, Long>()
        readableDatabase.rawQuery("SELECT kind, COUNT(*) FROM log GROUP BY kind", null).use { c -> while (c.moveToNext()) out[c.getString(0)] = c.getLong(1) }
        return out
    }

    companion object {
        // Holds only the application context (see get()), which lives as long as the process: not a leak.
        @android.annotation.SuppressLint("StaticFieldLeak")
        @Volatile private var instance: ProbeLog? = null
        fun get(ctx: Context): ProbeLog = instance ?: synchronized(this) { instance ?: ProbeLog(ctx.applicationContext).also { instance = it } }
    }
}
