package com.retailex.terazimanager.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CloudSync
import androidx.compose.material.icons.filled.Devices
import androidx.compose.material.icons.filled.ListAlt
import androidx.compose.material.icons.filled.Scale
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.retailex.terazimanager.config.ScaleDeviceConfigDto
import com.retailex.terazimanager.domain.models.ScaleTransportType

enum class TeraziTab(val label: String) {
    SYNC("Senkron"),
    DEVICES("Cihazlar"),
    SCALE("Terazi"),
    SETTINGS("Ayarlar"),
    LOG("Log"),
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TeraziAppRoot(viewModel: TeraziViewModel = viewModel()) {
    val state by viewModel.state.collectAsState()
    var tab by remember { mutableStateOf(TeraziTab.SYNC) }

    Scaffold(
        topBar = {
            TopAppBar(title = { Text("RetailEX TeraziManager") })
        },
        bottomBar = {
            NavigationBar {
                TeraziTab.entries.forEach { item ->
                    NavigationBarItem(
                        selected = tab == item,
                        onClick = { tab = item },
                        icon = {
                            Icon(
                                when (item) {
                                    TeraziTab.SYNC -> Icons.Default.CloudSync
                                    TeraziTab.DEVICES -> Icons.Default.Devices
                                    TeraziTab.SCALE -> Icons.Default.Scale
                                    TeraziTab.SETTINGS -> Icons.Default.Settings
                                    TeraziTab.LOG -> Icons.Default.ListAlt
                                },
                                contentDescription = item.label,
                            )
                        },
                        label = { Text(item.label) },
                    )
                }
            }
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .padding(padding)
                .fillMaxSize()
                .padding(16.dp),
        ) {
            if (state.isBusy) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    CircularProgressIndicator(modifier = Modifier.padding(end = 8.dp))
                    Text(state.statusMessage)
                }
                Spacer(Modifier.height(8.dp))
            } else if (state.statusMessage.isNotBlank()) {
                Text(state.statusMessage, style = MaterialTheme.typography.bodyMedium)
                Spacer(Modifier.height(8.dp))
            }

            when (tab) {
                TeraziTab.SYNC -> SyncScreen(state, viewModel)
                TeraziTab.DEVICES -> DevicesScreen(state, viewModel)
                TeraziTab.SCALE -> ScaleOpsScreen(state, viewModel)
                TeraziTab.SETTINGS -> SettingsScreen(state, viewModel)
                TeraziTab.LOG -> LogScreen(state, viewModel)
            }
        }
    }
}

@Composable
private fun SyncScreen(state: TeraziUiState, viewModel: TeraziViewModel) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("RetailEX API'den tartılı ürünleri terazilere gönderir.", style = MaterialTheme.typography.bodyMedium)
        Text("Senkron: tum aktif terazilere gonderilir.", style = MaterialTheme.typography.bodySmall)
        Button(onClick = { viewModel.testApi() }, modifier = Modifier.fillMaxWidth()) {
            Text("API Bağlantısını Test Et")
        }
        Button(onClick = { viewModel.runSync() }, modifier = Modifier.fillMaxWidth()) {
            Text("Senkronizasyonu Başlat")
        }
        state.lastSyncResult?.let { result ->
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(12.dp)) {
                    Text("Sonuç: ${if (result.success) "OK" else "HATA"}")
                    Text(result.message)
                    Text("Gönderilen: ${result.sentCount} / ${result.productCount}")
                    result.errors.forEach { Text("• $it", color = MaterialTheme.colorScheme.error) }
                }
            }
        }
    }
}

@Composable
private fun DevicesScreen(state: TeraziUiState, viewModel: TeraziViewModel) {
    val scroll = rememberScrollState()
    var manualName by remember { mutableStateOf("") }
    var manualIp by remember { mutableStateOf("") }
    var manualPort by remember { mutableStateOf("5001") }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(scroll),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(
            "Kayitli: ${state.config.scales.size} cihaz · Aktif: ${state.config.getActiveScales().size}",
            style = MaterialTheme.typography.bodyMedium,
        )
        Button(onClick = { viewModel.scanLan() }, modifier = Modifier.fillMaxWidth()) {
            Text("LAN Terazi Tara (5001/9100/4001)")
        }
        Button(onClick = { viewModel.refreshUsbDevices() }, modifier = Modifier.fillMaxWidth()) {
            Text("USB Seri Cihazlari Tara")
        }

        Text("Manuel TCP terazi ekle", style = MaterialTheme.typography.titleSmall)
        OutlinedTextField(
            value = manualName,
            onValueChange = { manualName = it },
            label = { Text("Ad (opsiyonel)") },
            modifier = Modifier.fillMaxWidth(),
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(
                value = manualIp,
                onValueChange = { manualIp = it },
                label = { Text("IP") },
                modifier = Modifier.weight(1f),
            )
            OutlinedTextField(
                value = manualPort,
                onValueChange = { manualPort = it },
                label = { Text("Port") },
                modifier = Modifier.weight(0.5f),
            )
        }
        Button(
            onClick = {
                viewModel.addManualNetworkScale(
                    manualName,
                    manualIp,
                    manualPort.toIntOrNull() ?: 5001,
                )
            },
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text("Manuel Ekle")
        }

        Text("Kayitli teraziler", style = MaterialTheme.typography.titleMedium)
        if (state.config.scales.isEmpty()) {
            Text("Henuz terazi eklenmedi.")
        }
        state.config.scales.forEachIndexed { index, scaleDto ->
            val scale = scaleDto.toModel(state.config.defaultScalePort, state.config.usbBaudRate)
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(scale.name, style = MaterialTheme.typography.titleSmall)
                    when (scale.transportType) {
                        ScaleTransportType.USB_SERIAL -> {
                            Text("Baglanti: USB / RS232")
                            Text("Cihaz: ${scale.usbDeviceId ?: "-"}")
                            Text("Baud: ${scale.usbBaudRate}")
                        }
                        ScaleTransportType.NETWORK -> {
                            Text("Baglanti: TCP / LAN")
                            Text("Adres: ${scale.ipAddress}:${scale.port}")
                        }
                    }
                    Text(
                        if (scale.enabled) "Durum: Aktif" else "Durum: Pasif",
                        color = if (scale.enabled) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error,
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        FilterChip(
                            selected = state.selectedScaleIndex == index,
                            onClick = { viewModel.selectScale(index) },
                            label = { Text(if (state.selectedScaleIndex == index) "Secili" else "Sec") },
                        )
                        OutlinedButton(onClick = { viewModel.toggleScaleEnabled(index) }) {
                            Text(if (scale.enabled) "Pasif Yap" else "Aktif Yap")
                        }
                        OutlinedButton(onClick = { viewModel.removeScale(index) }) {
                            Text("Sil")
                        }
                    }
                }
            }
        }

        Text("Kesfedilen LAN cihazlari", style = MaterialTheme.typography.titleMedium)
        if (state.discoveredScales.isEmpty()) {
            Text("Henuz LAN cihazi bulunamadi.")
        }
        state.discoveredScales.forEach { device ->
            Card(modifier = Modifier.fillMaxWidth()) {
                Row(
                    Modifier.fillMaxWidth().padding(12.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column {
                        Text(device.ipAddress)
                        Text("Port ${device.port} · ${device.responseMs}ms")
                    }
                    Button(onClick = { viewModel.addScaleFromDiscovery(device) }) {
                        Text("Ekle")
                    }
                }
            }
        }

        Text("USB RS232 adaptorleri", style = MaterialTheme.typography.titleMedium)
        if (state.usbDevices.isEmpty()) {
            Text("USB cihaz yok. OTG kablo + FTDI/CH340/CP2102 adaptör takin.")
        }
        state.usbDevices.forEach { device ->
            Card(modifier = Modifier.fillMaxWidth()) {
                Row(
                    Modifier.fillMaxWidth().padding(12.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(device.driverName, style = MaterialTheme.typography.titleSmall)
                        Text(device.displayName, style = MaterialTheme.typography.bodySmall)
                    }
                    Button(onClick = { viewModel.addScaleFromUsb(device) }) {
                        Text("Ekle")
                    }
                }
            }
        }
    }
}

@Composable
private fun ScaleOpsScreen(state: TeraziUiState, viewModel: TeraziViewModel) {
    val scroll = rememberScrollState()
    val scales = state.config.getConfiguredScales()
    val scale = scales.getOrNull(state.selectedScaleIndex)
    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(scroll),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(
            scale?.let {
                val mode = when (it.transportType) {
                    ScaleTransportType.USB_SERIAL -> "USB"
                    ScaleTransportType.NETWORK -> "TCP ${it.ipAddress}"
                }
                "Secili: ${it.name} ($mode)"
            } ?: "Terazi secilmedi — Cihazlar sekmesinden ekleyin",
            style = MaterialTheme.typography.titleMedium,
        )
        if (scales.size > 1) {
            Text("${scales.size} kayitli cihaz — Senkron tum aktif terazilere gider", style = MaterialTheme.typography.bodySmall)
        }
        Button(onClick = { viewModel.testScaleConnection() }, modifier = Modifier.fillMaxWidth()) {
            Text("Baglantiyi Test Et")
        }
        Button(onClick = { viewModel.readPluFromScale() }, modifier = Modifier.fillMaxWidth()) {
            Text("PLU Oku")
        }
        Button(onClick = { viewModel.clearPluOnScale() }, modifier = Modifier.fillMaxWidth()) {
            Text("PLU Verisini Temizle")
        }
        Button(onClick = { viewModel.readSaleReport() }, modifier = Modifier.fillMaxWidth()) {
            Text("Satis Raporu Oku")
        }

        Text("Okunan PLU: ${state.pluRecords.size}", style = MaterialTheme.typography.titleSmall)
        state.pluRecords.take(50).forEach { plu ->
            Text("${plu.lfCode} · ${plu.pluName} · ${plu.unitPrice} · ${plu.code}")
        }

        if (state.saleRecords.isNotEmpty()) {
            Text("Satis ozeti (${state.saleRecords.size} kayit)", style = MaterialTheme.typography.titleSmall)
            state.dailySaleSummaries.take(5).forEach { day ->
                Text("${day.dateLabel}: ${day.lineCount} satir, ${"%.2f".format(day.totalAmount)} TL")
            }
            state.productSaleSummaries.take(5).forEach { product ->
                Text("${product.pluName}: ${"%.3f".format(product.totalWeight)} kg, ${"%.2f".format(product.totalAmount)} TL")
            }
        }
    }
}

@Composable
private fun SettingsScreen(state: TeraziUiState, viewModel: TeraziViewModel) {
    var apiUrl by remember(state.config.apiBaseUrl) { mutableStateOf(state.config.apiBaseUrl) }
    var tenant by remember(state.config.tenantCode) { mutableStateOf(state.config.tenantCode) }
    var token by remember(state.config.apiToken) { mutableStateOf(state.config.apiToken) }
    var firmNr by remember(state.config.firmNr) { mutableStateOf(state.config.firmNr) }
    var scaleIp by remember(state.config.scaleIp) { mutableStateOf(state.config.scaleIp) }
    var port by remember(state.config.defaultScalePort) { mutableStateOf(state.config.defaultScalePort.toString()) }
    var baud by remember(state.config.usbBaudRate) { mutableStateOf(state.config.usbBaudRate.toString()) }
    var compensate by remember(state.config.compensateDevicePriceDecimal) {
        mutableStateOf(state.config.compensateDevicePriceDecimal)
    }

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        OutlinedTextField(value = apiUrl, onValueChange = { apiUrl = it }, label = { Text("API URL") }, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(value = tenant, onValueChange = { tenant = it }, label = { Text("Kiracı Kodu") }, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(value = token, onValueChange = { token = it }, label = { Text("API Token") }, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(value = firmNr, onValueChange = { firmNr = it }, label = { Text("Firma No") }, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(value = scaleIp, onValueChange = { scaleIp = it }, label = { Text("Terazi IP") }, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(value = port, onValueChange = { port = it }, label = { Text("Port (5001)") }, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(value = baud, onValueChange = { baud = it }, label = { Text("USB Baud (9600)") }, modifier = Modifier.fillMaxWidth())
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Fiyat telafisi (x100)")
            Switch(checked = compensate, onCheckedChange = { compensate = it })
        }
        Button(
            onClick = {
                viewModel.updateConfig { cfg ->
                    cfg.apiBaseUrl = apiUrl.trim()
                    cfg.tenantCode = tenant.trim()
                    cfg.apiToken = token.trim()
                    cfg.firmNr = firmNr.trim()
                    cfg.scaleIp = scaleIp.trim()
                    cfg.defaultScalePort = port.toIntOrNull() ?: 5001
                    cfg.usbBaudRate = baud.toIntOrNull() ?: 9600
                    cfg.compensateDevicePriceDecimal = compensate
                    if (cfg.scales.isEmpty() && scaleIp.isNotBlank()) {
                        cfg.scales.add(
                            ScaleDeviceConfigDto(
                                id = cfg.scaleId.ifBlank { "terazi-1" },
                                name = "Terazi 1",
                                ipAddress = scaleIp.trim(),
                                port = cfg.defaultScalePort,
                                enabled = true,
                            ),
                        )
                    }
                    cfg.refreshProductsPathFromSelection()
                    cfg
                }
                viewModel.saveConfig()
            },
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text("Kaydet")
        }
    }
}

@Composable
private fun LogScreen(state: TeraziUiState, viewModel: TeraziViewModel) {
    Column {
        Button(onClick = { viewModel.clearLogs() }) { Text("Log Temizle") }
        LazyColumn(modifier = Modifier.fillMaxSize()) {
            items(state.logs.asReversed()) { line ->
                Text(line, fontFamily = FontFamily.Monospace, modifier = Modifier.padding(vertical = 2.dp))
            }
        }
    }
}
