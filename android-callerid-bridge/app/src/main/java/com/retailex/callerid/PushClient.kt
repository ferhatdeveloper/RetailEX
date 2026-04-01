package com.retailex.callerid

import android.content.Context
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

object PushClient {
    private val http = OkHttpClient.Builder()
        .connectTimeout(5, TimeUnit.SECONDS)
        .readTimeout(5, TimeUnit.SECONDS)
        .writeTimeout(5, TimeUnit.SECONDS)
        .build()

    fun sendEvent(
        context: Context,
        phone: String,
        name: String?,
        eventType: String,
        extra: JSONObject? = null,
    ): Boolean {
        val endpoint = AppPrefs.endpoint(context)
        if (endpoint.isBlank()) return false

        val payload = JSONObject()
            .put("phone", phone)
            .put("name", name ?: "")
            .put("eventType", eventType)
            .put("device", AppPrefs.deviceName(context))
            .put("ts", System.currentTimeMillis())

        if (extra != null) payload.put("extra", extra)

        val token = AppPrefs.token(context)
        if (token.isNotBlank()) payload.put("token", token)

        val req = Request.Builder()
            .url(endpoint)
            .post(payload.toString().toRequestBody("application/json; charset=utf-8".toMediaType()))
            .apply {
                if (token.isNotBlank()) {
                    header("Authorization", "Bearer $token")
                }
            }
            .build()

        return try {
            val ok = http.newCall(req).execute().use { it.isSuccessful }
            AppPrefs.addEvent(
                context = context.applicationContext,
                eventType = eventType,
                title = name ?: eventType,
                detail = phone,
                sent = ok,
            )
            ok
        } catch (_: Exception) {
            AppPrefs.addEvent(
                context = context.applicationContext,
                eventType = eventType,
                title = name ?: eventType,
                detail = phone,
                sent = false,
            )
            false
        }
    }
}
