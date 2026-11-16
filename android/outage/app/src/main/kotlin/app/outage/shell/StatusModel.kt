package app.outage.shell

/** The five spot states from copy.md. A missing area status is `null`, not a level. */
enum class StatusLevel { NORMAL, SPOT_ONLY, POSSIBLE, CONFIRMED, RESTORED }

/**
 * Latest known area status. `updatedAtWallMs` is for the age label only (design section 6).
 * `simulated` marks replay data (demo-mode.md).
 */
data class AreaStatus(val level: StatusLevel, val updatedAtWallMs: Long, val simulated: Boolean = false)
