package com.retailex.terazimanager.config

import android.content.Context
import com.retailex.terazimanager.domain.models.ScaleDeviceConfig
import com.retailex.terazimanager.domain.models.ScalePluDefaults
import com.retailex.terazimanager.domain.models.ScaleTransportType
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.io.File

@Serializable
data class AppConfig(
    var scaleIp: String = "192.168.1.100",
    var apiBaseUrl: String = "https://api.retailex.app",
    var tenantCode: String = "",
    var apiToken: String = "",
    var authMode: String = "none",
    var productsPath: String = DEFAULT_PRODUCTS_PATH,
    var syncIntervalMinutes: Int = 5,
    var lfCodeBase: Int = 10000,
    var clearBeforeSend: Boolean = false,
    var sendHotkeys: Boolean = false,
    var mergeExistingPlu: Boolean = true,
    var storeCode: String = "",
    var storeName: String = "",
    var scaleId: String = "terazi-1",
    var autoSyncEnabled: Boolean = true,
    var syncOnStartup: Boolean = true,
    var defaultLabelScr: String = "retailex_logoluetiket.scr",
    var labelSlot: String = "D0",
    var sendLabelOnSync: Boolean = false,
    var firmNr: String = "001",
    var periodNr: String = "01",
    var firmId: String = "",
    var storeId: String = "",
    var syncMode: String = "local_auto",
    var agentDeviceId: String = "",
    var commandPollIntervalSeconds: Int = 30,
    var incrementalSyncEnabled: Boolean = true,
    var defaultBarcodeType: Int = 99,
    var defaultDepartment: Int = 21,
    var barcode99Format: String = "IIIIIIWWWWW",
    var barcode99WeightDecimals: Int = 3,
    var sendFunctionSetOnSync: Boolean = true,
    var devicePriceDecimalPosition: Int = 2,
    var compensateDevicePriceDecimal: Boolean = true,
    var defaultScalePort: Int = 5001,
    var usbBaudRate: Int = 9600,
    var rongtaProtocol: Int = 2,
    var charsetName: String = "GB2312",
    var scales: MutableList<ScaleDeviceConfigDto> = mutableListOf(),
) {
    fun getPluDefaults(): ScalePluDefaults = ScalePluDefaults(
        barcodeType = if (defaultBarcodeType > 0) defaultBarcodeType else 99,
        department = if (defaultDepartment >= 0) defaultDepartment else 21,
        barcode99Format = barcode99Format.ifBlank { "IIIIIIWWWWW" },
        barcode99WeightDecimals = if (barcode99WeightDecimals >= 0) barcode99WeightDecimals else 3,
    )

    fun resolvedApiUrl(): String {
        val base = apiBaseUrl.trim().trimEnd('/')
        val tenant = tenantCode.trim().trim('/')
        if (base.isEmpty()) return ""
        if (tenant.isEmpty()) return base
        if (base.endsWith("/$tenant", ignoreCase = true)) return base
        return "$base/$tenant"
    }

    fun getConfiguredScales(): List<ScaleDeviceConfig> =
        scales.map { it.toModel(defaultScalePort, usbBaudRate) }

    fun getActiveScales(): List<ScaleDeviceConfig> {
        val fromList = scales
            .filter { scale ->
                scale.enabled && (
                    scale.ipAddress.isNotBlank() ||
                        scale.transportType.equals("USB_SERIAL", ignoreCase = true)
                    )
            }
            .map { it.toModel(defaultScalePort, usbBaudRate) }

        if (fromList.isNotEmpty()) return fromList

        if (scaleIp.isNotBlank()) {
            return listOf(
                ScaleDeviceConfig(
                    id = scaleId.ifBlank { "terazi-1" },
                    name = "Varsayilan terazi",
                    ipAddress = scaleIp.trim(),
                    port = defaultScalePort,
                    enabled = true,
                )
            )
        }
        return emptyList()
    }

    fun ensureDefaultScale() {
        if (scales.isEmpty() && scaleIp.isNotBlank()) {
            scales.add(
                ScaleDeviceConfigDto(
                    id = scaleId.ifBlank { "terazi-1" },
                    name = "Terazi 1",
                    ipAddress = scaleIp.trim(),
                    port = defaultScalePort,
                    enabled = true,
                )
            )
        }
    }

    fun isReadyForSync(): Boolean {
        if (tenantCode.isBlank() || getActiveScales().isEmpty()) return false
        val mode = authMode.lowercase()
        if (mode == "none") return true
        if (mode == "auto" && isPlaceholderToken(apiToken)) return true
        return apiToken.isNotBlank()
    }

    fun refreshProductsPathFromSelection() {
        productsPath = buildProductsPath(firmNr)
    }

    companion object {
        const val DEFAULT_PRODUCTS_PATH =
            "/rex_001_products?is_scale_product=eq.true&is_active=eq.true&unit=in.(Kilogram,KG,kg)" +
                "&select=id,code,name,barcode,unit,price,is_scale_product,plu_code,is_active,shelf_life_days,updated_at" +
                "&order=plu_code.asc.nullslast"

        fun buildProductsPath(firmNr: String): String {
            val firm = normalizeFirmNr(firmNr)
            return "/rex_$firm" + "_products" +
                "?is_scale_product=eq.true&is_active=eq.true" +
                "&unit=in.(Kilogram,KG,kg)" +
                "&select=id,code,name,barcode,unit,price,is_scale_product,plu_code,is_active,firm_nr,shelf_life_days,updated_at" +
                "&order=plu_code.asc.nullslast"
        }

        fun normalizeFirmNr(firmNr: String?): String {
            val digits = (firmNr ?: "001").filter { it.isDigit() }
            return if (digits.isEmpty()) "001" else digits.padStart(3, '0')
        }

        fun isPlaceholderToken(token: String?): Boolean {
            val t = token?.trim().orEmpty()
            if (t.isEmpty()) return true
            return t.contains("BURAYA", ignoreCase = true) ||
                t.contains("PLACEHOLDER", ignoreCase = true) ||
                t.contains("YOUR_", ignoreCase = true)
        }

        fun configFile(context: Context): File =
            File(context.filesDir, "terazi-sync.json")

        private val json = Json {
            ignoreUnknownKeys = true
            prettyPrint = true
            encodeDefaults = true
        }

        fun load(context: Context): AppConfig {
            val file = configFile(context)
            if (!file.exists()) {
                val cfg = createDefault()
                cfg.save(context)
                return cfg
            }
            return runCatching {
                json.decodeFromString<AppConfig>(file.readText())
            }.getOrElse { createDefault() }.also { it.ensureDefaultScale() }
        }

        fun createDefault(): AppConfig = AppConfig(
            scales = mutableListOf(
                ScaleDeviceConfigDto(
                    id = "terazi-1",
                    name = "test",
                    ipAddress = "192.168.1.100",
                    port = 5001,
                    enabled = true,
                )
            )
        )
    }

    fun save(context: Context) {
        ensureDefaultScale()
        if (scales.isNotEmpty() && scaleIp.isBlank()) {
            scaleIp = scales.first().ipAddress
        }
        configFile(context).writeText(json.encodeToString(this))
    }
}

@Serializable
data class ScaleDeviceConfigDto(
    var id: String = "",
    var name: String = "Terazi 1",
    var ipAddress: String = "",
    var port: Int = 5001,
    var enabled: Boolean = true,
    var transportType: String = "NETWORK",
    var usbDeviceId: String? = null,
    var usbBaudRate: Int = 9600,
    var lastSync: String? = null,
    var lastProductCount: Int = 0,
    var lastFailedCount: Int = 0,
    var lastStatus: String? = null,
    var labelSlot: String = "D0",
) {
    fun toModel(defaultPort: Int, defaultBaudRate: Int = 9600): ScaleDeviceConfig = ScaleDeviceConfig(
        id = id,
        name = name,
        ipAddress = ipAddress,
        port = if (port > 0) port else defaultPort,
        enabled = enabled,
        transportType = if (transportType.equals("USB_SERIAL", ignoreCase = true)) {
            ScaleTransportType.USB_SERIAL
        } else {
            ScaleTransportType.NETWORK
        },
        usbDeviceId = usbDeviceId,
        usbBaudRate = if (usbBaudRate > 0) usbBaudRate else defaultBaudRate,
        lastSync = lastSync,
        lastProductCount = lastProductCount,
        lastFailedCount = lastFailedCount,
        lastStatus = lastStatus,
        labelSlot = labelSlot,
    )

    companion object {
        fun fromModel(model: ScaleDeviceConfig): ScaleDeviceConfigDto = ScaleDeviceConfigDto(
            id = model.id,
            name = model.name,
            ipAddress = model.ipAddress,
            port = model.port,
            enabled = model.enabled,
            transportType = model.transportType.name,
            usbDeviceId = model.usbDeviceId,
            usbBaudRate = model.usbBaudRate,
            lastSync = model.lastSync,
            lastProductCount = model.lastProductCount,
            lastFailedCount = model.lastFailedCount,
            lastStatus = model.lastStatus,
            labelSlot = model.labelSlot,
        )
    }
}
