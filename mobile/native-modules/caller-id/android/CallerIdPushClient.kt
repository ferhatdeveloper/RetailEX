package app.retailex.mobile.callerid

import android.content.Context
import android.os.Build
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

object CallerIdPushClient {
    fun sendIncomingCall(context: Context, phone: String, name: String?): Boolean {
        if (!CallerIdPrefs.enabled(context)) return false
        val endpoint = CallerIdPrefs.endpoint(context)
        if (endpoint.isBlank()) return false

        val payload = JSONObject()
            .put("phone", phone)
            .put("name", name ?: "Incoming Call")
            .put("eventType", "incoming_call")
            .put("device", CallerIdPrefs.device(context).ifBlank { Build.MODEL })
            .put("ts", System.currentTimeMillis())

        val token = CallerIdPrefs.token(context)
        if (token.isNotBlank()) payload.put("token", token)

        return try {
            val url = URL(endpoint)
            val conn = (url.openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                connectTimeout = 5000
                readTimeout = 5000
                doOutput = true
                setRequestProperty("Content-Type", "application/json; charset=utf-8")
                if (token.isNotBlank()) {
                    setRequestProperty("Authorization", "Bearer $token")
                }
            }
            conn.outputStream.use { os ->
                os.write(payload.toString().toByteArray(Charsets.UTF_8))
            }
            val code = conn.responseCode
            conn.disconnect()
            code in 200..299
        } catch (_: Exception) {
            false
        }
    }
}
