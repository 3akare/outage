package app.outage.sensor

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteException
import android.database.sqlite.SQLiteOpenHelper

/**
 * The Outbox on SQLite (`outage_sensor.db`, design section 7). Platform SQLite only, no new dependency (ADR 0012).
 * The sequence counter lives in its own row and only grows, so `clearAll` and a corrupt-DB reset never reuse a seq the
 * server may already hold (S7). A corrupt file is deleted and recreated by the default `DatabaseErrorHandler`.
 * https://developer.android.com/reference/android/database/sqlite/SQLiteOpenHelper
 */
class SqliteEventStore(context: Context) : EventStore {
    private val helper = object : SQLiteOpenHelper(context.applicationContext, DB_NAME, null, 2) {
        override fun onCreate(db: SQLiteDatabase) {
            db.execSQL(
                "CREATE TABLE event (seq INTEGER PRIMARY KEY, type TEXT NOT NULL, recorded_elapsed_ms INTEGER NOT NULL, " +
                    "boot_count INTEGER NOT NULL, confidence TEXT NOT NULL, stop_reason TEXT, battery_pct INTEGER NOT NULL, " +
                    "plug_type TEXT NOT NULL, scheduling_delay_ms INTEGER, reason TEXT, source TEXT NOT NULL DEFAULT 'JOB', " +
                    "ref_seq INTEGER, answer TEXT, acked INTEGER NOT NULL DEFAULT 0)",
            )
            db.execSQL("CREATE TABLE state (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
            db.execSQL("CREATE TABLE counter (id INTEGER PRIMARY KEY CHECK (id = 1), last_seq INTEGER NOT NULL)")
            db.execSQL("INSERT INTO counter (id, last_seq) VALUES (1, 0)")
        }

        override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
            // v2: LABEL events (alerts-and-light-alarm task 1).
            if (oldVersion < 2) {
                db.execSQL("ALTER TABLE event ADD COLUMN ref_seq INTEGER")
                db.execSQL("ALTER TABLE event ADD COLUMN answer TEXT")
            }
        }
    }

    private val db: SQLiteDatabase get() = helper.writableDatabase

    @Synchronized
    override fun append(draft: EventDraft, bootCount: Int): Long {
        val d = db
        d.beginTransaction()
        try {
            val next = lastSeq(d) + 1
            d.execSQL("UPDATE counter SET last_seq = ? WHERE id = 1", arrayOf<Any>(next))
            val v = ContentValues().apply {
                put("seq", next)
                put("type", draft.type.name)
                put("recorded_elapsed_ms", draft.recordedElapsedMs)
                put("boot_count", bootCount)
                put("confidence", draft.confidence.name)
                put("stop_reason", draft.stopReason)
                put("battery_pct", draft.batteryPct)
                put("plug_type", draft.plug.name)
                put("scheduling_delay_ms", draft.schedulingDelayMs)
                put("reason", draft.reason)
                put("source", draft.source.name)
                put("ref_seq", draft.refSeq)
                put("answer", draft.answer)
            }
            d.insertOrThrow("event", null, v)
            d.setTransactionSuccessful()
            return next
        } finally {
            d.endTransaction()
        }
    }

    private fun lastSeq(d: SQLiteDatabase): Long =
        d.rawQuery("SELECT last_seq FROM counter WHERE id = 1", null).use { c -> if (c.moveToFirst()) c.getLong(0) else 0L }

    @Synchronized
    override fun pending(limit: Int): List<StoredEvent> = query("WHERE acked = 0 ORDER BY seq LIMIT $limit")

    @Synchronized
    override fun all(): List<StoredEvent> = query("ORDER BY seq")

    private fun query(tail: String): List<StoredEvent> = try {
        db.rawQuery(
            "SELECT seq, type, recorded_elapsed_ms, boot_count, confidence, stop_reason, battery_pct, plug_type, " +
                "scheduling_delay_ms, reason, source, acked, ref_seq, answer FROM event $tail",
            null,
        ).use { c ->
            val out = ArrayList<StoredEvent>(c.count)
            while (c.moveToNext()) {
                val draft = EventDraft(
                    type = EventType.valueOf(c.getString(1)),
                    recordedElapsedMs = c.getLong(2),
                    confidence = Confidence.valueOf(c.getString(4)),
                    batteryPct = c.getInt(6),
                    plug = Plug.valueOf(c.getString(7)),
                    source = Source.valueOf(c.getString(10)),
                    stopReason = if (c.isNull(5)) null else c.getString(5),
                    reason = if (c.isNull(9)) null else c.getString(9),
                    schedulingDelayMs = if (c.isNull(8)) null else c.getLong(8),
                    refSeq = if (c.isNull(12)) null else c.getLong(12),
                    answer = if (c.isNull(13)) null else c.getString(13),
                )
                out += StoredEvent(c.getLong(0), draft, c.getInt(3), c.getInt(11) == 1)
            }
            out
        }
    } catch (e: SQLiteException) {
        emptyList()
    }

    @Synchronized
    override fun ack(upToSeq: Long) {
        db.execSQL("UPDATE event SET acked = 1 WHERE seq <= ?", arrayOf<Any>(upToSeq))
    }

    @Synchronized
    override fun prune(nowElapsedMs: Long, currentBoot: Int) {
        db.execSQL(
            "DELETE FROM event WHERE acked = 1 AND (boot_count != ? OR ? - recorded_elapsed_ms > ?)",
            arrayOf<Any>(currentBoot, nowElapsedMs, RETENTION_MS),
        )
    }

    @Synchronized
    override fun getState(key: String): String? = try {
        db.rawQuery("SELECT value FROM state WHERE key = ?", arrayOf(key)).use { c -> if (c.moveToFirst()) c.getString(0) else null }
    } catch (e: SQLiteException) {
        null
    }

    @Synchronized
    override fun putState(key: String, value: String?) {
        if (value == null) {
            db.delete("state", "key = ?", arrayOf(key))
        } else {
            db.insertWithOnConflict("state", null, ContentValues().apply { put("key", key); put("value", value) }, SQLiteDatabase.CONFLICT_REPLACE)
        }
    }

    @Synchronized
    override fun clearAll() {
        val d = db
        d.beginTransaction()
        try {
            d.delete("event", null, null)
            d.delete("state", null, null)
            d.setTransactionSuccessful()
        } finally {
            d.endTransaction()
        }
    }

    companion object {
        const val DB_NAME = "outage_sensor.db"
    }
}
