package app.outage.telemetry

import app.outage.sensor.Diagnostics
import app.outage.sensor.EventType
import app.outage.sensor.SensorEvent
import app.outage.sensor.Source
import app.outage.sensor.TelemetryCalc
import app.outage.sensor.TimeQuality
import java.time.LocalDate
import java.time.ZoneId

/**
 * One device-day aggregate (field-telemetry R2). Mirrors `DeviceDay` in `core/shared/src/device-day.ts` and the
 * fixtures in `core/shared/fixtures/telemetry/`. No location, cell, name, phone number or model name (R1.2): only the
 * install ID, the local day, the maker family, the Android major version and counters.
 */
data class DeviceDay(
    val installId: String,
    val day: String,
    val maker: String,
    val androidMajor: Int,
    val normalMs: Long,
    val stationMs: Long,
    val chargingMs: Long,
    val armedMs: Long,
    val gaps: List<GapCount>,
    val delayJobMs: List<Long>,
    val delayReceiverMs: List<Long>,
    val replugToRingMs: List<Long>,
    val promptsShown: Int,
    val promptsYes: Int,
    val promptsNo: Int,
    val promptsTimeout: Int,
    val alarmsExpected: Int,
    val alarmsRung: Int,
    val writeFailures: Int,
    val standby: Map<String, Int>,
    val exemption: Boolean,
    val stopReasons: Map<String, Int>,
) {
    /** The strict JSON the Worker accepts (`parseDeviceDay`). Every string is ASCII from a fixed pattern. */
    fun toJson(): String = buildString {
        append("{\"v\":1,\"installId\":").append(q(installId)).append(",\"day\":").append(q(day))
        append(",\"maker\":").append(q(maker)).append(",\"androidMajor\":").append(androidMajor)
        append(",\"mode\":{\"normalMs\":").append(normalMs).append(",\"stationMs\":").append(stationMs).append('}')
        append(",\"chargingMs\":").append(chargingMs).append(",\"armedMs\":").append(armedMs)
        append(",\"gaps\":[")
        gaps.forEachIndexed { i, g ->
            if (i > 0) append(',')
            append("{\"reason\":").append(q(g.reason)).append(",\"count\":").append(g.count)
            append(",\"lenHistMs\":[").append(g.lenHist.joinToString(",")).append("]}")
        }
        append("],\"delayJobMs\":[").append(delayJobMs.joinToString(","))
        append("],\"delayReceiverMs\":[").append(delayReceiverMs.joinToString(","))
        append("],\"replugToRingMs\":[").append(replugToRingMs.joinToString(","))
        append("],\"prompts\":{\"shown\":").append(promptsShown).append(",\"yes\":").append(promptsYes)
        append(",\"no\":").append(promptsNo).append(",\"timeout\":").append(promptsTimeout)
        append("},\"alarms\":{\"expected\":").append(alarmsExpected).append(",\"rung\":").append(alarmsRung)
        append("},\"writeFailures\":").append(writeFailures)
        append(",\"standby\":").append(counters(standby)).append(",\"exemption\":").append(exemption)
        append(",\"stopReasons\":").append(counters(stopReasons)).append('}')
    }

    private fun counters(m: Map<String, Int>) =
        m.entries.joinToString(",", "{", "}") { (k, v) -> q(k) + ":" + v }

    private fun q(s: String) = "\"" + s + "\""
}

/** Gaps of one reason: how many, and the histogram of their lengths over [DeviceDays.GAP_EDGES_MS] (R2.2). */
data class GapCount(val reason: String, val count: Int, val lenHist: List<Int>)

/**
 * Builds the aggregate from the sensor's event log and diagnostics (field-telemetry task 4). Pure: the clock, the zone and
 * the elapsed clock are inputs. Only events of the current boot have a known time (sensor-android R9.4), so a day that
 * spans a reboot is counted from the reboot; the numbers are an honest lower bound.
 */
object DeviceDays {
    /** Same edges as `GAP_EDGES_MS` in `device-day.ts`; the last bucket is open-ended. */
    val GAP_EDGES_MS = longArrayOf(60_000, 300_000, 900_000, 3_600_000, 14_400_000)
    const val MAX_DELAY_SAMPLES = 64
    const val MAX_DAY_MS = 26 * 3_600_000L
    private const val MAX_KEYS = 32
    private val KEY = Regex("^[A-Za-z0-9_.:-]{1,40}$")

    /**
     * [events] are all events in the sensor store, [nowWallMs] and [nowElapsedMs] are read together, [day] is the local
     * day to aggregate. For a past day the day ends at its local midnight; for today it ends now.
     */
    fun build(
        installId: String,
        maker: String,
        androidMajor: Int,
        day: LocalDate,
        zone: ZoneId,
        events: List<SensorEvent>,
        diagnostics: Diagnostics,
        nowWallMs: Long,
        nowElapsedMs: Long,
        stationMode: Boolean = false,
    ): DeviceDay {
        val startWall = day.atStartOfDay(zone).toInstant().toEpochMilli()
        val endWall = minOf(day.plusDays(1).atStartOfDay(zone).toInstant().toEpochMilli(), nowWallMs)
        val startElapsed = nowElapsedMs - (nowWallMs - startWall)
        val endElapsed = nowElapsedMs - (nowWallMs - endWall)
        val inDay = events.filter { it.timeQuality == TimeQuality.OK && it.recordedElapsedMs in startElapsed..endElapsed }
        val upToEnd = events.filter { it.recordedElapsedMs <= endElapsed }
        val t = TelemetryCalc.compute(upToEnd, endElapsed, (endElapsed - startElapsed).coerceAtLeast(0))
        val charging = t.chargingMs.coerceIn(0, MAX_DAY_MS)
        val armed = minOf(t.armedMs.coerceIn(0, MAX_DAY_MS), charging)
        return DeviceDay(
            installId = installId,
            day = day.toString(),
            maker = maker,
            androidMajor = androidMajor.coerceIn(1, 99),
            normalMs = if (stationMode) 0 else charging,
            stationMs = if (stationMode) charging else 0,
            chargingMs = charging,
            armedMs = armed,
            gaps = histogram(t.gaps.map { it.reason to (it.lengthMs ?: (endElapsed - it.startElapsedMs)) }),
            delayJobMs = delays(inDay, Source.JOB),
            delayReceiverMs = delays(inDay, Source.RECEIVER),
            replugToRingMs = emptyList(), // the Light Alarm feature owns ring timing; not recorded yet
            promptsShown = 0, promptsYes = 0, promptsNo = 0, promptsTimeout = 0, // the prompt feature fills these in
            alarmsExpected = 0, alarmsRung = 0,
            writeFailures = diagnostics.writeFailures.coerceIn(0, 1_000_000),
            standby = diagnostics.standbyBucket?.takeIf { KEY.matches(it) }?.let { mapOf(it to 1) } ?: emptyMap(),
            exemption = diagnostics.batteryExempt == true,
            stopReasons = diagnostics.stopReasonCounts.filter { KEY.matches(it.key) }.entries.take(MAX_KEYS).associate { it.key to it.value.coerceIn(0, 1_000_000) },
        )
    }

    private fun delays(events: List<SensorEvent>, source: Source): List<Long> =
        events.filter { it.source == source && it.type != EventType.REPORT }
            .mapNotNull { it.schedulingDelayMs }.filter { it in 0..MAX_DAY_MS }.takeLast(MAX_DELAY_SAMPLES)

    /** Groups gap lengths by reason, newest reasons dropped past the key cap. The histogram sums to the count (validator rule). */
    fun histogram(gaps: List<Pair<String, Long>>): List<GapCount> {
        val by = LinkedHashMap<String, IntArray>()
        for ((reason, len) in gaps) {
            val key = reason.takeIf { KEY.matches(it) } ?: "OTHER"
            if (key !in by && by.size >= MAX_KEYS) continue
            val h = by.getOrPut(key) { IntArray(GAP_EDGES_MS.size + 1) }
            val bucket = GAP_EDGES_MS.indexOfFirst { len < it }.let { if (it < 0) GAP_EDGES_MS.size else it }
            h[bucket]++
        }
        return by.map { (k, h) -> GapCount(k, h.sum(), h.toList()) }
    }

    /** `tecno`, `infinix`, `itel`, `samsung`, `xiaomi` (Redmi, POCO), `pixel` (Google) or `other` (R1.3). No model name. */
    fun maker(manufacturer: String, brand: String): String {
        val m = (manufacturer + " " + brand).lowercase()
        return when {
            "tecno" in m -> "tecno"
            "infinix" in m -> "infinix"
            "itel" in m -> "itel"
            "samsung" in m -> "samsung"
            "xiaomi" in m || "redmi" in m || "poco" in m -> "xiaomi"
            "google" in m -> "pixel"
            else -> "other"
        }
    }
}
