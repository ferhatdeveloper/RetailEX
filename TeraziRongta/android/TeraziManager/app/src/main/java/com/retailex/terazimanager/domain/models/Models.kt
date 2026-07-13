package com.retailex.terazimanager.domain.models

data class ScaleProductDto(
    val pluCode: String? = null,
    val barcode: String? = null,
    val name: String,
    val price: Double = 0.0,
    val unit: String = "KG",
    val barcodeType: Int = 99,
    val department: Int = 21,
    val lfCode: Int = 0,
    val externalId: String? = null,
    val isActive: Boolean = true,
    val hasExplicitPlu: Boolean = false,
    /** RetailEX shelf_life_days (gun). Etiket SKT = basim + ShlefTime. */
    val shelfLifeDays: Int = 0,
)

data class ScalePluDefaults(
    val barcodeType: Int = 99,
    val department: Int = 21,
    val barcode99Format: String = "IIIIIIWWWWW",
    val barcode99WeightDecimals: Int = 3,
)

data class ScaleDeviceConfig(
    val id: String = java.util.UUID.randomUUID().toString().replace("-", ""),
    val name: String = "Terazi 1",
    val ipAddress: String = "",
    val port: Int = 5001,
    val enabled: Boolean = true,
    val transportType: ScaleTransportType = ScaleTransportType.NETWORK,
    val usbDeviceId: String? = null,
    val usbBaudRate: Int = 9600,
    val lastSync: String? = null,
    val lastProductCount: Int = 0,
    val lastFailedCount: Int = 0,
    val lastStatus: String? = null,
    val labelSlot: String = "D0",
)

enum class ScaleTransportType {
    NETWORK,
    USB_SERIAL,
}

data class SyncResult(
    val success: Boolean = false,
    val message: String = "",
    val productCount: Int = 0,
    val sentCount: Int = 0,
    val failedCount: Int = 0,
    val trigger: String = "manual",
    val errors: List<String> = emptyList(),
    val warnings: List<String> = emptyList(),
)

data class ScalePluRecord(
    val pluOrder: Int = 0,
    val pluName: String = "",
    val lfCode: Int = 0,
    val code: String = "",
    val barcodeType: Int = 99,
    val unitPrice: Int = 0,
    val weightUnit: Int = 4,
    val department: Int = 21,
    val shelfDays: Int = 15,
    val labelId: Int = 64,
)

data class DiscoveredScale(
    val ipAddress: String,
    val port: Int = 5001,
    val reachable: Boolean = false,
    val responseMs: Long = 0,
)

data class SaleRecord(
    val pluName: String,
    val lfCode: Long,
    val weight: Double,
    val totalPrice: Double,
    val unitPrice: Double,
    val quantity: Int,
    val saleDate: String?,
)

data class LiveWeightResult(
    val connected: Boolean = false,
    val weightKg: Double? = null,
    val stable: Boolean = false,
    val detail: String = "",
)
