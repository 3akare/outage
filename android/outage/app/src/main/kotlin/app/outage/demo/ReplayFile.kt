package app.outage.demo

import app.outage.onboarding.MiniJson

/**
 * The replay file built by `tools/sim` with the real engine (`core/shared/fixtures/replay.json`, demo-mode R7). The app
 * reads it as an asset and plays it; it never computes a decision (ADR 0012). Every object in it is simulated (R2.2): the
 * loader refuses a file, phone, frame, event, neighbor or track that lacks `simulated: true` (DM1).
 */
data class ReplayFile(
    val label: String,
    /** `SYNTHETIC` until a field recording exists (R6.5). */
    val source: String,
    /** Real devices that recorded the outage, as the file says (R2.4). */
    val recordedDevices: Int,
    val phones: List<ReplayPhone>,
    val frames: List<ReplayFrame>,
    val track: UnplugTrack,
) {
    val simulated: Boolean get() = true
}

data class ReplayPhone(val alias: String, val role: String) {
    val simulated: Boolean get() = true
}

data class ReplayEvent(val alias: String, val type: String) {
    val simulated: Boolean get() = true
}

/** The engine's numbers for one decision (detection-engine explanation), shown as they are in the file. */
data class Explanation(
    val k: Int,
    val n: Int,
    val p: Double,
    val lambdaPerSec: Double,
    val windowMs: Long,
    val possibleMinK: Int,
    val possibleMaxP: Double,
    val confirmedMinK: Int,
    val confirmedMaxP: Double,
    val minArmedForConfirm: Int,
    val restore: RestoreExplanation?,
)

data class RestoreExplanation(val drops: Int, val quorum: Int, val replugs: Int, val windowMs: Long, val p95Ms: Long)

/** One step of the recorded replay. `state` is NORMAL, SPOT_ONLY, POSSIBLE, CONFIRMED or RESTORED. */
data class ReplayFrame(val tMs: Long, val state: String, val events: List<ReplayEvent>, val explanation: Explanation?) {
    val simulated: Boolean get() = true
}

data class Neighbor(val alias: String, val label: String, val drops: Boolean) {
    val simulated: Boolean get() = true
}

enum class Phase { UNPLUG, REPLUG }

/** One step of the unplug track, as an offset from the judge's own unplug or replug (demo-mode design 4). */
data class TrackFrame(
    val offsetMs: Long,
    val phase: Phase,
    val state: String,
    val events: List<ReplayEvent>,
    /** Set on the frame that stands for the judge's own drop or replug. */
    val judgeEvent: String?,
    val explanation: Explanation?,
) {
    val simulated: Boolean get() = true
}

data class UnplugTrack(
    val label: String,
    val armed: Int,
    val drops: Int,
    val neighbors: List<Neighbor>,
    val confirmedAtMs: Long,
    val restoredAtMs: Long,
    val frames: List<TrackFrame>,
) {
    val simulated: Boolean get() = true
}

class ReplayFormatException(message: String) : Exception(message)

object ReplayParser {
    const val ASSET_NAME = "replay.json"

    fun parse(text: String): ReplayFile {
        val root = obj(runCatching { MiniJson.parse(text) }.getOrElse { throw ReplayFormatException("not JSON") }, "file")
        labelled(root, "file")
        val phones = list(root["phones"], "phones").mapIndexed { i, p ->
            val m = obj(p, "phones[$i]")
            labelled(m, "phones[$i]")
            ReplayPhone(str(m, "alias"), str(m, "role"))
        }
        val frames = list(root["frames"], "frames").mapIndexed { i, f ->
            val m = obj(f, "frames[$i]")
            labelled(m, "frames[$i]")
            val cells = list(m["cells"], "frames[$i].cells")
            val state = cells.firstOrNull()?.let { str(obj(it, "cell"), "state") } ?: "NORMAL"
            ReplayFrame(num(m, "tMs").toLong(), state, events(m, "frames[$i]"), m["explanation"]?.let { explanation(obj(it, "explanation")) })
        }
        val t = obj(root["unplugTrack"], "unplugTrack")
        labelled(t, "unplugTrack")
        val neighbors = list(t["neighbors"], "neighbors").mapIndexed { i, n ->
            val m = obj(n, "neighbors[$i]")
            labelled(m, "neighbors[$i]")
            Neighbor(str(m, "alias"), str(m, "label"), m["drops"] == true)
        }
        val trackFrames = list(t["frames"], "unplugTrack.frames").mapIndexed { i, f ->
            val m = obj(f, "unplugTrack.frames[$i]")
            labelled(m, "unplugTrack.frames[$i]")
            TrackFrame(
                offsetMs = num(m, "offsetMs").toLong(),
                phase = when (str(m, "phase")) {
                    "UNPLUG" -> Phase.UNPLUG
                    "REPLUG" -> Phase.REPLUG
                    else -> throw ReplayFormatException("unplugTrack.frames[$i].phase")
                },
                state = str(m, "state"),
                events = events(m, "unplugTrack.frames[$i]"),
                judgeEvent = m["judgeEvent"] as? String,
                explanation = m["explanation"]?.let { explanation(obj(it, "explanation")) },
            )
        }
        val track = UnplugTrack(
            label = str(t, "label"),
            armed = num(t, "armed").toInt(),
            drops = num(t, "drops").toInt(),
            neighbors = neighbors,
            confirmedAtMs = num(t, "confirmedAtMs").toLong(),
            restoredAtMs = num(t, "restoredAtMs").toLong(),
            frames = trackFrames,
        )
        return ReplayFile(str(root, "label"), str(root, "source"), num(root, "recordedDevices").toInt(), phones, frames, track)
    }

    private fun events(m: Map<String, Any?>, path: String): List<ReplayEvent> = list(m["events"], "$path.events").mapIndexed { i, e ->
        val em = obj(e, "$path.events[$i]")
        labelled(em, "$path.events[$i]")
        ReplayEvent(str(em, "alias"), str(em, "type"))
    }

    private fun explanation(m: Map<String, Any?>): Explanation {
        val th = obj(m["thresholds"], "thresholds")
        val possible = obj(th["possible"], "possible")
        val confirmed = obj(th["confirmed"], "confirmed")
        val r = m["restore"]?.let { obj(it, "restore") }
        return Explanation(
            k = num(m, "k").toInt(),
            n = num(m, "n").toInt(),
            p = num(m, "p"),
            lambdaPerSec = num(m, "lambdaPerSec"),
            windowMs = num(m, "windowMs").toLong(),
            possibleMinK = num(possible, "minK").toInt(),
            possibleMaxP = num(possible, "maxP"),
            confirmedMinK = num(confirmed, "minK").toInt(),
            confirmedMaxP = num(confirmed, "maxP"),
            minArmedForConfirm = num(th, "minArmedForConfirm").toInt(),
            restore = r?.let { RestoreExplanation(num(it, "d").toInt(), num(it, "quorum").toInt(), num(it, "replugs").toInt(), num(it, "wrMs").toLong(), num(it, "p95Ms").toLong()) },
        )
    }

    /** R2.2, DM1: a missing or false `simulated` makes the whole file unreadable. */
    private fun labelled(m: Map<String, Any?>, path: String) {
        if (m["simulated"] != true) throw ReplayFormatException("$path lacks simulated: true")
    }

    @Suppress("UNCHECKED_CAST")
    private fun obj(v: Any?, path: String): Map<String, Any?> = v as? Map<String, Any?> ?: throw ReplayFormatException("$path is not an object")
    private fun list(v: Any?, path: String): List<Any?> = v as? List<Any?> ?: throw ReplayFormatException("$path is not a list")
    private fun str(m: Map<String, Any?>, k: String): String = m[k] as? String ?: throw ReplayFormatException("$k is not text")
    private fun num(m: Map<String, Any?>, k: String): Double = (m[k] as? Number)?.toDouble() ?: throw ReplayFormatException("$k is not a number")
}
