package app.outage.onboarding

import android.content.Context

/**
 * Reads the guide from the app assets, where the `copyOemGuide*` Gradle task put it at build time.
 * https://developer.android.com/reference/android/content/res/AssetManager#open(java.lang.String)
 */
object AssetOemGuide {
    fun load(context: Context): OemGuide =
        context.assets.open(OemGuide.ASSET_NAME).use { OemGuide.parse(it.readBytes().toString(Charsets.UTF_8)) }
}
