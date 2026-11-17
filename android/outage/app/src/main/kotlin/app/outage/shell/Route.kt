package app.outage.shell

/** Screens the shell can show. No Android imports: runs in JVM unit tests (AS1, AS2). */
sealed interface Route {
    data object Onboarding : Route
    data object Home : Route
    /** The power map, its own tab since the status-first redesign (ADR 0054). */
    data object Map : Route
    data object Insights : Route
    data object Settings : Route
    data class Feature(val key: String) : Route
}

/** Back stack on plain Kotlin state (no navigation library, app-shell design section 3). */
class Router(initial: Route) {
    private var items: List<Route> = listOf(initial)

    val stack: List<Route> get() = items
    val current: Route get() = items.last()

    /** Push a screen on top of the current one. Pushing the screen already on top does nothing. */
    fun go(route: Route) {
        if (route != current) items = items + route
    }

    /** Switch destination. Back from it returns to Home (R3.3). */
    fun tab(route: Route) {
        items = if (route == Route.Home || route == Route.Onboarding) listOf(route) else listOf(Route.Home, route)
    }

    /** Replace the whole stack, for example after onboarding or after delete. */
    fun reset(route: Route) {
        items = listOf(route)
    }

    /** Returns false when there is nothing to go back to, so the Activity finishes. */
    fun back(): Boolean {
        if (items.size <= 1) return false
        items = items.dropLast(1)
        return true
    }
}
