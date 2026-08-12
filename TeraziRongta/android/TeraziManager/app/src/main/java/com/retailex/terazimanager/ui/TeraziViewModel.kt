package com.retailex.terazimanager.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.retailex.terazimanager.config.AppConfig
import com.retailex.terazimanager.config.ScaleDeviceConfigDto
import com.retailex.terazimanager.data.discovery.LanScaleScanner
import com.retailex.terazimanager.data.scale.DefaultScaleTransportFactory
import com.retailex.terazimanager.data.scale.UsbSerialDeviceInfo
import com.retailex.terazimanager.data.scale.UsbSerialManager
import com.retailex.terazimanager.domain.helpers.DailySaleSummary
import com.retailex.terazimanager.domain.helpers.ProductSaleSummary
import com.retailex.terazimanager.domain.helpers.SaleReportHelper
import com.retailex.terazimanager.domain.models.DiscoveredScale
import com.retailex.terazimanager.domain.models.SaleRecord
import com.retailex.terazimanager.domain.models.ScaleDeviceConfig
import com.retailex.terazimanager.domain.models.ScalePluRecord
import com.retailex.terazimanager.domain.models.ScaleTransportType
import com.retailex.terazimanager.domain.models.SyncResult
import com.retailex.terazimanager.service.SyncEngine
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

data class TeraziUiState(
    val config: AppConfig = AppConfig.createDefault(),
    val logs: List<String> = emptyList(),
    val isBusy: Boolean = false,
    val discoveredScales: List<DiscoveredScale> = emptyList(),
    val usbDevices: List<UsbSerialDeviceInfo> = emptyList(),
    val pluRecords: List<ScalePluRecord> = emptyList(),
    val saleRecords: List<SaleRecord> = emptyList(),
    val dailySaleSummaries: List<DailySaleSummary> = emptyList(),
    val productSaleSummaries: List<ProductSaleSummary> = emptyList(),
    val lastSyncResult: SyncResult? = null,
    val selectedScaleIndex: Int = 0,
    val statusMessage: String = "",
)

class TeraziViewModel(application: Application) : AndroidViewModel(application) {
    private val _state = MutableStateFlow(TeraziUiState())
    val state: StateFlow<TeraziUiState> = _state.asStateFlow()

    private val usbManager = UsbSerialManager(application)

    private fun syncEngine(): SyncEngine =
        SyncEngine(_state.value.config, getApplication()) { appendLog(it) }

    init {
        val cfg = AppConfig.load(application)
        _state.update { it.copy(config = cfg) }
        appendLog("RetailEX TeraziManager baslatildi")
        refreshUsbDevices()
    }

    fun updateConfig(transform: (AppConfig) -> AppConfig) {
        _state.update { it.copy(config = transform(it.config)) }
    }

    fun saveConfig() {
        val cfg = _state.value.config
        cfg.save(getApplication())
        appendLog("Yapilandirma kaydedildi")
        _state.update { it.copy(statusMessage = "Ayarlar kaydedildi") }
    }

    private fun persistScales(message: String) {
        saveConfig()
        _state.update { it.copy(statusMessage = message) }
    }

    fun addScaleFromDiscovery(discovered: DiscoveredScale) {
        val id = "terazi-${discovered.ipAddress.replace('.', '-')}-${discovered.port}"
        if (hasScaleId(id)) {
            appendLog("Bu terazi zaten kayitli: ${discovered.ipAddress}:${discovered.port}")
            _state.update { it.copy(statusMessage = "Terazi zaten listede") }
            return
        }
        updateConfig { cfg ->
            cfg.scales.add(
                ScaleDeviceConfigDto(
                    id = id,
                    name = "Terazi ${discovered.ipAddress}",
                    ipAddress = discovered.ipAddress,
                    port = discovered.port,
                    enabled = true,
                    transportType = ScaleTransportType.NETWORK.name,
                ),
            )
            cfg.scaleIp = discovered.ipAddress
            cfg
        }
        appendLog("Terazi eklendi: ${discovered.ipAddress}:${discovered.port}")
        persistScales("LAN terazi eklendi (${_state.value.config.scales.size} cihaz)")
    }

    fun addScaleFromUsb(device: UsbSerialDeviceInfo) {
        val id = "usb-${device.deviceId.replace(':', '-')}"
        if (hasScaleId(id)) {
            appendLog("Bu USB cihaz zaten kayitli")
            _state.update { it.copy(statusMessage = "USB cihaz zaten listede") }
            return
        }
        updateConfig { cfg ->
            cfg.scales.add(
                ScaleDeviceConfigDto(
                    id = id,
                    name = "USB ${device.driverName}",
                    ipAddress = "",
                    port = cfg.defaultScalePort,
                    enabled = true,
                    transportType = ScaleTransportType.USB_SERIAL.name,
                    usbDeviceId = device.deviceId,
                    usbBaudRate = cfg.usbBaudRate,
                ),
            )
            cfg
        }
        appendLog("USB terazi eklendi: ${device.displayName}")
        persistScales("USB terazi eklendi (${_state.value.config.scales.size} cihaz)")
    }

    fun addManualNetworkScale(name: String, ip: String, port: Int) {
        val trimmedIp = ip.trim()
        if (trimmedIp.isBlank()) {
            appendLog("IP adresi bos olamaz")
            return
        }
        val id = "terazi-${trimmedIp.replace('.', '-')}-$port"
        if (hasScaleId(id)) {
            appendLog("Bu terazi zaten kayitli")
            return
        }
        updateConfig { cfg ->
            cfg.scales.add(
                ScaleDeviceConfigDto(
                    id = id,
                    name = name.ifBlank { "Terazi $trimmedIp" },
                    ipAddress = trimmedIp,
                    port = port,
                    enabled = true,
                    transportType = ScaleTransportType.NETWORK.name,
                ),
            )
            cfg
        }
        persistScales("Manuel terazi eklendi")
    }

    fun removeScale(index: Int) {
        updateConfig { cfg ->
            if (index in cfg.scales.indices) {
                val removed = cfg.scales.removeAt(index)
                appendLog("Terazi silindi: ${removed.name}")
            }
            cfg
        }
        _state.update { state ->
            val newIndex = state.selectedScaleIndex.coerceAtMost(
                (state.config.scales.size - 1).coerceAtLeast(0),
            )
            state.copy(selectedScaleIndex = newIndex)
        }
        persistScales("Terazi silindi")
    }

    fun toggleScaleEnabled(index: Int) {
        updateConfig { cfg ->
            if (index in cfg.scales.indices) {
                val scale = cfg.scales[index]
                cfg.scales[index] = scale.copy(enabled = !scale.enabled)
                appendLog("${scale.name}: ${if (!scale.enabled) "aktif" else "pasif"}")
            }
            cfg
        }
        persistScales("Terazi durumu guncellendi")
    }

    fun refreshUsbDevices() {
        viewModelScope.launch {
            runSafe("USB tarama") {
                val devices = withContext(Dispatchers.IO) { usbManager.listDevices() }
                _state.update { it.copy(usbDevices = devices) }
                if (devices.isEmpty()) {
                    appendLog("USB seri cihaz bulunamadi (OTG + RS232 adaptör takili mi?)")
                } else {
                    appendLog("${devices.size} USB seri cihaz bulundu")
                }
            }
        }
    }

    fun scanLan() {
        viewModelScope.launch {
            _state.update { it.copy(isBusy = true, statusMessage = "LAN taranıyor (5001)...") }
            runSafe("LAN tarama") {
                appendLog("LAN taramasi basladi")
                val found = LanScaleScanner.scanLocalSubnet(
                    ports = listOf(5001, 9100, 4001),
                    onProgress = { appendLog(it) },
                )
                _state.update {
                    it.copy(isBusy = false, discoveredScales = found, statusMessage = "${found.size} cihaz bulundu")
                }
                appendLog("LAN taramasi bitti: ${found.size} cihaz")
            }
        }
    }

    fun runSync() {
        viewModelScope.launch {
            _state.update { it.copy(isBusy = true, statusMessage = "Senkronizasyon...") }
            runSafe("Senkronizasyon") {
                val result = withContext(Dispatchers.IO) { syncEngine().runSync("manual") }
                _state.update {
                    it.copy(isBusy = false, lastSyncResult = result, statusMessage = result.message)
                }
            }
        }
    }

    fun testApi() {
        viewModelScope.launch {
            _state.update { it.copy(isBusy = true) }
            runSafe("API testi") {
                val ok = withContext(Dispatchers.IO) {
                    runCatching {
                        com.retailex.terazimanager.data.api.RetailExApiClient()
                            .testConnection(_state.value.config)
                    }.getOrDefault(false)
                }
                appendLog(if (ok) "API baglantisi OK" else "API baglantisi basarisiz")
                _state.update { it.copy(isBusy = false, statusMessage = if (ok) "API OK" else "API hatasi") }
            }
        }
    }

    fun testScaleConnection() {
        val scale = selectedScaleOrWarn() ?: return
        viewModelScope.launch {
            _state.update { it.copy(isBusy = true, statusMessage = "Baglanti test ediliyor...") }
            runSafe("Baglanti testi") {
                val result = withContext(Dispatchers.IO) {
                    val factory = DefaultScaleTransportFactory(_state.value.config, getApplication(), ::appendLog)
                    val transport = factory.createForScale(scale)
                    try {
                        transport.connect().fold(
                            onSuccess = { transport.testConnection() },
                            onFailure = { Result.failure(it) },
                        )
                    } finally {
                        transport.disconnect()
                    }
                }
                val msg = result.getOrNull()?.detail ?: result.exceptionOrNull()?.message.orEmpty()
                appendLog("Terazi test: $msg")
                _state.update { it.copy(isBusy = false, statusMessage = msg) }
            }
        }
    }

    fun readPluFromScale() {
        val scale = selectedScaleOrWarn() ?: return
        viewModelScope.launch {
            _state.update { it.copy(isBusy = true, statusMessage = "PLU okunuyor...") }
            runSafe("PLU okuma") {
                val result = withContext(Dispatchers.IO) {
                    syncEngine().readPluFromScale(scale)
                }
                result.fold(
                    onSuccess = { records ->
                        appendLog("${records.size} PLU okundu (${scale.name})")
                        _state.update {
                            it.copy(isBusy = false, pluRecords = records, statusMessage = "${records.size} PLU okundu")
                        }
                    },
                    onFailure = { ex ->
                        appendLog("PLU okuma hatasi: ${ex.message}")
                        _state.update { it.copy(isBusy = false, statusMessage = ex.message.orEmpty()) }
                    },
                )
            }
        }
    }

    fun readSaleReport() {
        val scale = selectedScaleOrWarn() ?: return
        viewModelScope.launch {
            _state.update { it.copy(isBusy = true, statusMessage = "Satis verisi okunuyor...") }
            runSafe("Satis raporu") {
                val result = withContext(Dispatchers.IO) {
                    val factory = DefaultScaleTransportFactory(_state.value.config, getApplication(), ::appendLog)
                    val transport = factory.createForScale(scale)
                    try {
                        transport.connect().fold(
                            onSuccess = { transport.readSaleRecords() },
                            onFailure = { Result.failure(it) },
                        )
                    } finally {
                        transport.disconnect()
                    }
                }
                result.fold(
                    onSuccess = { records ->
                        val daily = SaleReportHelper.aggregateByDay(records)
                        val products = SaleReportHelper.aggregateByProduct(records)
                        appendLog("${records.size} satis kaydi okundu")
                        _state.update {
                            it.copy(
                                isBusy = false,
                                saleRecords = records,
                                dailySaleSummaries = daily,
                                productSaleSummaries = products,
                                statusMessage = "${records.size} satis kaydi",
                            )
                        }
                    },
                    onFailure = { ex ->
                        appendLog("Satis okuma hatasi: ${ex.message}")
                        _state.update { it.copy(isBusy = false, statusMessage = ex.message.orEmpty()) }
                    },
                )
            }
        }
    }

    fun clearPluOnScale() {
        val scale = selectedScaleOrWarn() ?: return
        viewModelScope.launch {
            _state.update { it.copy(isBusy = true, statusMessage = "PLU temizleniyor...") }
            runSafe("PLU temizleme") {
                val result = withContext(Dispatchers.IO) {
                    val factory = DefaultScaleTransportFactory(_state.value.config, getApplication(), ::appendLog)
                    val transport = factory.createForScale(scale)
                    try {
                        transport.connect()
                        transport.clearPlu()
                    } finally {
                        transport.disconnect()
                    }
                }
                val msg = result.fold({ "PLU temizlendi" }, { "PLU temizleme: ${it.message}" })
                appendLog(msg)
                _state.update { it.copy(isBusy = false, statusMessage = msg) }
            }
        }
    }

    fun clearLogs() {
        _state.update { it.copy(logs = emptyList()) }
    }

    fun selectScale(index: Int) {
        _state.update { it.copy(selectedScaleIndex = index.coerceIn(0, (it.config.scales.size - 1).coerceAtLeast(0))) }
    }

    private fun selectedScaleOrWarn(): ScaleDeviceConfig? {
        val scales = _state.value.config.getConfiguredScales()
        if (scales.isEmpty()) {
            appendLog("Kayitli terazi yok — Cihazlar sekmesinden ekleyin")
            _state.update { it.copy(statusMessage = "Terazi ekleyin") }
            return null
        }
        val index = _state.value.selectedScaleIndex.coerceIn(0, scales.lastIndex)
        val scale = scales[index]
        if (!scale.enabled) {
            appendLog("${scale.name} pasif — once aktif edin")
            _state.update { it.copy(statusMessage = "Terazi pasif") }
            return null
        }
        return scale
    }

    private fun hasScaleId(id: String): Boolean =
        _state.value.config.scales.any { it.id == id }

    private suspend fun runSafe(operation: String, block: suspend () -> Unit) {
        try {
            block()
        } catch (ex: Exception) {
            appendLog("$operation hatasi: ${ex.message}")
            _state.update { it.copy(isBusy = false, statusMessage = ex.message.orEmpty()) }
        }
    }

    private fun appendLog(message: String) {
        val line = "[${timestamp()}] $message"
        _state.update { it.copy(logs = (it.logs + line).takeLast(300)) }
    }

    private fun timestamp(): String =
        SimpleDateFormat("HH:mm:ss", Locale.getDefault()).format(Date())
}
