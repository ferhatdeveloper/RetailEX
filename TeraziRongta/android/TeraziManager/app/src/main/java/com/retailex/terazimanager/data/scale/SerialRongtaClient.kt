package com.retailex.terazimanager.data.scale

import android.content.Context
import com.retailex.terazimanager.config.AppConfig
import com.retailex.terazimanager.domain.helpers.PluJsonMapper
import com.retailex.terazimanager.domain.helpers.ScalePriceHelper
import com.retailex.terazimanager.domain.models.LiveWeightResult
import com.retailex.terazimanager.domain.models.SaleRecord
import com.retailex.terazimanager.domain.models.ScalePluRecord
import com.retailex.terazimanager.domain.models.SyncResult
import com.rt.plu.CallbackListener
import com.rt.plu.bean.HotKeybean
import com.rt.plu.bean.PluInfoBean
import com.rt.plu.bean.PluSaleBean
import com.rt.plu.enumrate.LabelIndexEnum
import com.rt.plu.enumrate.ProtTypeEnum
import com.rt.plu.enumrate.WeightUnitEnum
import com.rt.plu.udp.SerialOverUsbClient
import com.rt.plu.utils.PluManage
import com.rt.plu.utils.Rt2Protocol
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import java.text.SimpleDateFormat
import java.util.Locale
import kotlin.coroutines.resume

/**
 * USB/RS232 uzerinden Rongta Rt2Protocol ile terazi iletisimi.
 * PluManage.connect() TCP/UDP kullandigi icin Rt2Protocol + SerialOverUsbClient kullanilir.
 */
class SerialRongtaClient(
    private val context: Context,
    private val deviceId: String,
    private val baudRate: Int = UsbSerialManager.DEFAULT_BAUD_RATE,
    private val protocol: Int = 2,
    private val charsetName: String = "GB2312",
    private val codeLen: Int = 10,
    private val decimalDigits: Int = 0,
    private val config: AppConfig? = null,
    private val onLog: ((String) -> Unit)? = null,
) {
    private var serialClient: SerialOverUsbClient? = null
    private var connected = false

    val isConnected: Boolean get() = connected

    suspend fun connect(): Result<Unit> = withContext(Dispatchers.IO) {
        runCatching {
            configureGlobals()
            val manager = UsbSerialManager(context)
            val client = manager.openSerialClient(deviceId, baudRate, protocol).getOrThrow()
            if (!client.connect()) {
                client.closeAll()
                error("USB seri handshake basarisiz ($deviceId @ $baudRate)")
            }
            serialClient = client
            connected = true
            log("USB baglandi: $deviceId ($baudRate baud, Protokol $protocol)")
        }
    }

    suspend fun disconnect() = withContext(Dispatchers.IO) {
        runCatching {
            serialClient?.closeAll()
            serialClient = null
            connected = false
        }
    }

    suspend fun clearPlu(): Result<Unit> = withContext(Dispatchers.IO) {
        runCatching {
            ensureConnected()
            if (!Rt2Protocol.clearPludata(serialClient!!)) error("PLU temizleme basarisiz")
        }
    }

    suspend fun clearSaleData(): Result<Unit> = withContext(Dispatchers.IO) {
        runCatching {
            ensureConnected()
            if (!Rt2Protocol.clearSaledata(serialClient!!)) error("Satis verisi temizleme basarisiz")
        }
    }

    suspend fun readPluRecords(): Result<List<ScalePluRecord>> = withContext(Dispatchers.IO) {
        runCatching {
            ensureConnected()
            val list = Rt2Protocol.getPluInfoList(serialClient!!) ?: emptyList()
            list.mapIndexedNotNull { index, bean ->
                runCatching { bean.toRecord(index + 1) }.getOrNull()
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
            val client = serialClient!!
            if (clearBeforeSend && !Rt2Protocol.clearPludata(client)) {
                return@withContext result.copy(
                    success = false,
                    message = "PLU temizleme basarisiz",
                    errors = listOf("clearPludata false"),
                )
            }
            val beans = ArrayList<PluInfoBean>()
            records.forEach { beans.add(it.toPluInfoBean(config)) }
            val ok = Rt2Protocol.DownloadPlubyRT2(beans, client)
            result.copy(
                success = ok,
                sentCount = if (ok) records.size else 0,
                failedCount = if (ok) 0 else records.size,
                message = if (ok) "${records.size} PLU USB uzerinden yazildi." else "PLU yazma basarisiz",
                errors = if (ok) emptyList() else listOf("DownloadPlubyRT2 false"),
            )
        } catch (ex: Exception) {
            result.copy(success = false, message = ex.message.orEmpty(), errors = listOf(ex.message.orEmpty()))
        }
    }

    suspend fun readSaleRecords(): Result<List<SaleRecord>> = withContext(Dispatchers.IO) {
        ensureConnected()
        suspendCancellableCoroutine { cont ->
            val sales = mutableListOf<SaleRecord>()
            val listener = object : CallbackListener {
                override fun onSaleDataOut(bean: PluSaleBean) {
                    sales.add(bean.toSaleRecord())
                }
            }
            try {
                val ok = Rt2Protocol.getPluSales(serialClient!!, listener)
                if (!ok) cont.resume(Result.failure(IllegalStateException("Satis verisi okunamadi")))
                else cont.resume(Result.success(sales))
            } catch (ex: Exception) {
                cont.resume(Result.failure(ex))
            }
        }
    }

    suspend fun readHotkeys(): Result<List<HotKeybean>> = withContext(Dispatchers.IO) {
        ensureConnected()
        runCatching {
            Rt2Protocol.getPluHotKey(serialClient!!) ?: emptyList()
        }
    }

    suspend fun testConnection(): Result<LiveWeightResult> = withContext(Dispatchers.IO) {
        connect().map {
            LiveWeightResult(
                connected = true,
                weightKg = null,
                stable = false,
                detail = "USB seri baglanti basarili ($deviceId @ $baudRate baud).",
            )
        }
    }

    private fun configureGlobals() {
        val manage = PluManage()
        manage.setCodeLen(codeLen)
        manage.setDecimalDigits(decimalDigits)
        PluManage.setCharsetName(charsetName)
        PluManage.setLfcodeLen(6)
        PluManage.setIsShowCmd(false)
    }

    private fun ensureConnected() {
        if (!connected || serialClient == null) error("USB terazi bagli degil")
    }

    private fun log(message: String) {
        onLog?.invoke(message)
    }
}

private fun PluInfoBean.toRecord(order: Int): ScalePluRecord = ScalePluRecord(
    pluOrder = order,
    pluName = pluName.orEmpty(),
    lfCode = getpluLfcode()?.toInt() ?: 0,
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
    bean.pluWeightUnit = when (weightUnit) {
        1 -> WeightUnitEnum.UNIT_G
        else -> WeightUnitEnum.UNIT_KG
    }
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
