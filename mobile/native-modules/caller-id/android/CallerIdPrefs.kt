package app.retailex.mobile.callerid

import android.content.Context
import org.json.JSONObject

object CallerIdPrefs {
    private const val PREF = "retailex_caller_id_native"
    private const val KEY_JSON = "config_json"

    fun save(context: Context, json: String) {
        context.getSharedPreferences(PREF, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_JSON, json)
            .apply()
    }

    fun read(context: Context): JSONObject? {
        val raw = context.getSharedPreferences(PREF, Context.MODE_PRIVATE)
            .getString(KEY_JSON, null)
            ?: return null
        return try {
            JSONObject(raw)
        } catch (_: Exception) {
            null
        }
    }

    fun enabled(context: Context): Boolean =
        read(context)?.optBoolean("enabled", false) == true

    fun endpoint(context: Context): String =
        read(context)?.optString("endpoint", "")?.trim().orEmpty()

    fun token(context: Context): String =
        read(context)?.optString("token", "")?.trim().orEmpty()

    fun device(context: Context): String =
        read(context)?.optString("device", "")?.trim().orEmpty()
}
