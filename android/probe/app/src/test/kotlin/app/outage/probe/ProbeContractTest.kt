package app.outage.probe

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/** The phone side of android/probe/contract: the same sample the Worker and the analysis tests read. */
class ProbeContractTest {
    @Suppress("UNCHECKED_CAST")
    private fun sample(): Map<String, Any?> = Json.parse(File("../contract/sample-export.json").readText()) as Map<String, Any?>

    @Suppress("UNCHECKED_CAST")
    private fun sampleRows(): Pair<DeviceInfo, List<LogRow>> {
        val dev = (sample()["devices"] as List<Map<String, Any?>>)[0]
        val d = dev["device"] as Map<String, Any?>
        val info = DeviceInfo(d["alias"] as String, d["maker"] as String, d["brand"] as String, (d["androidSdk"] as Number).toInt())
        return info to (dev["rows"] as List<Map<String, Any?>>).map(Contract::parseRow)
    }

    @Test
    fun PR6_live_armed_ratio_matches_the_analysis_on_the_shared_sample() {
        val t = ArmedRatio.compute(sampleRows().second)
        assertEquals(890_000L, t.chargingMs)
        assertEquals(845_000L, t.armedChargingMs)
        assertEquals(845_000.0 / 890_000.0, t.ratio!!, 1e-12)
    }

    @Test
    fun PR6_restart_gap_is_not_armed_and_reboot_gap_is_not_counted() {
        fun r(id: Long, kind: String, mono: Long, boot: Int = 1, f: Map<String, Any?> = emptyMap()) = LogRow(id, kind, mono, 0, boot, f)
        val rows = listOf(
            r(1, "PLUG", 0, f = mapOf("charging" to true)), r(2, "JOB_START", 1_000), r(3, "SESSION", 61_000, f = mapOf("kind" to "restart")),
            r(4, "JOB_START", 71_000), r(5, "SESSION", 5, 2, mapOf("kind" to "restart")),
        )
        val t = ArmedRatio.compute(rows)
        assertEquals(71_000L, t.chargingMs) // 0..71_000 in boot 1; the reboot gap is skipped
        assertEquals(0L, t.armedChargingMs) // 1_000..61_000 ends at a restart: not armed
        assertNull(ArmedRatio.compute(emptyList()).ratio)
    }

    @Test
    fun PR6_rows_are_put_in_time_order_inside_a_boot_before_counting() {
        fun r(id: Long, kind: String, mono: Long, boot: Int = 1, f: Map<String, Any?> = emptyMap()) = LogRow(id, kind, mono, 0, boot, f)
        // the PLUG row (id 2) is written one second late with the earlier broadcast time
        val rows = listOf(r(1, "JOB_START", 2_000), r(2, "PLUG", 1_000, f = mapOf("charging" to true)), r(3, "JOB_STOP", 10_000), r(4, "NOTE", 5, 2), r(5, "NOTE", 1, 2))
        assertEquals(listOf(2L, 1L, 3L, 5L, 4L), ArmedRatio.timeOrder(rows).map { it.id })
        assertEquals(ArmedRatio.Totals(9_000, 8_000), ArmedRatio.compute(rows))
    }

    @Test
    fun PR7_export_file_round_trips_the_shared_sample_exactly() {
        val (device, rows) = sampleRows()
        assertEquals(Json.encode(sample()), Contract.exportFile(device, rows))
    }

    @Test
    fun PR7_upload_body_has_the_contract_shape_and_respects_the_batch_limit() {
        val (device, rows) = sampleRows()
        @Suppress("UNCHECKED_CAST")
        val body = Json.parse(Contract.uploadBody(device, rows)) as Map<String, Any?>
        assertEquals(listOf("device", "rows"), body.keys.toList())
        assertEquals(10, (body["rows"] as List<*>).size)
        val tooMany = List(Contract.MAX_ROWS_PER_UPLOAD + 1) { rows[0].copy(id = it.toLong()) }
        assertThrows(IllegalArgumentException::class.java) { Contract.uploadBody(device, tooMany) }
        assertTrue(Contract.aliasOk("tecno-a"))
        assertTrue(!Contract.aliasOk("Ada Lovelace") && !Contract.aliasOk("") && !Contract.aliasOk("a".repeat(33)))
    }

    @Test
    fun json_encodes_and_parses_strings_numbers_and_nesting() {
        val v = linkedMapOf("s" to "a\"b\\c\nd\u0001", "n" to 42L, "d" to 1.5, "whole" to 3.0, "t" to true, "z" to null, "l" to listOf(1L, "x"))
        val text = Json.encode(v)
        assertEquals("""{"s":"a\"b\\c\nd\u0001","n":42,"d":1.5,"whole":3,"t":true,"z":null,"l":[1,"x"]}""", text)
        assertEquals(linkedMapOf("s" to "a\"b\\c\nd\u0001", "n" to 42L, "d" to 1.5, "whole" to 3L, "t" to true, "z" to null, "l" to listOf(1L, "x")), Json.parse(text))
        assertEquals(-12L, Json.parse(" -12 "))
        assertEquals(1.0e-3, Json.parse("1e-3") as Double, 0.0)
        assertThrows(IllegalArgumentException::class.java) { Json.parse("{\"a\":1} x") }
    }

    @Test
    fun plug_and_stop_reason_names_follow_the_platform_constants() {
        assertEquals(listOf("NONE", "AC", "USB", "WIRELESS", "DOCK", "UNKNOWN", "UNKNOWN"), listOf(0, 1, 2, 4, 8, 16, null).map(Contract::plugName))
        // Values verified against https://developer.android.com/reference/android/app/job/JobParameters
        assertEquals("CANCELLED_BY_APP", Contract.stopReasonName(1))
        assertEquals("TIMEOUT", Contract.stopReasonName(3))
        assertEquals("CONSTRAINT_CHARGING", Contract.stopReasonName(6))
        assertEquals("UNAVAILABLE", Contract.stopReasonName(null))
        assertEquals("OTHER_999", Contract.stopReasonName(999))
    }
}
