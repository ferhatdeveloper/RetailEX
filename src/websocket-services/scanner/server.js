/**
 * RetailOS - Scanner WebSocket Service
 * TWAIN/WIA Protokolü ile Tarayıcı Entegrasyonu
 * Port: 9999
 */

const WebSocket = require('ws');
const http = require('http');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');

// Konfigürasyon
const CONFIG = {
  port: process.env.SCANNER_PORT || 9999,
  host: process.env.SCANNER_HOST || 'localhost',
  logDir: path.join(os.homedir(), 'RetailOS', 'logs', 'scanner'),
  maxImageSize: 10 * 1024 * 1024, // 10 MB
};

// Log dizini oluştur
async function ensureLogDir() {
  try {
    await fs.mkdir(CONFIG.logDir, { recursive: true });
  } catch (err) {
    console.error('Log dizini oluşturulamadı:', err);
  }
}

// Logger
class Logger {
  static async log(level, message, data = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      ...data,
    };
    
    console.log(`[${timestamp}] [${level}] ${message}`, data);
    
    // Dosyaya yaz
    try {
      const logFile = path.join(CONFIG.logDir, `scanner-${new Date().toISOString().split('T')[0]}.log`);
      await fs.appendFile(logFile, JSON.stringify(logEntry) + '\n');
    } catch (err) {
      console.error('Log yazma hatası:', err);
    }
  }
  
  static info(message, data) { return this.log('INFO', message, data); }
  static warn(message, data) { return this.log('WARN', message, data); }
  static error(message, data) { return this.log('ERROR', message, data); }
  static debug(message, data) { return this.log('DEBUG', message, data); }
}

// Scanner Manager (Mock - Gerçek TWAIN/WIA implementasyonu için ayrı native modül gerekli)
class ScannerManager {
  constructor() {
    this.scanners = [];
    this.isScanning = false;
  }
  
  /**
   * Tarayıcıları listele
   */
  async listScanners() {
    // Mock data - Gerçek implementasyonda TWAIN/WIA API kullanılacak
    this.scanners = [
      {
        id: 'scanner_001',
        name: 'Canon LiDE 300',
        status: 'ready',
        connection: 'USB',
        capabilities: {
          maxResolution: 2400,
          colorModes: ['color', 'grayscale', 'bw'],
          formats: ['jpeg', 'png', 'pdf'],
          duplex: false,
        },
      },
      {
        id: 'scanner_002',
        name: 'HP ScanJet Network',
        status: 'ready',
        connection: 'TCP/IP',
        ipAddress: '192.168.1.100',
        capabilities: {
          maxResolution: 1200,
          colorModes: ['color', 'grayscale'],
          formats: ['jpeg', 'pdf'],
          duplex: true,
        },
      },
    ];
    
    return this.scanners;
  }
  
  /**
   * Tarama başlat
   */
  async scan(scannerId, settings = {}) {
    if (this.isScanning) {
      throw new Error('Tarama zaten devam ediyor');
    }
    
    const scanner = this.scanners.find(s => s.id === scannerId);
    if (!scanner) {
      throw new Error(`Tarayıcı bulunamadı: ${scannerId}`);
    }
    
    this.isScanning = true;
    
    try {
      await Logger.info('Tarama başlatıldı', { scannerId, settings });
      
      // Tarama simülasyonu
      const result = await this.performScan(scanner, settings);
      
      await Logger.info('Tarama tamamlandı', { scannerId, size: result.size });
      
      return result;
    } finally {
      this.isScanning = false;
    }
  }
  
  /**
   * Tarama işlemi (Mock)
   */
  async performScan(scanner, settings) {
    // Simülasyon için gecikme
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Mock base64 image (1x1 pixel beyaz PNG)
    const mockImage = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
    
    return {
      success: true,
      dataUrl: `data:image/${settings.format || 'jpeg'};base64,${mockImage}`,
      format: settings.format || 'jpeg',
      resolution: settings.resolution || 300,
      size: mockImage.length,
      timestamp: new Date().toISOString(),
    };
  }
}

// WebSocket Server
class ScannerWebSocketServer {
  constructor() {
    this.scannerManager = new ScannerManager();
    this.clients = new Set();
    
    // HTTP Server (health check için)
    this.httpServer = http.createServer((req, res) => {
      if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'ok',
          service: 'scanner',
          port: CONFIG.port,
          clients: this.clients.size,
        }));
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    });
    
    // WebSocket Server
    this.wss = new WebSocket.Server({ 
      server: this.httpServer,
      path: '/scan'
    });
    
    this.setupWebSocket();
  }
  
  setupWebSocket() {
    this.wss.on('connection', (ws, req) => {
      const clientIp = req.socket.remoteAddress;
      
      Logger.info('Yeni bağlantı', { clientIp });
      this.clients.add(ws);
      
      // Hoş geldin mesajı
      ws.send(JSON.stringify({
        type: 'connected',
        message: 'RetailOS Scanner Service - Bağlantı başarılı',
        version: '1.0.0',
      }));
      
      // Mesaj handler
      ws.on('message', async (message) => {
        try {
          const data = JSON.parse(message);
          await this.handleMessage(ws, data);
        } catch (err) {
          Logger.error('Mesaj işleme hatası', { error: err.message });
          ws.send(JSON.stringify({
            type: 'error',
            error: err.message,
          }));
        }
      });
      
      // Bağlantı kapandı
      ws.on('close', () => {
        Logger.info('Bağlantı kapandı', { clientIp });
        this.clients.delete(ws);
      });
      
      // Hata
      ws.on('error', (err) => {
        Logger.error('WebSocket hatası', { error: err.message });
      });
    });
  }
  
  async handleMessage(ws, data) {
    const { command, ...params } = data;
    
    switch (command) {
      case 'list_scanners':
        const scanners = await this.scannerManager.listScanners();
        ws.send(JSON.stringify({
          type: 'scanner_list',
          scanners,
        }));
        break;
      
      case 'scan':
        // İlerleme bildirimi
        ws.send(JSON.stringify({
          type: 'scan_progress',
          progress: 25,
          message: 'Tarayıcı hazırlanıyor...',
        }));
        
        await new Promise(resolve => setTimeout(resolve, 500));
        
        ws.send(JSON.stringify({
          type: 'scan_progress',
          progress: 50,
          message: 'Taranıyor...',
        }));
        
        const result = await this.scannerManager.scan(params.scannerId, params.settings);
        
        ws.send(JSON.stringify({
          type: 'scan_progress',
          progress: 100,
          message: 'Tamamlandı',
        }));
        
        ws.send(JSON.stringify({
          type: 'scan_complete',
          ...result,
        }));
        break;
      
      case 'ping':
        ws.send(JSON.stringify({
          type: 'pong',
          timestamp: Date.now(),
        }));
        break;
      
      default:
        ws.send(JSON.stringify({
          type: 'error',
          error: `Bilinmeyen komut: ${command}`,
        }));
    }
  }
  
  start() {
    this.httpServer.listen(CONFIG.port, CONFIG.host, () => {
      Logger.info('Scanner WebSocket Service başlatıldı', {
        host: CONFIG.host,
        port: CONFIG.port,
        url: `ws://${CONFIG.host}:${CONFIG.port}/scan`,
      });
      
      console.log('='.repeat(60));
      console.log('RetailOS Scanner WebSocket Service');
      console.log('='.repeat(60));
      console.log(`WebSocket URL: ws://${CONFIG.host}:${CONFIG.port}/scan`);
      console.log(`Health Check: http://${CONFIG.host}:${CONFIG.port}/health`);
      console.log(`Log Directory: ${CONFIG.logDir}`);
      console.log('='.repeat(60));
    });
  }
  
  stop() {
    this.wss.close(() => {
      this.httpServer.close(() => {
        Logger.info('Scanner WebSocket Service durduruldu');
        process.exit(0);
      });
    });
  }
}

// Başlat
async function main() {
  await ensureLogDir();
  
  const server = new ScannerWebSocketServer();
  server.start();
  
  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\nServis durduruluyor...');
    server.stop();
  });
  
  process.on('SIGTERM', () => {
    server.stop();
  });
}

// Hata yakalama
process.on('uncaughtException', (err) => {
  Logger.error('Beklenmeyen hata', { error: err.message, stack: err.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  Logger.error('Unhandled Promise Rejection', { reason });
});

// Başlat
main().catch((err) => {
  console.error('Başlatma hatası:', err);
  process.exit(1);
});

