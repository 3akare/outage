package app.outage.demo

/**
 * Plays the recorded replay's frames (demo-mode task 5, R3): play, pause, restart and speed, on an injected clock. Quiet gaps
 * are squeezed the same way as the web player (`web/ui/simulate/simulate.ts`, ADR 0029), so a run takes
 * about 15 seconds at 1x. The frames and their decisions come from the file; nothing is computed here.
 */
class ReplayPlayer(private val replay: ReplayFile, private val clock: () -> Long) {
    data class View(
        /** "Simulated replay": always present (R2.1). */
        val banner: String,
        val source: String,
        val recordedDevices: Int,
        val index: Int,
        val count: Int,
        val frame: ReplayFrame,
        /** The last explanation at or before this frame. */
        val explanation: Explanation?,
        /** Phones that are off after this frame, by alias, among [phones]. */
        val off: Set<String>,
        val armed: Set<String>,
        val phones: List<ReplayPhone>,
        val playing: Boolean,
        val speed: Int,
        val nextAtMs: Long?,
        val finished: Boolean,
    )

    private var index = 0
    private var playing = false
    private var speed = 1
    private var nextAt: Long? = null

    fun play() {
        if (playing) return
        if (index >= replay.frames.size - 1) index = 0
        playing = true
        nextAt = clock() + gapAfter(index)
    }

    fun pause() {
        playing = false
        nextAt = null
    }

    fun restart() {
        index = 0
        playing = false
        nextAt = null
        play()
    }

    /** 1x, 2x or 4x (R3.3). */
    fun setSpeed(s: Int) {
        speed = s.coerceIn(1, 4)
        if (playing) nextAt = clock() + gapAfter(index)
    }

    /** Moves to every frame whose time has come. Call when [View.nextAtMs] is reached. */
    fun tick() {
        val now = clock()
        while (playing) {
            val due = nextAt ?: break
            if (now < due) break
            index++
            if (index >= replay.frames.size - 1) {
                index = replay.frames.size - 1
                playing = false
                nextAt = null
            } else {
                nextAt = due + gapAfter(index)
            }
        }
    }

    private fun gapAfter(i: Int): Long {
        if (i + 1 >= replay.frames.size) return 0
        return squeezedGap(replay.frames[i], replay.frames[i + 1]) / speed
    }

    fun view(): View {
        val off = HashSet<String>()
        val armed = HashSet<String>()
        for (f in replay.frames.subList(0, index + 1)) for (e in f.events) when (e.type) {
            "ARMED" -> armed += e.alias
            "UNPLUG" -> off += e.alias
            "REPLUG" -> off -= e.alias
        }
        return View(
            banner = replay.label,
            source = replay.source,
            recordedDevices = replay.recordedDevices,
            index = index,
            count = replay.frames.size,
            frame = replay.frames[index],
            explanation = replay.frames.subList(0, index + 1).lastOrNull { it.explanation != null }?.explanation,
            off = off,
            armed = armed,
            phones = replay.phones,
            playing = playing,
            speed = speed,
            nextAtMs = nextAt,
            finished = index == replay.frames.size - 1,
        )
    }

    companion object {
        /** Same rule as `gap()` in the web player: long quiet gaps become 2.2 s, short ones 350 to 900 ms. */
        fun squeezedGap(a: ReplayFrame, b: ReplayFrame): Long {
            val g = b.tMs - a.tMs
            val min = if (a.state == "POSSIBLE") 800L else 350L
            return if (g > 5000) 2200L else minOf(900L, maxOf(min, g))
        }
    }
}
