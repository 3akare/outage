package app.outage.alarm

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteException
import android.database.sqlite.SQLiteOpenHelper

/**
 * [WakeStore] on SQLite (`outage_alarm.db`). Platform SQLite only. A separate file from the sensor Outbox, so the alarm
 * path never waits on an upload and deleting one never touches the other.
 * https://developer.android.com/reference/android/database/sqlite/SQLiteOpenHelper
 */
class SqliteWakeStore(context: Context) : WakeStore {
    private val helper = object : SQLiteOpenHelper(context.applicationContext, DB_NAME, null, 1) {
        override fun onCreate(db: SQLiteDatabase) {
            db.execSQL(
                "CREATE TABLE wake (unplug_seq INTEGER PRIMARY KEY, created_elapsed_ms INTEGER NOT NULL, boot_count INTEGER NOT NULL, " +
                    "expires_elapsed_ms INTEGER NOT NULL, state TEXT NOT NULL, ring_latency_ms INTEGER)",
            )
            db.execSQL("CREATE TABLE prompt (unplug_seq INTEGER PRIMARY KEY, status TEXT NOT NULL)")
        }

        override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) = Unit
    }

    private val db: SQLiteDatabase get() = helper.writableDatabase

    @Synchronized
    override fun promptStatus(unplugSeq: Long): PromptStatus? = try {
        db.rawQuery("SELECT status FROM prompt WHERE unplug_seq = ?", arrayOf(unplugSeq.toString())).use { c ->
            if (c.moveToFirst()) PromptStatus.valueOf(c.getString(0)) else null
        }
    } catch (e: SQLiteException) {
        null
    }

    @Synchronized
    override fun putPrompt(unplugSeq: Long, status: PromptStatus) {
        val v = ContentValues().apply { put("unplug_seq", unplugSeq); put("status", status.name) }
        db.insertWithOnConflict("prompt", null, v, SQLiteDatabase.CONFLICT_REPLACE)
        // Keep the table small: only the newest few unplugs matter.
        db.execSQL("DELETE FROM prompt WHERE unplug_seq NOT IN (SELECT unplug_seq FROM prompt ORDER BY unplug_seq DESC LIMIT 50)")
    }

    @Synchronized
    override fun shownPrompts(): List<Long> = try {
        db.rawQuery("SELECT unplug_seq FROM prompt WHERE status = 'SHOWN' ORDER BY unplug_seq", null).use { c ->
            val out = ArrayList<Long>()
            while (c.moveToNext()) out += c.getLong(0)
            out
        }
    } catch (e: SQLiteException) {
        emptyList()
    }

    @Synchronized
    override fun putWake(wake: Wake) {
        val v = ContentValues().apply {
            put("unplug_seq", wake.unplugSeq)
            put("created_elapsed_ms", wake.createdElapsedMs)
            put("boot_count", wake.bootCount)
            put("expires_elapsed_ms", wake.expiresElapsedMs)
            put("state", wake.state.name)
            put("ring_latency_ms", wake.ringLatencyMs)
        }
        db.insertWithOnConflict("wake", null, v, SQLiteDatabase.CONFLICT_REPLACE)
        db.execSQL("DELETE FROM wake WHERE unplug_seq NOT IN (SELECT unplug_seq FROM wake ORDER BY unplug_seq DESC LIMIT 20)")
    }

    @Synchronized
    override fun wake(unplugSeq: Long): Wake? = queryOne("WHERE unplug_seq = ?", arrayOf(unplugSeq.toString()))

    @Synchronized
    override fun latestWake(): Wake? = queryOne("ORDER BY unplug_seq DESC LIMIT 1", null)

    private fun queryOne(tail: String, args: Array<String>?): Wake? = try {
        db.rawQuery(
            "SELECT unplug_seq, created_elapsed_ms, boot_count, expires_elapsed_ms, state, ring_latency_ms FROM wake $tail", args,
        ).use { c ->
            if (!c.moveToFirst()) null
            else Wake(
                c.getLong(0), c.getLong(1), c.getInt(2), c.getLong(3), WakeState.valueOf(c.getString(4)),
                if (c.isNull(5)) null else c.getLong(5),
            )
        }
    } catch (e: SQLiteException) {
        null
    }

    @Synchronized
    override fun setWakeState(unplugSeq: Long, state: WakeState) {
        db.execSQL("UPDATE wake SET state = ? WHERE unplug_seq = ?", arrayOf<Any>(state.name, unplugSeq))
    }

    @Synchronized
    override fun recordRingLatency(unplugSeq: Long, latencyMs: Long) {
        db.execSQL("UPDATE wake SET ring_latency_ms = ? WHERE unplug_seq = ?", arrayOf<Any>(latencyMs, unplugSeq))
    }

    @Synchronized
    override fun clear() {
        val d = db
        d.beginTransaction()
        try {
            d.delete("wake", null, null)
            d.delete("prompt", null, null)
            d.setTransactionSuccessful()
        } finally {
            d.endTransaction()
        }
    }

    companion object {
        const val DB_NAME = "outage_alarm.db"
    }
}
