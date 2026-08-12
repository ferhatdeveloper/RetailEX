package com.retailex.terazimanager.data.scale

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbManager
import android.os.Build
import com.hoho.android.usbserial.driver.UsbSerialDriver
import com.hoho.android.usbserial.driver.UsbSerialPort
import com.hoho.android.usbserial.driver.UsbSerialProber
import com.rt.plu.enumrate.ProtTypeEnum
import com.rt.plu.udp.SerialOverUsbClient
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull

data class UsbSerialDeviceInfo(
    val deviceId: String,
    val displayName: String,
    val vendorId: Int,
    val productId: Int,
    val driverName: String,
    val portCount: Int,
)

class UsbSerialManager(private val context: Context) {

    private val usbManager: UsbManager =
        context.getSystemService(Context.USB_SERVICE) as UsbManager

    fun listDevices(): List<UsbSerialDeviceInfo> {
        return UsbSerialProber.getDefaultProber().findAllDrivers(usbManager).flatMap { driver ->
            val device = driver.device
            (0 until driver.ports.size).map { portIndex ->
                UsbSerialDeviceInfo(
                    deviceId = buildDeviceId(device, portIndex),
                    displayName = "${driver.javaClass.simpleName} ${device.deviceName} port $portIndex " +
                        "(VID=0x${device.vendorId.toString(16)} PID=0x${device.productId.toString(16)})",
                    vendorId = device.vendorId,
                    productId = device.productId,
                    driverName = driver.javaClass.simpleName,
                    portCount = driver.ports.size,
                )
            }
        }.distinctBy { it.deviceId }
    }

    suspend fun openSerialClient(
        deviceId: String,
        baudRate: Int = DEFAULT_BAUD_RATE,
        protocol: Int = 2,
        dataBits: Int = UsbSerialPort.DATABITS_8,
        stopBits: Int = UsbSerialPort.STOPBITS_1,
        parity: Int = UsbSerialPort.PARITY_NONE,
    ): Result<SerialOverUsbClient> = withContext(Dispatchers.IO) {
        runCatching {
            val (device, portIndex) = resolveDevice(deviceId)
            val driver = findDriver(device)
                ?: error("USB seri surucu bulunamadi: $deviceId")

            if (!usbManager.hasPermission(device)) {
                val granted = requestPermission(device)
                if (!granted) error("USB izni reddedildi. Lutfen adaptore izin verin.")
            }

            val connection = usbManager.openDevice(device)
                ?: error("USB cihaz acilamadi")

            val port = driver.ports.getOrNull(portIndex)
                ?: error("Port $portIndex bulunamadi")

            port.open(connection)
            port.setParameters(baudRate, dataBits, stopBits, parity)
            port.dtr = true
            port.rts = true

            val prot = if (protocol == 1) ProtTypeEnum.Prot_Rongta1 else ProtTypeEnum.Prot_Rongta2
            SerialOverUsbClient(port, prot)
        }
    }

    private fun resolveDevice(deviceId: String): Pair<UsbDevice, Int> {
        val parts = deviceId.split(":")
        require(parts.size == 4) { "Gecersiz USB cihaz kimligi: $deviceId" }
        val vendorId = parts[0].toInt()
        val productId = parts[1].toInt()
        val androidDeviceId = parts[2].toInt()
        val portIndex = parts[3].toInt()
        val device = usbManager.deviceList.values.firstOrNull {
            it.vendorId == vendorId && it.productId == productId && it.deviceId == androidDeviceId
        } ?: error("USB cihaz bagli degil: $deviceId")
        return device to portIndex
    }

    private fun findDriver(device: UsbDevice): UsbSerialDriver? =
        UsbSerialProber.getDefaultProber().findAllDrivers(usbManager)
            .firstOrNull { it.device.deviceId == device.deviceId }

    private suspend fun requestPermission(device: UsbDevice): Boolean {
        if (usbManager.hasPermission(device)) return true

        val deferred = CompletableDeferred<Boolean>()
        val action = "${context.packageName}.USB_PERMISSION"
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(ctx: Context?, intent: Intent?) {
                if (intent?.action != action) return
                val granted = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)
                deferred.complete(granted)
                runCatching { context.unregisterReceiver(this) }
            }
        }

        val filter = IntentFilter(action)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            @Suppress("UnspecifiedRegisterReceiverFlag")
            context.registerReceiver(receiver, filter)
        }

        val flags = PendingIntent.FLAG_UPDATE_CURRENT or
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0
        val pendingIntent = PendingIntent.getBroadcast(context, 0, Intent(action), flags)
        usbManager.requestPermission(device, pendingIntent)

        return withTimeoutOrNull(PERMISSION_TIMEOUT_MS) { deferred.await() } ?: false
    }

    companion object {
        const val DEFAULT_BAUD_RATE = 9600

        fun buildDeviceId(device: UsbDevice, portIndex: Int = 0): String =
            "${device.vendorId}:${device.productId}:${device.deviceId}:$portIndex"

        private const val PERMISSION_TIMEOUT_MS = 60_000L
    }
}
