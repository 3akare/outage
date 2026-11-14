package app.outage.shell

enum class ColorRole { PRIMARY, TERTIARY, ERROR }

enum class StatusIcon { CHECK, PERSON_PIN, HELP, POWER_OFF, POWER_ON }

/**
 * Colour role, icon and label for a spot status, in one place (R6.2). `labelName` is the name of a
 * string in `values/strings.xml`; the UI maps it to a resource id. A test checks every name exists.
 */
data class StatusStyle(val role: ColorRole, val icon: StatusIcon, val labelName: String) {
    companion object {
        fun of(level: StatusLevel): StatusStyle = when (level) {
            StatusLevel.NORMAL -> StatusStyle(ColorRole.PRIMARY, StatusIcon.CHECK, "status_normal")
            StatusLevel.SPOT_ONLY -> StatusStyle(ColorRole.TERTIARY, StatusIcon.PERSON_PIN, "status_spot_only")
            StatusLevel.POSSIBLE -> StatusStyle(ColorRole.TERTIARY, StatusIcon.HELP, "status_possible")
            StatusLevel.CONFIRMED -> StatusStyle(ColorRole.ERROR, StatusIcon.POWER_OFF, "status_confirmed")
            StatusLevel.RESTORED -> StatusStyle(ColorRole.PRIMARY, StatusIcon.POWER_ON, "status_restored")
        }
    }
}
