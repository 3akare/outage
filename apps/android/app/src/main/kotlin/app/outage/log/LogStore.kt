package app.outage.log

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper

/** The Power Log's raw inputs and settings (power-log R1, design section 4, ADR 0043). */
interface LogStore {
    /** Stores one input. Events, reports and taps keep the first copy; answers and area outages keep the latest. */
    fun add(input: LogInput)

    /** Replaces the cached area outages that started at or after [sinceMs] with [outages] (R9.4). */
    fun replaceAreaOutages(sinceMs: Long, outages: List<LogInput.AreaOutage>)

    fun all(): List<LogInput>
    fun getSetting(key: String): String?
    fun putSetting(key: String, value: String?)

    /** Delete-my-data (R1.6): every input and setting. */
    fun clear()
}

/**
 * `outage_log.db`, a second database next to the sensor's Outbox, on plain `SQLiteOpenHelper` (no Room, ADR 0012).
 * Separate so Outbox ack and prune never touch the 400-day log (R1.4). Intervals and day stats are rebuilt from
 * `raw_input` on read, so they are not stored.
 * https://developer.android.com/reference/android/database/sqlite/SQLiteOpenHelper (onCreate, onUpgrade)
 */
class SqliteLogStore(context: Context) : LogStore {
    private val helper = object : SQLiteOpenHelper(context.applicationContext, DB_NAME, null, VERSION) {
        override fun onCreate(db: SQLiteDatabase) = migrate(db, 0, VERSION)
        override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) = migrate(db, oldVersion, newVersion)
    }

    private val db: SQLiteDatabase get() = helper.writableDatabase

    @Synchronized
    override fun add(input: LogInput) {
        val replace = input is LogInput.Answer || input is LogInput.AreaOutage
        db.insertWithOnConflict(
            "raw_input",
            null,
            row(input),
            if (replace) SQLiteDatabase.CONFLICT_REPLACE else SQLiteDatabase.CONFLICT_IGNORE,
        )
    }

    @Synchronized
    override fun replaceAreaOutages(sinceMs: Long, outages: List<LogInput.AreaOutage>) {
        val d = db
        d.beginTransaction()
        try {
            d.delete("raw_input", "kind = ? AND device_ms >= ?", arrayOf(RawKind.AREA_OUTAGE.name, sinceMs.toString()))
            for (o in outages) d.insertWithOnConflict("raw_input", null, row(o), SQLiteDatabase.CONFLICT_REPLACE)
            d.setTransactionSuccessful()
        } finally {
            d.endTransaction()
        }
    }

    @Synchronized
    override fun all(): List<LogInput> =
        db.rawQuery("SELECT kind, device_ms, payload FROM raw_input ORDER BY id", null).use { c ->
            val out = ArrayList<LogInput>(c.count)
            while (c.moveToNext()) LogInput.decode(c.getString(0), c.getLong(1), c.getString(2))?.let { out += it }
            out
        }

    @Synchronized
    override fun getSetting(key: String): String? =
        db.rawQuery("SELECT value FROM setting WHERE key = ?", arrayOf(key)).use { c -> if (c.moveToFirst()) c.getString(0) else null }

    @Synchronized
    override fun putSetting(key: String, value: String?) {
        if (value == null) {
            db.delete("setting", "key = ?", arrayOf(key))
        } else {
            val v = ContentValues().apply { put("key", key); put("value", value) }
            db.insertWithOnConflict("setting", null, v, SQLiteDatabase.CONFLICT_REPLACE)
        }
    }

    @Synchronized
    override fun clear() {
        val d = db
        d.delete("raw_input", null, null)
        d.delete("setting", null, null)
    }

    private fun row(input: LogInput) = ContentValues().apply {
        put("kind", input.kind.name)
        put("input_key", input.key)
        put("device_ms", input.deviceMs)
        put("payload", input.payload())
    }

    companion object {
        const val DB_NAME = "outage_log.db"
        const val VERSION = 1

        /** Migrations run step by step from [from] to [to]. Add a `when` branch per new version; never edit an old one. */
        fun migrate(db: SQLiteDatabase, from: Int, to: Int) {
            for (v in (from + 1)..to) {
                when (v) {
                    1 -> {
                        db.execSQL(
                            "CREATE TABLE raw_input (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, " +
                                "input_key TEXT NOT NULL UNIQUE, device_ms INTEGER NOT NULL, payload TEXT NOT NULL)",
                        )
                        db.execSQL("CREATE TABLE setting (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
                    }
                }
            }
        }
    }
}

/** In-memory store for JVM use and demo wiring. Same rules as [SqliteLogStore]. */
class MemoryLogStore : LogStore {
    private val rows = LinkedHashMap<String, LogInput>()
    private val settings = HashMap<String, String>()

    @Synchronized
    override fun add(input: LogInput) {
        val replace = input is LogInput.Answer || input is LogInput.AreaOutage
        if (replace) rows.remove(input.key)
        if (replace || input.key !in rows) rows[input.key] = input
    }

    @Synchronized
    override fun replaceAreaOutages(sinceMs: Long, outages: List<LogInput.AreaOutage>) {
        rows.values.removeAll { it is LogInput.AreaOutage && it.deviceMs >= sinceMs }
        outages.forEach { add(it) }
    }

    @Synchronized override fun all(): List<LogInput> = rows.values.toList()
    @Synchronized override fun getSetting(key: String): String? = settings[key]
    @Synchronized override fun putSetting(key: String, value: String?) {
        if (value == null) settings.remove(key) else settings[key] = value
    }
    @Synchronized override fun clear() {
        rows.clear()
        settings.clear()
    }
}

/** One [SqliteLogStore] per process, shared by the UI, the sensor listener and the Freezer Guard receiver. */
object LogStores {
    @Volatile private var instance: LogStore? = null

    fun get(context: Context): LogStore = instance ?: synchronized(this) {
        instance ?: SqliteLogStore(context.applicationContext).also { instance = it }
    }
}
