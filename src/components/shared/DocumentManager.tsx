import { useState, useEffect } from 'react';
import { Upload, Printer, Eye, Download, Trash2, FileText, Settings, AlertCircle, CheckCircle, Loader } from 'lucide-react';

interface Document {
  id: string;
  name: string;
  size: number;
  uploadDate: string;
  dataUrl?: string; // Base64 data for scanned images
}

interface Scanner {
  name: string;
  id: string;
  status: 'ready' | 'busy';
}

interface ScanSettings {
  resolution: number; // DPI
  colorMode: 'color' | 'grayscale' | 'blackwhite';
  format: 'pdf' | 'jpeg' | 'png';
  duplex: boolean;
}

export function DocumentManager() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [scanners, setScanners] = useState<Scanner[]>([]);
  const [selectedScanner, setSelectedScanner] = useState<string>('');
  const [wsConnected, setWsConnected] = useState(false);
  const [wsStatus, setWsStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [showScanSettings, setShowScanSettings] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [connectionAttempted, setConnectionAttempted] = useState(false);
  
  const [scanSettings, setScanSettings] = useState<ScanSettings>({
    resolution: 300,
    colorMode: 'color',
    format: 'pdf',
    duplex: false
  });

  const connectToScanService = () => {
    // Eğer zaten bağlanıyorsa veya bağlıysa, tekrar deneme
    if (wsStatus === 'connecting' || wsStatus === 'connected') {
      return;
    }

    setWsStatus('connecting');
    setConnectionAttempted(true);
    
    // WebSocket bağlantısını dene
    let websocket: WebSocket;
    let connectionTimeout: NodeJS.Timeout;
    
    try {
      websocket = new WebSocket('ws://localhost:9999/scan');
      
      // Bağlantı zaman aşımı (3 saniye)
      connectionTimeout = setTimeout(() => {
        console.log('⏱️  Bağlantı zaman aşımına uğradı (localhost:9999 yanıt vermiyor)');
        try {
          websocket.close();
        } catch (e) {
          // Ignore
        }
        setWsConnected(false);
        setWsStatus('disconnected');
      }, 3000);

      websocket.onopen = () => {
        clearTimeout(connectionTimeout);
        console.log('✅ Tarayıcı servisi bağlandı (ws://localhost:9999/scan)');
        setWsConnected(true);
        setWsStatus('connected');
        
        // Tarayıcı listesini iste
        try {
          websocket.send(JSON.stringify({
            command: 'list_scanners'
          }));
        } catch (e) {
          console.warn('⚠️  Tarayıcı listesi isteği gönderilemedi');
        }
      };

      websocket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'scanners_list') {
            setScanners(data.scanners || []);
          } else if (data.type === 'scan_complete') {
            const newDoc: ScannedDocument = {
              id: Date.now().toString(),
              fileName: data.filename,
              fileSize: data.fileSize || 0,
              fileType: data.format || 'image/jpeg',
              uploadDate: new Date().toISOString(),
              previewUrl: data.imageData
            };
            setScannedDocuments(prev => [...prev, newDoc]);
            setIsScanning(false);
          } else if (data.type === 'scan_progress') {
            console.log(`ğŸ“Š Tarama ilerliyor: ${data.progress}%`);
          }
        } catch (error) {
          // Sessizce yakala
        }
      };

      websocket.onerror = () => {
        clearTimeout(connectionTimeout);
        // Sessizce yakala - UI'da zaten gösteriliyor
        console.log('ğŸ“¡ Tarayıcı servisine bağlanılamıyor (localhost:9999)');
        setWsConnected(false);
        setWsStatus('disconnected');
      };

      websocket.onclose = (event) => {
        clearTimeout(connectionTimeout);
        
        // Sadece beklenmedik kapanmalarda log bas
        if (event.code !== 1000 && wsStatus === 'connected') {
          console.log(`ğŸ“¡ Bağlantı kesildi (kod: ${event.code})`);
        }
        
        setWsConnected(false);
        setWsStatus('disconnected');
        
        // Otomatik yeniden bağlanma - sadece beklenmedik kapanmalarda
        if (event.code !== 1000 && event.code !== 1001) {
          setTimeout(() => {
            if (wsStatus === 'disconnected') {
              console.log('ğŸ”„ Yeniden bağlanılıyor...');
              connectToScanService();
            }
          }, 5000);
        }
      };

      setWs(websocket);
    } catch (error) {
      clearTimeout(connectionTimeout!);
      console.log('ğŸ“¡ WebSocket başlatılamadı (localhost:9999 erişilebilir değil)');
      setWsConnected(false);
      setWsStatus('disconnected');
    }
  };

  // WebSocket bağlantısı kur
  useEffect(() => {
    connectToScanService();
    
    return () => {
      if (ws) {
        try {
          ws.close(1000, 'Component unmounted');
        } catch (e) {
          // Ignore
        }
      }
    };
  }, []); // Sadece mount/unmount'ta çalış

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    const newDocuments: Document[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      newDocuments.push({
        id: Date.now().toString() + i,
        name: file.name,
        size: file.size / 1024, // KB
        uploadDate: new Date().toLocaleDateString('tr-TR')
      });
    }
    setDocuments([...documents, ...newDocuments]);
  };

  const handleScan = () => {
    if (!wsConnected || !ws || !selectedScanner) {
      alert('Tarayıcı servisi bağlı değil veya tarayıcı seçilmedi!');
      return;
    }

    setIsScanning(true);

    // Tarama komutunu gönder
    ws.send(JSON.stringify({
      command: 'scan',
      scannerId: selectedScanner,
      settings: scanSettings
    }));
  };

  const handleDelete = (id: string) => {
    setDocuments(documents.filter(doc => doc.id !== id));
  };

  return (
    <div className="space-y-4">
      {/* Service Status Banner */}
      <div className={`p-3 rounded-lg border-2 flex items-center justify-between ${
        wsStatus === 'connected' ? 'bg-green-50 border-green-300' :
        wsStatus === 'connecting' ? 'bg-yellow-50 border-yellow-300' :
        'bg-red-50 border-red-300'
      }`}>
        <div className="flex items-center gap-2">
          {wsStatus === 'connected' ? (
            <CheckCircle className="w-5 h-5 text-green-600" />
          ) : wsStatus === 'connecting' ? (
            <Loader className="w-5 h-5 text-yellow-600 animate-spin" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-600" />
          )}
          <div>
            <div className="text-sm font-medium">
              {wsStatus === 'connected' ? 'Tarayıcı Servisi Aktif' :
               wsStatus === 'connecting' ? 'Bağlanıyor...' :
               'Tarayıcı Servisi Bağlı Değil'}
            </div>
            <div className="text-xs text-gray-600">
              {wsStatus === 'connected' 
                ? `${scanners.length} tarayıcı bulundu` 
                : wsStatus === 'connecting'
                ? 'localhost:9999 üzerinden bağlantı kuruluyor...'
                : 'Servis çalışmıyor. Lütfen ExRetailOS Scanner Service\'i başlatın.'}
            </div>
          </div>
        </div>
        {wsStatus === 'disconnected' && (
          <button 
            onClick={connectToScanService}
            className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-colors"
          >
            Tekrar Bağlan
          </button>
        )}
      </div>

      {/* Scan Settings (if service connected) */}
      {wsStatus === 'connected' && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Settings className="w-4 h-4 text-gray-600" />
              <span className="text-sm font-medium">Tarama Ayarları</span>
            </div>
            <button
              onClick={() => setShowScanSettings(!showScanSettings)}
              className="text-xs text-blue-600 hover:text-blue-700"
            >
              {showScanSettings ? 'Gizle' : 'Göster'}
            </button>
          </div>

          {showScanSettings && (
            <div className="grid grid-cols-4 gap-3 mt-3 pt-3 border-t">
              <div>
                <label className="block text-xs text-gray-600 mb-1">Tarayıcı</label>
                <select 
                  value={selectedScanner}
                  onChange={(e) => setSelectedScanner(e.target.value)}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs"
                  disabled={scanners.length === 0}
                >
                  {scanners.map(scanner => (
                    <option key={scanner.id} value={scanner.id}>
                      {scanner.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-gray-600 mb-1">Çözünürlük (DPI)</label>
                <select 
                  value={scanSettings.resolution}
                  onChange={(e) => setScanSettings({...scanSettings, resolution: parseInt(e.target.value)})}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs"
                >
                  <option value={150}>150 DPI</option>
                  <option value={200}>200 DPI</option>
                  <option value={300}>300 DPI (Önerilen)</option>
                  <option value={600}>600 DPI (Yüksek)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-gray-600 mb-1">Renk Modu</label>
                <select 
                  value={scanSettings.colorMode}
                  onChange={(e) => setScanSettings({...scanSettings, colorMode: e.target.value as any})}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs"
                >
                  <option value="color">Renkli</option>
                  <option value="grayscale">Gri Tonlama</option>
                  <option value="blackwhite">Siyah-Beyaz</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-gray-600 mb-1">Format</label>
                <select 
                  value={scanSettings.format}
                  onChange={(e) => setScanSettings({...scanSettings, format: e.target.value as any})}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs"
                >
                  <option value="pdf">PDF</option>
                  <option value="jpeg">JPEG</option>
                  <option value="png">PNG</option>
                </select>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Upload & Scanner Cards */}
      <div className="grid grid-cols-2 gap-4">
        {/* File Upload */}
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-400 transition-colors">
          <label htmlFor="file-upload" className="cursor-pointer">
            <Upload className="h-12 w-12 mx-auto text-gray-400 mb-3" />
            <div className="text-sm text-gray-600">
              Dosyaları sürükleyin veya <span className="text-blue-600 underline">göz atın</span>
            </div>
            <div className="text-xs text-gray-500 mt-1">PDF, Word, Excel, Resim</div>
            <input
              id="file-upload"
              type="file"
              multiple
              className="hidden"
              onChange={handleFileUpload}
              accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
            />
          </label>
        </div>

        {/* Scanner */}
        <div 
          onClick={handleScan}
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
            wsConnected && !isScanning 
              ? 'border-blue-300 bg-blue-50 hover:border-blue-500 hover:bg-blue-100' 
              : 'border-gray-300 bg-gray-50 cursor-not-allowed opacity-60'
          }`}
        >
          {isScanning ? (
            <>
              <Loader className="h-12 w-12 mx-auto text-blue-600 mb-3 animate-spin" />
              <div className="text-sm text-blue-900">Taranıyor...</div>
              <div className="text-xs text-blue-600 mt-1">Lütfen bekleyin</div>
            </>
          ) : (
            <>
              <Printer className="h-12 w-12 mx-auto text-blue-600 mb-3" />
              <div className="text-sm text-blue-900">Tarayıcıdan Tara</div>
              <div className="text-xs text-blue-600 mt-1">
                {wsConnected ? `${scanners.length} cihaz hazır` : 'Servis bağlı değil'}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Uploaded Documents List */}
      <div>
        <div className="text-sm text-gray-600 mb-2">
          Yüklenen Dosyalar ({documents.length}/10)
        </div>
        <div className="space-y-2">
          {documents.map((doc) => (
            <div 
              key={doc.id}
              className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-3 flex-1">
                <FileText className="h-5 w-5 text-blue-600" />
                <div className="flex-1">
                  <div className="text-sm text-gray-900">{doc.name}</div>
                  <div className="text-xs text-gray-500">
                    {doc.size.toFixed(1)} KB • {doc.uploadDate}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button 
                  className="p-1.5 hover:bg-gray-100 rounded transition-colors"
                  title="Görüntüle"
                >
                  <Eye className="h-4 w-4 text-gray-600" />
                </button>
                <button 
                  className="p-1.5 hover:bg-gray-100 rounded transition-colors"
                  title="İndir"
                >
                  <Download className="h-4 w-4 text-gray-600" />
                </button>
                <button 
                  onClick={() => handleDelete(doc.id)}
                  className="p-1.5 hover:bg-red-50 rounded transition-colors"
                  title="Sil"
                >
                  <Trash2 className="h-4 w-4 text-red-600" />
                </button>
              </div>
            </div>
          ))}
          {documents.length === 0 && (
            <div className="text-center py-8 text-gray-400 text-sm">
              Henüz dosya eklenmedi
            </div>
          )}
        </div>
      </div>

      {/* Installation Instructions (if not connected) */}
      {wsStatus === 'disconnected' && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-medium text-sm text-blue-900 mb-1">
                Tarayıcı Servisi Nasıl Kurulur?
              </div>
              <div className="text-xs text-blue-800 space-y-1">
                <p>1. ExRetailOS Scanner Service uygulamasını indirin ve çalıştırın</p>
                <p>2. Servis otomatik olarak localhost:9999 portunda başlayacak</p>
                <p>3. TWAIN/WIA uyumlu tüm tarayıcılar otomatik algılanacak</p>
                <p>4. Ağ üzerindeki tarayıcılar TCP/IP ile erişilebilir</p>
              </div>
              <button className="mt-2 px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700">
                Servis Uygulamasını İndir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
