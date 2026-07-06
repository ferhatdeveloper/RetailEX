package com.retailex.terazimanager.data.discovery

import com.retailex.terazimanager.domain.models.DiscoveredScale
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.withContext
import java.net.Inet4Address
import java.net.InetSocketAddress
import java.net.NetworkInterface
import java.net.Socket

object LanScaleScanner {
    private val defaultPorts = listOf(5001, 9100, 4001)

    suspend fun scanLocalSubnet(
        ports: List<Int> = defaultPorts,
        timeoutMs: Int = 350,
        onProgress: ((String) -> Unit)? = null,
    ): List<DiscoveredScale> = withContext(Dispatchers.IO) {
        val localIp = findLocalIpv4() ?: run {
            onProgress?.invoke("Yerel IP bulunamadı")
            return@withContext emptyList()
        }
        onProgress?.invoke("Alt ağ taranıyor: ${subnetPrefix(localIp)}.x")

        val prefix = subnetPrefix(localIp)
        val candidates = (1..254).map { "$prefix.$it" }

        coroutineScope {
            candidates.flatMap { ip ->
                ports.map { port ->
                    async {
                        probe(ip, port, timeoutMs)
                    }
                }
            }.awaitAll().filterNotNull().distinctBy { "${it.ipAddress}:${it.port}" }
        }.sortedBy { it.ipAddress }
    }

    suspend fun probeHost(ip: String, port: Int = 5001, timeoutMs: Int = 1500): DiscoveredScale? =
        withContext(Dispatchers.IO) { probe(ip, port, timeoutMs) }

    private fun probe(ip: String, port: Int, timeoutMs: Int): DiscoveredScale? {
        val start = System.currentTimeMillis()
        return try {
            Socket().use { socket ->
                socket.connect(InetSocketAddress(ip, port), timeoutMs)
                val elapsed = System.currentTimeMillis() - start
                DiscoveredScale(ipAddress = ip, port = port, reachable = true, responseMs = elapsed)
            }
        } catch (_: Exception) {
            null
        }
    }

    private fun findLocalIpv4(): String? {
        val interfaces = NetworkInterface.getNetworkInterfaces()?.toList().orEmpty()
        for (intf in interfaces) {
            if (!intf.isUp || intf.isLoopback) continue
            for (addr in intf.inetAddresses) {
                if (addr is Inet4Address && !addr.isLoopbackAddress) {
                    return addr.hostAddress
                }
            }
        }
        return null
    }

    private fun subnetPrefix(ip: String): String {
        val parts = ip.split('.')
        return if (parts.size == 4) "${parts[0]}.${parts[1]}.${parts[2]}" else ip
    }
}
