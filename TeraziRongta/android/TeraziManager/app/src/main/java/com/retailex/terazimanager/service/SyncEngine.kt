package com.retailex.terazimanager.service

import com.retailex.terazimanager.config.AppConfig
import com.retailex.terazimanager.data.api.RetailExApiClient
import com.retailex.terazimanager.data.scale.DefaultScaleTransportFactory
import com.retailex.terazimanager.data.scale.ScaleTransport
import com.retailex.terazimanager.domain.helpers.PluJsonMapper
import com.retailex.terazimanager.domain.helpers.ScalePriceHelper
import com.retailex.terazimanager.domain.models.ScaleDeviceConfig
import com.retailex.terazimanager.domain.models.ScalePluRecord
import com.retailex.terazimanager.domain.models.ScaleTransportType
import com.retailex.terazimanager.domain.models.SyncResult
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class SyncEngine(
    private var config: AppConfig,
    private val appContext: android.content.Context? = null,
    private val apiClient: RetailExApiClient = RetailExApiClient(),
    private val onLog: (String) -> Unit = {},
) {
    fun reloadConfig(newConfig: AppConfig) {
        config = newConfig
    }

    suspend fun runSync(trigger: String = "manual"): SyncResult = withContext(Dispatchers.IO) {
        log("=== Senkron başladı ($trigger): ${timestamp()} ===")

        if (!config.isReadyForSync()) {
            val msg = "Yapılandırma eksik: Kiracı kodu ve en az bir aktif terazi gerekli."
            log(msg)
            return@withContext SyncResult(message = msg, trigger = trigger)
        }

        config.refreshProductsPathFromSelection()
        val scales = config.getActiveScales()
        if (scales.isEmpty()) {
            val msg = "Aktif terazi yok."
            log(msg)
            return@withContext SyncResult(message = msg, trigger = trigger)
        }

        val products = try {
            apiClient.fetchScaleProducts(config)
        } catch (ex: Exception) {
            val msg = "API hatası: ${ex.message}"
            log(msg)
            return@withContext SyncResult(success = false, message = msg, trigger = trigger, errors = listOf(msg))
        }

        if (products.isEmpty()) {
            val msg = "Gönderilecek tartılı ürün bulunamadı."
            log(msg)
            return@withContext SyncResult(message = msg, trigger = trigger)
        }

        log("${products.size} ürün API'den alındı.")

        val factory = DefaultScaleTransportFactory(config, appContext, onLog)
        var aggregate = SyncResult(success = true, trigger = trigger, productCount = products.size)
        var totalSent = 0
        var totalFailed = 0

        for (scale in scales) {
            val transportLabel = when (scale.transportType) {
                ScaleTransportType.USB_SERIAL -> "USB ${scale.usbDeviceId}"
                ScaleTransportType.NETWORK -> "${scale.ipAddress}:${scale.port}"
            }
            log("${scale.name} ($transportLabel): ${products.size} urun gonderiliyor...")
            val transport = factory.createForScale(scale)

            try {
                val connected = transport.connect()
                if (connected.isFailure) {
                    val msg = "${scale.name}: ${connected.exceptionOrNull()?.message}"
                    log(msg)
                    aggregate = aggregate.copy(success = false, errors = aggregate.errors + msg)
                } else {
                    if (config.clearBeforeSend) {
                        transport.clearPlu()
                    }

                    val existing = if (config.mergeExistingPlu && !config.clearBeforeSend) {
                        transport.readPluRecords().getOrNull().orEmpty()
                    } else {
                        emptyList()
                    }

                    val existingByBarcode = existing.associateBy { it.code.trim().lowercase() }
                    val existingByLf = existing.associateBy { it.lfCode }

                    val pluRecords = mutableListOf<ScalePluRecord>()
                    products.forEachIndexed { index, product ->
                        val json = PluJsonMapper.mapProductToPluJson(
                            product,
                            index + 1,
                            config.lfCodeBase,
                            labelId = 64,
                            defaults = config.getPluDefaults(),
                        )
                        val barcodeKey = PluJsonMapper.getPluBarcode(json).lowercase()
                        val existingRecord = existingByBarcode[barcodeKey]
                            ?: existingByLf[json.optInt("LFCode")]

                        if (existingRecord != null) {
                            json.put("LFCode", existingRecord.lfCode)
                        }

                        val apiUnitPrice = ScalePriceHelper.toUnitPrice(product.price)
                        val devicePrice = ScalePriceHelper.toDeviceUnitPrice(
                            apiUnitPrice,
                            config.devicePriceDecimalPosition,
                            config.compensateDevicePriceDecimal,
                        )
                        json.put("UnitPrice", devicePrice)

                        pluRecords.add(PluJsonMapper.toRecord(json, index + 1))
                    }

                    val result = transport.writePluRecords(pluRecords, config.clearBeforeSend)
                    totalSent += result.sentCount
                    totalFailed += result.failedCount
                    log("  -> ${result.message}")

                    if (!result.success) {
                        aggregate = aggregate.copy(
                            success = false,
                            errors = aggregate.errors + "${scale.name}: ${result.message}",
                        )
                    }
                }
            } finally {
                transport.disconnect()
            }
        }

        val message = if (aggregate.success) {
            "${scales.size} teraziye ${totalSent} ürün gönderildi."
        } else {
            "Bazı terazilere gönderim başarısız."
        }

        log(message)
        aggregate.copy(
            message = message,
            sentCount = totalSent,
            failedCount = totalFailed,
        )
    }

    suspend fun readPluFromScale(scale: ScaleDeviceConfig): Result<List<ScalePluRecord>> =
        withTransport(scale) { transport ->
            transport.readPluRecords()
        }

    suspend fun sendPluToScale(scale: ScaleDeviceConfig, records: List<ScalePluRecord>, clear: Boolean): SyncResult =
        withContext(Dispatchers.IO) {
            withTransport(scale) { transport ->
                Result.success(transport.writePluRecords(records, clear))
            }.fold(
                onSuccess = { it },
                onFailure = { SyncResult(message = it.message.orEmpty(), errors = listOf(it.message.orEmpty())) },
            )
        }

    private suspend fun <T> withTransport(
        scale: ScaleDeviceConfig,
        block: suspend (ScaleTransport) -> Result<T>,
    ): Result<T> = withContext(Dispatchers.IO) {
        val factory = DefaultScaleTransportFactory(config, appContext, onLog)
        val transport = factory.createForScale(scale)
        try {
            transport.connect().fold(
                onSuccess = { block(transport) },
                onFailure = { Result.failure(it) },
            )
        } catch (ex: Exception) {
            log("Transport hatasi (${scale.name}): ${ex.message}")
            Result.failure(ex)
        } finally {
            runCatching { transport.disconnect() }
        }
    }

    private fun log(message: String) = onLog(message)

    private fun timestamp(): String =
        SimpleDateFormat("dd.MM.yyyy HH:mm:ss", Locale.getDefault()).format(Date())
}
