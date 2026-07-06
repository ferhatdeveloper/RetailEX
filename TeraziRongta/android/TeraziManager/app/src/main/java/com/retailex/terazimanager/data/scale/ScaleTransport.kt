package com.retailex.terazimanager.data.scale

import com.retailex.terazimanager.domain.models.LiveWeightResult
import com.retailex.terazimanager.domain.models.SaleRecord
import com.retailex.terazimanager.domain.models.ScalePluRecord
import com.retailex.terazimanager.domain.models.SyncResult

interface ScaleTransport {
    val displayName: String
    val isConnected: Boolean

    suspend fun connect(): Result<Unit>
    suspend fun disconnect()
    suspend fun testConnection(): Result<LiveWeightResult>
    suspend fun clearPlu(): Result<Unit>
    suspend fun clearSaleData(): Result<Unit>
    suspend fun readPluRecords(): Result<List<ScalePluRecord>>
    suspend fun writePluRecords(records: List<ScalePluRecord>, clearBeforeSend: Boolean = false): SyncResult
    suspend fun readSaleRecords(): Result<List<SaleRecord>>
}

interface ScaleTransportFactory {
    fun createNetwork(host: String, port: Int, protocol: Int, charsetName: String): ScaleTransport
    fun createUsbSerial(deviceId: String, baudRate: Int, protocol: Int, charsetName: String): ScaleTransport
}
