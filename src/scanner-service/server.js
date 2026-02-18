/**
 * RetailOS Scanner Service
 * WebSocket sunucusu - TWAIN/WIA tarayıcı entegrasyonu
 * 
 * Node.js ile çalışan tarayıcı servisi
 * Windows üzerinde TWAIN/WIA protokolünü kullanır
 */

const WebSocket = require('ws');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// WebSocket sunucusunu başlat
const wss = new WebSocket.Server({
  port: 9999,
  path: '/scan'
});

console.log('✅ RetailOS Scanner Service başlatıldı');
console.log('📡 WebSocket: ws://localhost:9999/scan');
console.log('ğŸ–¨ï¸  Tarayıcılar algılanıyor...\n');

// Bağlı tarayıcıları tut
let connectedScanners = [];

// TWAIN/WIA tarayıcıları algıla
function detectScanners() {
  // Windows WIA ile tarayıcıları listele
  // PowerShell scripti ile WIA COM nesnesine erişim
  const psScript = `
    Add-Type -AssemblyName System.Drawing
    $deviceManager = New-Object -ComObject WIA.DeviceManager
    $devices = $deviceManager.DeviceInfos
    
    $scanners = @()
    foreach ($device in $devices) {
      if ($device.Type -eq 1) {  # Scanner type
        $scanners += @{
          id = $device.DeviceID
          name = $device.Properties("Name").Value
          status = "ready"
        }
      }
    }
    
    $scanners | ConvertTo-Json
  `;

  exec(`powershell -Command "${psScript}"`, (error, stdout, stderr) => {
    if (error) {
      console.error('⚠️  Tarayıcı algılama hatası:', error.message);
      // Mock tarayıcılar ekle (test için)
      connectedScanners = [
        { id: 'scanner_mock_001', name: 'Canon LiDE 300 (Mock)', status: 'ready' },
        { id: 'scanner_mock_002', name: 'HP ScanJet Pro (Mock)', status: 'ready' }
      ];
      console.log('📝 Mock tarayıcılar yüklendi (test modu)');
      return;
    }

    try {
      const scanners = JSON.parse(stdout);
      connectedScanners = Array.isArray(scanners) ? scanners : [scanners];
      console.log(`ğŸ–¨ï¸  ${connectedScanners.length} tarayıcı bulundu:`);
      connectedScanners.forEach(s => console.log(`   - ${s.name}`));
    } catch (parseError) {
      console.error('⚠️  Tarayıcı listesi parse hatası');
      connectedScanners = [];
    }
  });
}

// Tarama işlemi gerçekleştir
function performScan(scannerId, settings, ws) {
  console.log(`ğŸ”„ Tarama başlatıldı: ${scannerId}`);
  console.log(`⚙️  Ayarlar: ${settings.resolution}DPI, ${settings.colorMode}, ${settings.format}`);

  // İlerleme mesajları gönder
  let progress = 0;
  const progressInterval = setInterval(() => {
    progress += 10;
    if (progress <= 90) {
      ws.send(JSON.stringify({
        type: 'scan_progress',
        progress: progress,
        message: 'Taranıyor...'
      }));
    }
  }, 200);

  // PowerShell ile WIA tarama
  const outputPath = path.join(__dirname, 'scans', `scan_${Date.now()}.jpg`);
  const psScript = `
    Add-Type -AssemblyName System.Drawing
    
    try {
      $deviceManager = New-Object -ComObject WIA.DeviceManager
      $device = $null
      
      # Tarayıcıyı bul
      foreach ($d in $deviceManager.DeviceInfos) {
        if ($d.DeviceID -eq "${scannerId}") {
          $device = $d.Connect()
          break
        }
      }
      
      if ($device -eq $null) {
        Write-Error "Tarayıcı bulunamadı"
        exit 1
      }
      
      # Tarama ayarları
      $item = $device.Items(1)
      $item.Properties("6146").Value = ${settings.resolution}  # Horizontal Resolution
      $item.Properties("6147").Value = ${settings.resolution}  # Vertical Resolution
      
      # Renk modu
      switch ("${settings.colorMode}") {
        "color" { $item.Properties("6146").Value = 1 }      # Color
        "grayscale" { $item.Properties("6146").Value = 2 }  # Grayscale
        "blackwhite" { $item.Properties("6146").Value = 4 } # Black & White
      }
      
      # Tarama yap
      $image = $item.Transfer("{B96B3CAE-0728-11D3-9D7B-0000F81EF32E}")  # FormatID for BMP
      
      # Dosyaya kaydet
      $image.SaveFile("${outputPath}")
      
      Write-Output "SUCCESS:${outputPath}"
    } catch {
      Write-Error $_.Exception.Message
      exit 1
    }
  `;

  // Scans klasörünü oluştur
  const scansDir = path.join(__dirname, 'scans');
  if (!fs.existsSync(scansDir)) {
    fs.mkdirSync(scansDir);
  }

  exec(`powershell -Command "${psScript}"`, (error, stdout, stderr) => {
    clearInterval(progressInterval);

    if (error) {
      console.error('❌ Tarama hatası:', error.message);
      ws.send(JSON.stringify({
        type: 'scan_error',
        error: 'Tarama başarısız: ' + error.message
      }));
      return;
    }

    // Mock tarama (gerçek tarayıcı yoksa)
    if (scannerId.includes('mock')) {
      console.log('✅ Mock tarama tamamlandı');

      // Örnek Base64 görüntü (1x1 piksel transparan PNG)
      const mockBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

      ws.send(JSON.stringify({
        type: 'scan_complete',
        dataUrl: `data:image/${settings.format};base64,${mockBase64}`,
        size: 1024,
        format: settings.format,
        resolution: settings.resolution
      }));
      return;
    }

    // Gerçek tarama - dosyayı Base64'e çevir
    if (stdout.includes('SUCCESS:')) {
      const filePath = stdout.split(':')[1].trim();

      fs.readFile(filePath, (err, data) => {
        if (err) {
          console.error('❌ Dosya okuma hatası:', err);
          ws.send(JSON.stringify({
            type: 'scan_error',
            error: 'Tarama dosyası okunamadı'
          }));
          return;
        }

        // Base64 encode
        const base64 = data.toString('base64');
        const dataUrl = `data:image/${settings.format};base64,${base64}`;

        console.log('✅ Tarama tamamlandı:', filePath);
        console.log(`📊 Boyut: ${(data.length / 1024).toFixed(1)} KB`);

        ws.send(JSON.stringify({
          type: 'scan_complete',
          dataUrl: dataUrl,
          size: data.length,
          format: settings.format,
          resolution: settings.resolution
        }));

        // Geçici dosyayı sil
        fs.unlinkSync(filePath);
      });
    } else {
      console.error('❌ Tarama başarısız:', stderr);
      ws.send(JSON.stringify({
        type: 'scan_error',
        error: 'Tarama işlemi başarısız'
      }));
    }
  });
}

// WebSocket bağlantı yönetimi
wss.on('connection', (ws) => {
  console.log('ğŸ”— Yeni istemci bağlandı');

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      console.log('📨 Komut alındı:', data.command);

      switch (data.command) {
        case 'list_scanners':
          // Tarayıcı listesini gönder
          ws.send(JSON.stringify({
            type: 'scanner_list',
            scanners: connectedScanners
          }));
          console.log(`📋 ${connectedScanners.length} tarayıcı listesi gönderildi`);
          break;

        case 'scan':
          // Tarama başlat
          const { scannerId, settings } = data;
          performScan(scannerId, settings, ws);
          break;

        case 'refresh_scanners':
          // Tarayıcıları yeniden tara
          detectScanners();
          setTimeout(() => {
            ws.send(JSON.stringify({
              type: 'scanner_list',
              scanners: connectedScanners
            }));
          }, 1000);
          break;

        default:
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Bilinmeyen komut'
          }));
      }
    } catch (error) {
      console.error('❌ Mesaj işleme hatası:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'İstek işlenemedi'
      }));
    }
  });

  ws.on('close', () => {
    console.log('❌ İstemci bağlantısı kesildi');
  });

  ws.on('error', () => {
    // Sessizce yakala
  });
});

// Başlangıçta tarayıcıları algıla
detectScanners();

// Her 30 saniyede bir tarayıcıları kontrol et
setInterval(() => {
  console.log('ğŸ”„ Tarayıcılar yeniden kontrol ediliyor...');
  detectScanners();
}, 30000);

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n⏹️  Servis kapatılıyor...');
  wss.close(() => {
    console.log('✅ Servis kapatıldı');
    process.exit(0);
  });
});
