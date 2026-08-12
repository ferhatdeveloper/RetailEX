package com.retailex.callerid

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.Timer
import java.util.TimerTask
import java.util.concurrent.TimeUnit

class BridgeKeepAliveService : Service() {
    private val channelId = "retailex_callerid_keepalive"
    private var timer: Timer? = null
    private val http = OkHttpClient.Builder()
        .connectTimeout(3, TimeUnit.SECONDS)
        .readTimeout(3, TimeUnit.SECONDS)
        .build()

    override fun onCreate() {
        super.onCreate()
        createChannel()
        startForeground(1107, buildNotification("Arka plan servisi aktif"))
        startHeartbeat()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        return START_STICKY
    }

    override fun onDestroy() {
        timer?.cancel()
        timer = null
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun startHeartbeat() {
        if (timer != null) return
        timer = Timer("bridge-keepalive", true).apply {
            scheduleAtFixedRate(object : TimerTask() {
                override fun run() {
                    val endpoint = AppPrefs.endpoint(applicationContext)
                    if (endpoint.isBlank()) return
                    val base = endpoint.substringBefore("/api/caller_id/push")
                    val statusUrl = "$base/api/status"
                    val req = Request.Builder().url(statusUrl).get().build()
                    val ok = try {
                        http.newCall(req).execute().use { it.isSuccessful }
                    } catch (_: Exception) {
                        false
                    }
                    AppPrefs.addEvent(
                        context = applicationContext,
                        eventType = "keepalive",
                        title = "Background Service",
                        detail = if (ok) "Bridge OK" else "Bridge unreachable",
                        sent = ok,
                    )
                }
            }, 2000, 60000)
        }
    }

    private fun buildNotification(content: String): Notification {
        return NotificationCompat.Builder(this, channelId)
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .setContentTitle("RetailEX CallerID Pro")
            .setContentText(content)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val channel = NotificationChannel(
            channelId,
            "CallerID Background",
            NotificationManager.IMPORTANCE_LOW
        )
        nm.createNotificationChannel(channel)
    }
}
