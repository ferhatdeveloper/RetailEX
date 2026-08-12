package com.retailex.callerid

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.os.PowerManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.provider.Settings.Secure
import android.text.method.ScrollingMovementMethod
import android.text.format.DateFormat
import android.widget.Button
import android.widget.EditText
import android.widget.Switch
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.core.content.ContextCompat
import androidx.core.app.ActivityCompat
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.net.NetworkInterface
import java.util.concurrent.CopyOnWriteArraySet
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.concurrent.thread

class MainActivity : ComponentActivity() {
    private val scanHttp = OkHttpClient.Builder()
        .connectTimeout(400, TimeUnit.MILLISECONDS)
        .readTimeout(600, TimeUnit.MILLISECONDS)
        .build()
    private val statusHttp = OkHttpClient.Builder()
        .connectTimeout(2500, TimeUnit.MILLISECONDS)
        .readTimeout(3000, TimeUnit.MILLISECONDS)
        .build()
    private val statusHandler = Handler(Looper.getMainLooper())
    private val statusLoopRunning = AtomicBoolean(false)
    private val statusRunnable = object : Runnable {
        override fun run() {
            if (!statusLoopRunning.get()) return
            refreshBridgeStatusUi()
            statusHandler.postDelayed(this, 15000)
        }
    }
    private var historyFilter: String = "all"
    private var lastCustomerShareText: String = ""

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        if (AppPrefs.backgroundEnabled(this)) {
            ensureKeepAliveService()
            requestBatteryOptimizationExemption()
        }

        val endpointInput = findViewById<EditText>(R.id.endpointInput)
        val portInput = findViewById<EditText>(R.id.portInput)
        val tokenInput = findViewById<EditText>(R.id.tokenInput)
        val deviceNameInput = findViewById<EditText>(R.id.deviceNameInput)
        val saveButton = findViewById<Button>(R.id.saveButton)
        val openNotifAccessBtn = findViewById<Button>(R.id.openNotifAccessBtn)
        val backgroundSwitch = findViewById<Switch>(R.id.backgroundSwitch)
        val discoverButton = findViewById<Button>(R.id.discoverButton)
        val discoverResultText = findViewById<TextView>(R.id.discoverResultText)
        val testButton = findViewById<Button>(R.id.testButton)
        val statusText = findViewById<TextView>(R.id.statusText)
        val statusBadge = findViewById<TextView>(R.id.statusBadge)
        val fetchCustomerBtn = findViewById<Button>(R.id.fetchCustomerBtn)
        val shareCourierBtn = findViewById<Button>(R.id.shareCourierBtn)
        val historyText = findViewById<TextView>(R.id.historyText)
        val customerContextText = findViewById<TextView>(R.id.customerContextText)
        val filterAllBtn = findViewById<Button>(R.id.filterAllBtn)
        val filterCallBtn = findViewById<Button>(R.id.filterCallBtn)
        val filterSmsBtn = findViewById<Button>(R.id.filterSmsBtn)
        val filterWaBtn = findViewById<Button>(R.id.filterWaBtn)
        historyText.movementMethod = ScrollingMovementMethod()

        endpointInput.setText(AppPrefs.endpoint(this))
        portInput.setText(AppPrefs.port(this))
        tokenInput.setText(AppPrefs.token(this))
        deviceNameInput.setText(AppPrefs.deviceName(this))
        backgroundSwitch.isChecked = AppPrefs.backgroundEnabled(this)

        saveButton.setOnClickListener {
            AppPrefs.save(
                context = this,
                endpoint = endpointInput.text.toString(),
                token = tokenInput.text.toString(),
                deviceName = deviceNameInput.text.toString(),
                port = portInput.text.toString(),
            )
            portInput.setText(AppPrefs.port(this))
            endpointInput.setText(AppPrefs.endpoint(this))
            statusText.text = "Durum: Ayarlar kaydedildi."
            refreshBridgeStatusUi()
            renderHistory(historyText)
        }
        openNotifAccessBtn.setOnClickListener {
            requestRuntimePermissions()
            openNotificationListenerSettings()
        }
        backgroundSwitch.setOnCheckedChangeListener { _, isChecked ->
            AppPrefs.setBackgroundEnabled(this, isChecked)
            if (isChecked) {
                ensureKeepAliveService()
                requestBatteryOptimizationExemption()
                statusText.text = "Durum: Arkaplan modu aktif."
            } else {
                stopService(Intent(this, BridgeKeepAliveService::class.java))
                statusText.text = "Durum: Arkaplan modu kapalı."
            }
        }
        filterAllBtn.setOnClickListener {
            historyFilter = "all"
            renderHistory(historyText)
            updateFilterButtons(filterAllBtn, filterCallBtn, filterSmsBtn, filterWaBtn)
        }
        filterCallBtn.setOnClickListener {
            historyFilter = "call"
            renderHistory(historyText)
            updateFilterButtons(filterAllBtn, filterCallBtn, filterSmsBtn, filterWaBtn)
        }
        filterSmsBtn.setOnClickListener {
            historyFilter = "sms"
            renderHistory(historyText)
            updateFilterButtons(filterAllBtn, filterCallBtn, filterSmsBtn, filterWaBtn)
        }
        filterWaBtn.setOnClickListener {
            historyFilter = "wa"
            renderHistory(historyText)
            updateFilterButtons(filterAllBtn, filterCallBtn, filterSmsBtn, filterWaBtn)
        }

        discoverButton.setOnClickListener {
            statusText.text = "Durum: Ağ keşfi başlatıldı..."
            discoverResultText.text = "Bulunan sunucu: aranıyor..."
            autoDiscoverBridge(
                onFound = { endpoint ->
                    runOnUiThread {
                        endpointInput.setText(endpoint)
                        discoverResultText.text = "Bulunan sunucu: $endpoint"
                        statusText.text = "Durum: Sunucu bulundu, kaydetmeyi unutma."
                        refreshBridgeStatusUi()
                    }
                },
                onDoneWithoutResult = {
                    runOnUiThread {
                        discoverResultText.text = "Bulunan sunucu: yok"
                        statusText.text = "Durum: Sunucu bulunamadı (manuel IP gir)."
                    }
                }
            )
        }

        testButton.setOnClickListener {
            statusText.text = "Durum: Test gönderiliyor..."
            thread(start = true) {
                val ok = PushClient.sendEvent(
                    context = applicationContext,
                    phone = "905555555555",
                    name = "Test Call",
                    // "Arama" geçmiş filtresi eventType içinde "call" arar; manual_test görünmezdi.
                    eventType = "call_manual_test",
                )
                runOnUiThread {
                    if (ok) {
                        statusText.text = "Durum: Test başarılı."
                    } else {
                        statusText.text = "Durum: Test başarısız. Bridge kapalı olabilir veya aynı ağda değilsiniz."
                    }
                    refreshBridgeStatusUi()
                    renderHistory(historyText)
                }
            }
        }
        fetchCustomerBtn.setOnClickListener {
            statusText.text = "Durum: Müşteri bağlamı çekiliyor..."
            thread(start = true) {
                val ctx = fetchCustomerContext()
                runOnUiThread {
                    if (ctx == null) {
                        customerContextText.text = "Müşteri bağlamı alınamadı. Önce RetailEX'te çağrı eşleşmesi oluşmalı."
                    } else {
                        customerContextText.text = ctx.pretty
                        lastCustomerShareText = ctx.shareText
                    }
                }
            }
        }
        shareCourierBtn.setOnClickListener {
            if (lastCustomerShareText.isBlank()) {
                statusText.text = "Durum: Önce müşteri bilgisini çekin."
                return@setOnClickListener
            }
            val share = Intent(Intent.ACTION_SEND).apply {
                type = "text/plain"
                putExtra(Intent.EXTRA_TEXT, lastCustomerShareText)
            }
            startActivity(Intent.createChooser(share, "Kurye ile paylaş"))
        }

        refreshBridgeStatusUi()
        updateStatusBadge(statusBadge, "BAGLANTI KONTROL")
        updateFilterButtons(filterAllBtn, filterCallBtn, filterSmsBtn, filterWaBtn)
        renderHistory(historyText)
    }

    override fun onResume() {
        super.onResume()
        statusLoopRunning.set(true)
        statusHandler.post(statusRunnable)
        updateNotificationAccessStatus()
    }

    override fun onPause() {
        super.onPause()
        statusLoopRunning.set(false)
        statusHandler.removeCallbacks(statusRunnable)
    }

    private fun requestRuntimePermissions() {
        val permissions = buildList {
            add(Manifest.permission.READ_PHONE_STATE)
            add(Manifest.permission.READ_PHONE_NUMBERS)
            add(Manifest.permission.READ_CALL_LOG)
            add(Manifest.permission.READ_CONTACTS)
            add(Manifest.permission.RECEIVE_SMS)
            add(Manifest.permission.READ_SMS)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                add(Manifest.permission.POST_NOTIFICATIONS)
            }
        }.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }.toTypedArray()

        if (permissions.isNotEmpty()) {
            ActivityCompat.requestPermissions(this, permissions, 2001)
        }
    }

    private fun openNotificationListenerSettings() {
        val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
        if (intent.resolveActivity(packageManager) != null) {
            startActivity(intent)
            return
        }
        // Bazı OEM'lerde doğrudan Notification Listener ekranı yoksa genel ayarlara düş.
        val fallback = Intent(Settings.ACTION_SETTINGS)
        if (fallback.resolveActivity(packageManager) != null) {
            startActivity(fallback)
        }
    }

    private fun isNotificationAccessEnabled(): Boolean {
        val enabled = Secure.getString(contentResolver, "enabled_notification_listeners").orEmpty()
        return enabled.contains(packageName, ignoreCase = true)
    }

    private fun updateNotificationAccessStatus() {
        if (isNotificationAccessEnabled()) return
        val statusText = findViewById<TextView>(R.id.statusText)
        statusText.text = "Durum: WhatsApp aramasi icin Bildirim Erisimi kapali. 'Bildirim erisimini ac' butonunu kullanin."
    }

    private fun autoDiscoverBridge(onFound: (String) -> Unit, onDoneWithoutResult: () -> Unit) {
        val found = CopyOnWriteArraySet<String>()
        val foundEndpoint = arrayOfNulls<String>(1)

        // 1) mDNS/NSD dene
        val nsdManager = getSystemService(NSD_SERVICE) as? NsdManager
        val discoveryListener = object : NsdManager.DiscoveryListener {
            override fun onDiscoveryStarted(serviceType: String) {}
            override fun onServiceFound(serviceInfo: NsdServiceInfo) {
                if (foundEndpoint[0] != null) return
                nsdManager?.resolveService(serviceInfo, object : NsdManager.ResolveListener {
                    override fun onResolveFailed(serviceInfo: NsdServiceInfo, errorCode: Int) {}
                    override fun onServiceResolved(resolved: NsdServiceInfo) {
                        val host = resolved.host?.hostAddress ?: return
                        val port = resolved.port
                        if (port != 3001) return
                        val endpoint = "http://$host:3001/api/caller_id/push"
                        if (found.add(endpoint) && foundEndpoint[0] == null) {
                            foundEndpoint[0] = endpoint
                            onFound(endpoint)
                        }
                    }
                })
            }
            override fun onServiceLost(serviceInfo: NsdServiceInfo) {}
            override fun onDiscoveryStopped(serviceType: String) {}
            override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) {}
            override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) {}
        }

        try {
            nsdManager?.discoverServices("_http._tcp.", NsdManager.PROTOCOL_DNS_SD, discoveryListener)
        } catch (_: Exception) {
            // NSD başarısızsa scan'e devam.
        }

        // 2) Subnet scan fallback
        thread(start = true) {
            val prefix = localIpv4Prefix() // örn 192.168.1
            if (prefix != null && foundEndpoint[0] == null) {
                for (i in 1..254) {
                    if (foundEndpoint[0] != null) break
                    val host = "$prefix.$i"
                    if (isBridgeHost(host)) {
                        val endpoint = "http://$host:3001/api/caller_id/push"
                        foundEndpoint[0] = endpoint
                        onFound(endpoint)
                        break
                    }
                }
            }

            try {
                nsdManager?.stopServiceDiscovery(discoveryListener)
            } catch (_: Exception) {
            }

            if (foundEndpoint[0] == null) {
                onDoneWithoutResult()
            }
        }
    }

    private fun localIpv4Prefix(): String? {
        return try {
            val interfaces = NetworkInterface.getNetworkInterfaces()?.toList().orEmpty()
            interfaces
                .asSequence()
                .filter { it.isUp && !it.isLoopback }
                .flatMap { it.inetAddresses.toList().asSequence() }
                .mapNotNull { addr ->
                    val ip = addr.hostAddress ?: return@mapNotNull null
                    if (ip.contains(":")) return@mapNotNull null
                    val parts = ip.split(".")
                    if (parts.size == 4) "${parts[0]}.${parts[1]}.${parts[2]}" else null
                }
                .firstOrNull()
        } catch (_: Exception) {
            null
        }
    }

    private fun isBridgeHost(host: String): Boolean {
        val url = "http://$host:3001/api/status"
        val req = Request.Builder().url(url).get().build()
        return try {
            statusHttp.newCall(req).execute().use { res ->
                res.isSuccessful && (res.body?.string()?.contains("PostgreSQL Bridge") == true)
            }
        } catch (_: Exception) {
            false
        }
    }

    private fun refreshBridgeStatusUi() {
        val statusText = findViewById<TextView>(R.id.statusText)
        val endpoint = AppPrefs.endpoint(this)
        if (endpoint.isBlank()) {
            statusText.text = "Durum: Endpoint girilmedi. Manuel IP yazın veya ağ keşfi kullanın."
            return
        }
        thread(start = true) {
            val result = evaluateBridgeStatus(endpoint)
            runOnUiThread {
                statusText.text = result
                updateStatusBadge(findViewById(R.id.statusBadge), result)
                renderHistory(findViewById(R.id.historyText))
            }
        }
    }

    private fun evaluateBridgeStatus(endpoint: String): String {
        val uri = runCatching { Uri.parse(endpoint) }.getOrNull()
        val host = uri?.host?.trim().orEmpty()
        if (host.isBlank()) {
            return "Durum: Endpoint formatı hatalı."
        }

        val localPrefix = localIpv4Prefix()
        val hostPrefix = hostToPrefix(host)
        val sameSubnetLikely = !localPrefix.isNullOrBlank() && !hostPrefix.isNullOrBlank() && localPrefix == hostPrefix

        val bridgeOk = isBridgeHost(host)
        if (bridgeOk) {
            return "Durum: Bridge erişilebilir (OK)."
        }
        return if (!sameSubnetLikely) {
            "Durum: Bridge erişilemiyor. Telefon ve PC aynı ağda olmayabilir."
        } else {
            "Durum: Bridge erişilemiyor. Servis çalışmıyor olabilir (PC'de bridge kontrol edin)."
        }
    }

    private fun hostToPrefix(host: String): String? {
        val parts = host.split(".")
        if (parts.size != 4) return null
        return "${parts[0]}.${parts[1]}.${parts[2]}"
    }

    private data class CustomerContextResult(
        val pretty: String,
        val shareText: String,
    )

    private fun fetchCustomerContext(): CustomerContextResult? {
        val endpoint = AppPrefs.endpoint(this)
        if (endpoint.isBlank()) return null
        val base = endpoint.substringBefore("/api/caller_id/push")
        val token = AppPrefs.token(this)
        val url = if (token.isBlank()) {
            "$base/api/caller_id/customer_last"
        } else {
            "$base/api/caller_id/customer_last?token=${Uri.encode(token)}"
        }
        val req = Request.Builder().url(url).get().build()
        return try {
            statusHttp.newCall(req).execute().use { res ->
                if (!res.isSuccessful) return null
                val body = res.body?.string().orEmpty()
                if (body.isBlank() || body == "{}") return null
                val o = JSONObject(body)
                val phone = o.optString("phone")
                val name = o.optString("customerName")
                val address = o.optString("address")
                val locationUrl = o.optString("locationUrl")
                val note = o.optString("note")
                if (phone.isBlank()) return null
                val pretty = buildString {
                    append("Müşteri: ").append(if (name.isBlank()) "-" else name).append('\n')
                    append("Telefon: ").append(phone).append('\n')
                    append("Adres: ").append(if (address.isBlank()) "-" else address).append('\n')
                    if (locationUrl.isNotBlank()) append("Konum: ").append(locationUrl).append('\n')
                    if (note.isNotBlank()) append("Not: ").append(note)
                }
                val shareText = buildString {
                    append("Teslimat Bilgisi").append('\n')
                    append("Müşteri: ").append(if (name.isBlank()) "-" else name).append('\n')
                    append("Telefon: ").append(phone).append('\n')
                    append("Adres: ").append(if (address.isBlank()) "-" else address).append('\n')
                    if (locationUrl.isNotBlank()) append("Konum: ").append(locationUrl).append('\n')
                }
                CustomerContextResult(pretty = pretty, shareText = shareText)
            }
        } catch (_: Exception) {
            null
        }
    }

    private fun renderHistory(historyText: TextView) {
        val rawRows = AppPrefs.recentEvents(this, 40)
        val rows = rawRows.filter {
            when (historyFilter) {
                "call" -> it.eventType.contains("call")
                "sms" -> it.eventType.contains("sms")
                "wa" -> it.eventType.contains("whatsapp")
                else -> true
            }
        }.take(20)
        if (rows.isEmpty()) {
            historyText.text = "Henüz olay yok."
            return
        }
        historyText.text = rows.joinToString(separator = "\n\n") { row ->
            val t = DateFormat.format("dd.MM HH:mm", row.ts).toString()
            val status = if (row.sent) "GONDERILDI" else "HATA"
            "[$t] $status\n${row.title} · ${row.eventType}\n${row.detail}"
        }
    }

    private fun updateStatusBadge(statusBadge: TextView, statusText: String) {
        if (statusText.contains("OK")) {
            statusBadge.text = "BAGLI"
            statusBadge.setBackgroundColor(0xFF15803D.toInt())
            return
        }
        if (statusText.contains("aynı ağda olmayabilir")) {
            statusBadge.text = "AG UYARISI"
            statusBadge.setBackgroundColor(0xFFB45309.toInt())
            return
        }
        statusBadge.text = "SERVIS UYARISI"
        statusBadge.setBackgroundColor(0xFFB91C1C.toInt())
    }

    private fun updateFilterButtons(
        allBtn: Button,
        callBtn: Button,
        smsBtn: Button,
        waBtn: Button,
    ) {
        fun style(btn: Button, active: Boolean) {
            if (active) {
                btn.setBackgroundColor(0xFF1D4ED8.toInt())
                btn.setTextColor(0xFFFFFFFF.toInt())
            } else {
                btn.setBackgroundColor(0xFFE2E8F0.toInt())
                btn.setTextColor(0xFF0F172A.toInt())
            }
        }
        style(allBtn, historyFilter == "all")
        style(callBtn, historyFilter == "call")
        style(smsBtn, historyFilter == "sms")
        style(waBtn, historyFilter == "wa")
    }

    private fun ensureKeepAliveService() {
        val i = Intent(this, BridgeKeepAliveService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ContextCompat.startForegroundService(this, i)
        } else {
            startService(i)
        }
    }

    private fun requestBatteryOptimizationExemption() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return
        val pm = getSystemService(POWER_SERVICE) as? PowerManager ?: return
        if (pm.isIgnoringBatteryOptimizations(packageName)) return
        val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
            data = Uri.parse("package:$packageName")
        }
        if (intent.resolveActivity(packageManager) != null) {
            startActivity(intent)
        }
    }
}
