package com.retailex.terazimanager.data.scale

import com.retailex.terazimanager.config.AppConfig
import com.retailex.terazimanager.domain.helpers.PluJsonMapper
import com.retailex.terazimanager.domain.helpers.ScalePriceHelper
import com.retailex.terazimanager.domain.models.LiveWeightResult
import com.retailex.terazimanager.domain.models.SaleRecord
import com.retailex.terazimanager.domain.models.ScalePluRecord
import com.retailex.terazimanager.domain.models.SyncResult
import com.rt.plu.CallbackListener
import com.rt.plu.bean.PluInfoBean
import com.rt.plu.bean.PluSaleBean
import com.rt.plu.enumrate.LabelIndexEnum
import com.rt.plu.enumrate.ProtTypeEnum
import com.rt.plu.enumrate.WeightUnitEnum
import com.rt.plu.utils.PluManage
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Locale
import kotlin.coroutines.resume

/**
 * Rongta resmi Android PLU SDK (lib_plu) uzerinden terazi iletisimi.
 * Windows rtslabelscale.dll yerine ayni is mantigini PluManage saglar.
 */
class RongtaScaleClient(
    private val host: String,
    private val port: Int,
    private val protocol: Int = 2,
    private val charsetName: String = "GB2312",
    private val codeLen: Int = 10,
    private val decimalDigits: Int = 0,
    private val config: AppConfig? = null,
    private val onLog: ((String) -> Unit)? = null,
) {
    private val pluManage = PluManage()
    private var connected = false

    val isConnected: Boolean get() = connected

    suspend fun connect(): Result<Unit> = withContext(Dispatchers.IO) {
        runCatching {
            configureManage()
            val ok = pluManage.connect(host, port)
            if (!ok) error("Terazi bağlantısı başarısız: $host:$port")
            connected = true
            log("Bağlandı: $host:$port (Protokol $protocol)")
        }
    }

    suspend fun disconnect() = withContext(Dispatchers.IO) {
        runCatching {
            if (connected) {
                pluManage.disConnectScale()
                connected = false
            }
        }
    }

    suspend fun clearPlu(): Result<Unit> = withContext(Dispatchers.IO) {
        runCatching {
            ensureConnected()
            if (!pluManage.clearPludata()) error("PLU temizleme basarisiz")
        }
    }

    suspend fun clearSaleData(): Result<Unit> = withContext(Dispatchers.IO) {
        runCatching {
            ensureConnected()
            if (!pluManage.clearSaledata()) error("Satis verisi temizleme basarisiz")
        }
    }

    suspend fun readPluRecords(): Result<List<ScalePluRecord>> = withContext(Dispatchers.IO) {
        runCatching {
            ensureConnected()
            val list = pluManage.pluInfoList ?: emptyList()
            list.mapIndexedNotNull { index, bean ->
                runCatching { bean.toRecord(index + 1) }
                    .onFailure { log("PLU satir ${index + 1} atlandi: ${it.message}") }
                    .getOrNull()
            }
        }
    }

    suspend fun writePluRecords(
        records: List<ScalePluRecord>,
        clearBeforeSend: Boolean = false,
    ): SyncResult = withContext(Dispatchers.IO) {
        val result = SyncResult(productCount = records.size)
        try {
            ensureConnected()
            if (clearBeforeSend) {
                if (!pluManage.clearPludata()) {
                    result.errors + "PLU temizleme başarısız"
                }
            }

            val beans = ArrayList<PluInfoBean>()
            for (record in records) {
                beans.add(record.toPluInfoBean(config))
            }

            val ok = pluManage.writePluInfo(beans)
            result.copy(
                success = ok,
                sentCount = if (ok) records.size else 0,
                failedCount = if (ok) 0 else records.size,
                message = if (ok) "${records.size} PLU teraziye yazıldı." else "PLU yazma başarısız",
                errors = if (ok) emptyList() else listOf("writePluInfo false"),
            )
        } catch (ex: Exception) {
            result.copy(
                success = false,
                message = ex.message.orEmpty(),
                errors = listOf(ex.message.orEmpty()),
            )
        }
    }

    suspend fun writeProductsFromJson(
        pluJsonList: List<JSONObject>,
        clearBeforeSend: Boolean = false,
    ): SyncResult = withContext(Dispatchers.IO) {
        val records = pluJsonList.mapIndexed { index, json -> PluJsonMapper.toRecord(json, index + 1) }
        writePluRecords(records, clearBeforeSend)
    }

    suspend fun readSaleRecords(): Result<List<SaleRecord>> = withContext(Dispatchers.IO) {
        try {
            ensureConnected()
            suspendCancellableCoroutine { cont ->
                val sales = mutableListOf<SaleRecord>()
                val listener = object : CallbackListener {
                    override fun onSaleDataOut(bean: PluSaleBean) {
                        runCatching { sales.add(bean.toSaleRecord()) }
                    }
                }
                try {
                    val ok = pluManage.getPluSales(listener)
                    if (!ok) cont.resume(Result.failure(IllegalStateException("Satis verisi okunamadi")))
                    else cont.resume(Result.success(sales))
                } catch (ex: Exception) {
                    cont.resume(Result.failure(ex))
                }
            }
        } catch (ex: Exception) {
            Result.failure(ex)
        }
    }

    suspend fun testConnection(): Result<LiveWeightResult> = withContext(Dispatchers.IO) {
        connect().map {
            LiveWeightResult(
                connected = true,
                weightKg = null,
                stable = false,
                detail = "Bağlantı başarılı ($host:$port). Ağırlık okuma Android SDK'da sınırlı; terazi ekranından doğrulayın.",
            )
        }
    }

    private fun configureManage() {
        val prot = if (protocol == 1) ProtTypeEnum.Prot_Rongta1 else ProtTypeEnum.Prot_Rongta2
        pluManage.setRTProtocol(prot)
        PluManage.setCharsetName(charsetName)
        pluManage.setCodeLen(codeLen)
        PluManage.setLfcodeLen(6)
        pluManage.setDecimalDigits(decimalDigits)
        PluManage.setIsShowCmd(false)
    }

    private fun ensureConnected() {
        if (!connected) error("Terazi bağlı değil")
    }

    private fun log(message: String) {
        onLog?.invoke(message)
    }
}

private fun PluInfoBean.toRecord(order: Int): ScalePluRecord = ScalePluRecord(
    pluOrder = order,
    pluName = pluName.orEmpty(),
    lfCode = runCatching { getpluLfcode()?.toInt() ?: 0 }.getOrDefault(0),
    code = pluItemNum.orEmpty(),
    barcodeType = pluBarcodeType,
    unitPrice = ScalePriceHelper.toUnitPrice(pluUnitPrice),
    weightUnit = when (pluWeightUnit) {
        WeightUnitEnum.UNIT_G -> 1
        WeightUnitEnum.UNIT_KG -> 4
        else -> 4
    },
    department = pluDepartment,
    shelfDays = pluShelfDays,
    labelId = pluLabelIndexEnum?.ordinal ?: 64,
)

private fun ScalePluRecord.toPluInfoBean(config: AppConfig?): PluInfoBean {
    val bean = PluInfoBean()
    bean.setpluLfcode(lfCode.toLong())
    bean.pluName = pluName
    bean.pluName2 = ""
    bean.pluItemNum = code
    val devicePrice = config?.let {
        ScalePriceHelper.toDeviceUnitPrice(
            unitPrice,
            it.devicePriceDecimalPosition,
            it.compensateDevicePriceDecimal && !it.sendFunctionSetOnSync,
        )
    } ?: unitPrice
    bean.pluUnitPrice = devicePrice.toDouble()
    bean.pluWeightUnit = weightUnitToEnum(weightUnit)
    bean.pluShelfDays = shelfDays
    bean.pluBarcodeType = barcodeType
    bean.pluDepartment = department
    bean.pluLabelIndexEnum = LabelIndexEnum.D0
    bean.pluMsg1 = 0
    bean.pluMsg2 = 0
    bean.qtyUnit = 0
    bean.pluTareWeight = 0.0
    bean.setPlupackageWeight(0.0)
    bean.tolerance = 0
    bean.setpluDiscount(0)
    bean.salemode = 0
    bean.pricemode = 3
    return bean
}

private fun weightUnitToEnum(value: Int): WeightUnitEnum = when (value) {
    1 -> WeightUnitEnum.UNIT_G
    4 -> WeightUnitEnum.UNIT_KG
    else -> WeightUnitEnum.UNIT_KG
}

private fun PluSaleBean.toSaleRecord(): SaleRecord {
    val formatter = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault())
    return SaleRecord(
        pluName = pluName.orEmpty(),
        lfCode = llfCode,
        weight = weight,
        totalPrice = sumPrice,
        unitPrice = pluUnitPrice,
        quantity = quantity,
        saleDate = saleDate?.let { formatter.format(it) },
    )
}

class NetworkScaleTransport(
    private val host: String,
    private val port: Int,
    private val client: RongtaScaleClient,
) : ScaleTransport {
    override val displayName: String = "TCP $host:$port"
    override val isConnected: Boolean get() = client.isConnected

    override suspend fun connect(): Result<Unit> = client.connect()
    override suspend fun disconnect() {
        client.disconnect()
    }
    override suspend fun testConnection(): Result<LiveWeightResult> = client.testConnection()
    override suspend fun clearPlu(): Result<Unit> = client.clearPlu()
    override suspend fun clearSaleData(): Result<Unit> = client.clearSaleData()
    override suspend fun readPluRecords(): Result<List<ScalePluRecord>> = client.readPluRecords()
    override suspend fun writePluRecords(records: List<ScalePluRecord>, clearBeforeSend: Boolean): SyncResult =
        client.writePluRecords(records, clearBeforeSend)

    override suspend fun readSaleRecords(): Result<List<SaleRecord>> = client.readSaleRecords()
}

class DefaultScaleTransportFactory(
    private val config: AppConfig,
    private val context: android.content.Context? = null,
    private val onLog: ((String) -> Unit)? = null,
) : ScaleTransportFactory {
    override fun createNetwork(host: String, port: Int, protocol: Int, charsetName: String): ScaleTransport {
        val client = RongtaScaleClient(
            host = host,
            port = port,
            protocol = protocol,
            charsetName = charsetName,
            decimalDigits = if (config.sendFunctionSetOnSync) 0 else config.devicePriceDecimalPosition,
            config = config,
            onLog = onLog,
        )
        return NetworkScaleTransport(host, port, client)
    }

    override fun createUsbSerial(deviceId: String, baudRate: Int, protocol: Int, charsetName: String): ScaleTransport {
        val ctx = context ?: error("USB transport icin Android Context gerekli")
        return UsbSerialScaleTransport(ctx, deviceId, baudRate, protocol, charsetName, config, onLog)
    }

    fun createForScale(scale: com.retailex.terazimanager.domain.models.ScaleDeviceConfig): ScaleTransport =
        when (scale.transportType) {
            com.retailex.terazimanager.domain.models.ScaleTransportType.USB_SERIAL -> {
                val deviceId = scale.usbDeviceId?.takeIf { it.isNotBlank() }
                    ?: error("USB terazi icin cihaz secilmedi")
                createUsbSerial(
                    deviceId = deviceId,
                    baudRate = scale.usbBaudRate,
                    protocol = config.rongtaProtocol,
                    charsetName = config.charsetName,
                )
            }
            com.retailex.terazimanager.domain.models.ScaleTransportType.NETWORK ->
                createNetwork(
                    host = scale.ipAddress,
                    port = scale.port,
                    protocol = config.rongtaProtocol,
                    charsetName = config.charsetName,
                )
        }
}
