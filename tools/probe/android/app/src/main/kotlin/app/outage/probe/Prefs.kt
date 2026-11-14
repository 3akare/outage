package app.outage.probe

import android.content.Context

/** Small settings. The Worker URL and token are typed by the tester on the phone and never stored in the repository. */
class Prefs(ctx: Context) {
    private val p = ctx.applicationContext.getSharedPreferences("probe", Context.MODE_PRIVATE)
    var sensorOn: Boolean get() = p.getBoolean("sensorOn", false); set(v) = p.edit().putBoolean("sensorOn", v).apply()
    var referenceOn: Boolean get() = p.getBoolean("referenceOn", false); set(v) = p.edit().putBoolean("referenceOn", v).apply()
    var alarmArmed: Boolean get() = p.getBoolean("alarmArmed", false); set(v) = p.edit().putBoolean("alarmArmed", v).apply()
    var alias: String get() = p.getString("alias", "") ?: ""; set(v) = p.edit().putString("alias", v).apply()
    var workerUrl: String get() = p.getString("workerUrl", "") ?: ""; set(v) = p.edit().putString("workerUrl", v).apply()
    var token: String get() = p.getString("token", "") ?: ""; set(v) = p.edit().putString("token", v).apply()
    var sessionStartId: Long get() = p.getLong("sessionStartId", 0); set(v) = p.edit().putLong("sessionStartId", v).apply()
}
