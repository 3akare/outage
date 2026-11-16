package app.outage.probe

import android.app.job.JobParameters

/** One log row (contract: android/probe/contract/README.md). Pure data, no Android calls. */
data class LogRow(val id: Long, val kind: String, val monoMs: Long, val wallMs: Long, val bootCount: Int, val fields: Map<String, Any?>)

data class DeviceInfo(val alias: String, val maker: String, val brand: String, val androidSdk: Int)

object Contract {
    val KINDS = setOf("JOB_START", "JOB_STOP", "PLUG", "BATTERY", "NOTE", "ALARM_TEST", "SESSION", "UPLOAD")
    const val MAX_ROWS_PER_UPLOAD = 500
    private val ALIAS = Regex("^[a-z0-9-]{1,32}$")

    fun aliasOk(a: String) = ALIAS.matches(a)

    /** BatteryManager.EXTRA_PLUGGED values (https://developer.android.com/reference/android/os/BatteryManager). */
    fun plugName(plugged: Int?): String = when (plugged) {
        null -> "UNKNOWN"
        0 -> "NONE"
        1 -> "AC"
        2 -> "USB"
        4 -> "WIRELESS"
        8 -> "DOCK"
        else -> "UNKNOWN"
    }

    /** Names for JobParameters.getStopReason() (API 31+). Constants are inlined at compile time. */
    fun stopReasonName(reason: Int?): String = when (reason) {
        null -> "UNAVAILABLE"
        JobParameters.STOP_REASON_UNDEFINED -> "UNDEFINED"
        JobParameters.STOP_REASON_CANCELLED_BY_APP -> "CANCELLED_BY_APP"
        JobParameters.STOP_REASON_PREEMPT -> "PREEMPT"
        JobParameters.STOP_REASON_TIMEOUT -> "TIMEOUT"
        JobParameters.STOP_REASON_DEVICE_STATE -> "DEVICE_STATE"
        JobParameters.STOP_REASON_CONSTRAINT_BATTERY_NOT_LOW -> "CONSTRAINT_BATTERY_NOT_LOW"
        JobParameters.STOP_REASON_CONSTRAINT_CHARGING -> "CONSTRAINT_CHARGING"
        JobParameters.STOP_REASON_CONSTRAINT_CONNECTIVITY -> "CONSTRAINT_CONNECTIVITY"
        JobParameters.STOP_REASON_CONSTRAINT_DEVICE_IDLE -> "CONSTRAINT_DEVICE_IDLE"
        JobParameters.STOP_REASON_CONSTRAINT_STORAGE_NOT_LOW -> "CONSTRAINT_STORAGE_NOT_LOW"
        JobParameters.STOP_REASON_QUOTA -> "QUOTA"
        JobParameters.STOP_REASON_BACKGROUND_RESTRICTION -> "BACKGROUND_RESTRICTION"
        JobParameters.STOP_REASON_APP_STANDBY -> "APP_STANDBY"
        JobParameters.STOP_REASON_USER -> "USER"
        JobParameters.STOP_REASON_SYSTEM_PROCESSING -> "SYSTEM_PROCESSING"
        JobParameters.STOP_REASON_ESTIMATED_APP_LAUNCH_TIME_CHANGED -> "ESTIMATED_APP_LAUNCH_TIME_CHANGED"
        else -> "OTHER_$reason"
    }

    fun rowMap(r: LogRow): Map<String, Any?> = linkedMapOf(
        "id" to r.id, "kind" to r.kind, "monoMs" to r.monoMs, "wallMs" to r.wallMs, "bootCount" to r.bootCount, "fields" to r.fields,
    )

    fun deviceMap(d: DeviceInfo): Map<String, Any?> = linkedMapOf("alias" to d.alias, "maker" to d.maker, "brand" to d.brand, "androidSdk" to d.androidSdk)

    fun uploadBody(d: DeviceInfo, rows: List<LogRow>): String {
        require(rows.size <= MAX_ROWS_PER_UPLOAD) { "at most $MAX_ROWS_PER_UPLOAD rows" }
        return Json.encode(linkedMapOf("device" to deviceMap(d), "rows" to rows.map(::rowMap)))
    }

    fun exportFile(d: DeviceInfo, rows: List<LogRow>): String =
        Json.encode(linkedMapOf("version" to 1, "devices" to listOf(linkedMapOf("device" to deviceMap(d), "rows" to rows.map(::rowMap)))))

    @Suppress("UNCHECKED_CAST")
    fun parseRow(m: Map<String, Any?>): LogRow = LogRow(
        (m["id"] as Number).toLong(), m["kind"] as String, (m["monoMs"] as Number).toLong(), (m["wallMs"] as Number).toLong(),
        (m["bootCount"] as Number).toInt(), m["fields"] as Map<String, Any?>,
    )
}

/** Live armed ratio for the debug screen. Same step rules as android/probe/analyze/src/timeline.ts (design section 7). */
object ArmedRatio {
    data class Totals(val chargingMs: Long, val armedChargingMs: Long) {
        val ratio: Double? get() = if (chargingMs > 0) armedChargingMs.toDouble() / chargingMs else null
    }

    private fun isRestart(r: LogRow) = r.kind == "SESSION" && (r.fields["kind"] == "restart" || r.fields["kind"] == "start")

    /** Time order: boots in id order, monoMs inside a boot (same rule as parse.ts timeOrder; the PLUG row is written late). */
    fun timeOrder(rows: List<LogRow>): List<LogRow> {
        val out = ArrayList<LogRow>(rows.size)
        var run = ArrayList<LogRow>()
        for (r in rows.sortedBy { it.id }) {
            if (run.isNotEmpty() && r.bootCount != run[0].bootCount) { out.addAll(run.sortedWith(compareBy({ it.monoMs }, { it.id }))); run = ArrayList() }
            run.add(r)
        }
        out.addAll(run.sortedWith(compareBy({ it.monoMs }, { it.id })))
        return out
    }

    fun compute(input: List<LogRow>): Totals {
        val rows = timeOrder(input)
        var charging = false
        var armed = false
        var chargingMs = 0L
        var armedChargingMs = 0L
        for (i in rows.indices) {
            val r = rows[i]
            (r.fields["charging"] as? Boolean)?.let { charging = it }
            if (isRestart(r)) armed = false
            if (r.kind == "JOB_START") armed = true
            if (r.kind == "JOB_STOP") armed = false
            val next = rows.getOrNull(i + 1) ?: break
            if (next.bootCount != r.bootCount) { charging = false; armed = false; continue }
            val ms = next.monoMs - r.monoMs
            if (ms <= 0) continue
            if (charging) { chargingMs += ms; if (armed && !isRestart(next)) armedChargingMs += ms }
        }
        return Totals(chargingMs, armedChargingMs)
    }
}
