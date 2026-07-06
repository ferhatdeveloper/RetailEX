package com.rt.plu.udp

import android.util.Log
import com.hoho.android.usbserial.driver.UsbSerialPort
import com.rt.plu.enumrate.ProtTypeEnum

/**
 * Rongta SDK UDPClient uzerinden Rt2Protocol calistirmak icin
 * USB seri port uzerinden ham paket gonder/al.
 *
 * SendHeadCmd uretilen byte dizileri dogrudan RS232 hattina yazilir.
 */
class SerialOverUsbClient(
    private val serialPort: UsbSerialPort,
    protocol: ProtTypeEnum = ProtTypeEnum.Prot_Rongta2,
) : UDPClient(protocol) {

    private val ioLock = Any()

    override fun connect(): Boolean = synchronized(ioLock) {
        runCatching { connectScale() }.getOrElse {
            Log.e(TAG, "USB seri connect hatasi", it)
            false
        }
    }

    override fun sendSync(data: ByteArray): Boolean = synchronized(ioLock) {
        runCatching {
            serialPort.write(data, WRITE_TIMEOUT_MS)
            true
        }.getOrElse {
            Log.e(TAG, "sendSync hatasi", it)
            false
        }
    }

    override fun sendDataSync(data: ByteArray): ByteArray? = synchronized(ioLock) {
        runCatching {
            serialPort.write(data, WRITE_TIMEOUT_MS)
            Thread.sleep(INTER_FRAME_DELAY_MS)
            readDatas()
        }.getOrElse {
            Log.e(TAG, "sendDataSync hatasi", it)
            null
        }
    }

    override fun readDatas(): ByteArray? = synchronized(ioLock) {
        val buffer = ByteArray(PACKET_SIZE)
        var offset = 0
        val deadline = System.currentTimeMillis() + READ_TIMEOUT_MS
        while (System.currentTimeMillis() < deadline && offset < buffer.size) {
            val temp = ByteArray(buffer.size - offset)
            val chunk = serialPort.read(temp, READ_CHUNK_TIMEOUT_MS)
            if (chunk > 0) {
                System.arraycopy(temp, 0, buffer, offset, chunk)
                offset += chunk
                if (offset >= MIN_RESPONSE_SIZE) break
            } else if (offset > 0) {
                break
            }
        }
        if (offset == 0) null else buffer.copyOf(offset)
    }

    override fun closeAll() {
        synchronized(ioLock) {
            runCatching { disConnectScale() }
            runCatching { serialPort.close() }
            super.closeAll()
        }
    }

    companion object {
        private const val TAG = "SerialOverUsbClient"
        private const val PACKET_SIZE = 265
        private const val MIN_RESPONSE_SIZE = 4
        private const val WRITE_TIMEOUT_MS = 3000
        private const val READ_TIMEOUT_MS = 2500
        private const val READ_CHUNK_TIMEOUT_MS = 400
        private const val INTER_FRAME_DELAY_MS = 80L
    }
}
