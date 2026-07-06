package com.retailex.terazimanager.data.scale

import android.content.Context
import com.retailex.terazimanager.config.AppConfig
import com.retailex.terazimanager.domain.models.LiveWeightResult
import com.retailex.terazimanager.domain.models.SaleRecord
import com.retailex.terazimanager.domain.models.ScalePluRecord
import com.retailex.terazimanager.domain.models.SyncResult

class UsbSerialScaleTransport(
    private val context: Context,
    private val deviceId: String,
    private val baudRate: Int,
    private val protocol: Int,
    private val charsetName: String,
    private val config: AppConfig?,
    private val onLog: ((String) -> Unit)? = null,
) : ScaleTransport {
    private val client = SerialRongtaClient(
        context = context,
        deviceId = deviceId,
        baudRate = baudRate,
        protocol = protocol,
        charsetName = charsetName,
        decimalDigits = if (config?.sendFunctionSetOnSync == true) 0 else config?.devicePriceDecimalPosition ?: 0,
        config = config,
        onLog = onLog,
    )

    override val displayName: String = "USB $deviceId @ $baudRate"
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
