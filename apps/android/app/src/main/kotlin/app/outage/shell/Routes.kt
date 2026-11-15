package app.outage.shell

object Routes {
    /** Name of the intent extra that carries a deep-link route (app-shell design section 3). */
    const val EXTRA = "route"

    private const val MAX_LENGTH = 64
    private val featureKey = Regex("[a-z0-9_-]{1,32}")

    /**
     * Parses the `route` extra of an intent. Returns null for anything unknown, malformed or
     * missing, so the caller opens Home (R1.3). Never throws.
     */
    fun fromIntent(extra: String?): Route? {
        if (extra == null || extra.length > MAX_LENGTH) return null
        val value = extra.trim().lowercase()
        return when (value) {
            "home" -> Route.Home
            // Log merged into Insights and Area into Home (ADR 0026), so old links still open.
            "log" -> Route.Insights
            "area" -> Route.Home
            "insights" -> Route.Insights
            "settings" -> Route.Settings
            else -> {
                if (!value.startsWith("feature:")) return null
                val key = value.removePrefix("feature:")
                if (featureKey.matches(key)) Route.Feature(key) else null
            }
        }
    }

    /**
     * Router for app start (R1.1 to R1.3).
     * Not onboarded: Onboarding, whatever the link says. Onboarded: Home, with the linked
     * destination on top when there is one.
     */
    fun start(onboardingNeeded: Boolean, link: Route?): Router {
        if (onboardingNeeded) return Router(Route.Onboarding)
        val router = Router(Route.Home)
        when (link) {
            null, Route.Home, Route.Onboarding -> Unit
            is Route.Feature -> router.go(link)
            else -> router.tab(link)
        }
        return router
    }
}
