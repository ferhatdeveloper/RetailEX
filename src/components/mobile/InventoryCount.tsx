/**
 * Mobile Inventory Count Screen
 * Pattern: Offline-First + Progressive Web App
 * Features: Barcode scanning, offline support, auto-sync
 */

import { useState, useEffect, useRef } from 'react';
import { Camera, Check, X, Upload, Download, Wifi, WifiOff, Package, AlertCircle } from 'lucide-react';
import { toast } from 'sonner@2.0.3';

interface CountItem {
  id: string;
  barcode: string;
  product_code: string;
  product_name: string;
  expected_quantity: number;
  counted_quantity: number;
  difference: number;
  counted_at: string;
  synced: boolean;
}

interface InventorySession {
  id: string;
  warehouse_id: string;
  warehouse_name: string;
  started_at: string;
  completed_at?: string;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  items: CountItem[];
  counted_by: string;
}

export function InventoryCount() {
  const [session, setSession] = useState<InventorySession | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scannedBarcode, setScannedBarcode] = useState('');
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingSync, setPendingSync] = useState<CountItem[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Online/Offline detection
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      toast.success('Bağlantı yeniden kuruldu');
      syncPendingItems();
    };

    const handleOffline = () => {
      setIsOnline(false);
      toast.warning('Çevrimdışı moddasınız');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Load session from localStorage
  useEffect(() => {
    const savedSession = localStorage.getItem('inventory_session');
    if (savedSession) {
      setSession(JSON.parse(savedSession));
    }

    const saved = localStorage.getItem('pending_sync');
    if (saved) {
      setPendingSync(JSON.parse(saved));
    }
  }, []);

  // Save session to localStorage
  useEffect(() => {
    if (session) {
      localStorage.setItem('inventory_session', JSON.stringify(session));
    }
  }, [session]);

  // Start new session
  const startSession = (warehouseId: string, warehouseName: string) => {
    const newSession: InventorySession = {
      id: `inv-${Date.now()}`,
      warehouse_id: warehouseId,
      warehouse_name: warehouseName,
      started_at: new Date().toISOString(),
      status: 'IN_PROGRESS',
      items: [],
      counted_by: 'user-1' // From auth context
    };

    setSession(newSession);
    toast.success('Sayım başlatıldı');
  };

  // Start camera for barcode scanning
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' } // Rear camera
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setIsScanning(true);
      }
    } catch (error) {
      toast.error('Kamera açılamadı');
      console.error(error);
    }
  };

  // Stop camera
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsScanning(false);
  };

  // Handle barcode scan (simulated - gerçek projede barcode scanner library kullanılır)
  const handleScan = async (barcode: string) => {
    if (!session) {
      toast.error('Önce sayım başlatın');
      return;
    }

    // Check if already counted
    const existingItem = session.items.find(item => item.barcode === barcode);

    if (existingItem) {
      // Increment count
      const updatedItems = session.items.map(item =>
        item.barcode === barcode
          ? { 
              ...item, 
              counted_quantity: item.counted_quantity + 1,
              difference: (item.counted_quantity + 1) - item.expected_quantity,
              counted_at: new Date().toISOString()
            }
          : item
      );

      setSession({ ...session, items: updatedItems });
      toast.success(`${existingItem.product_name} - Miktar: ${existingItem.counted_quantity + 1}`);
    } else {
      // Fetch product info (from API or local DB)
      const product = await fetchProductByBarcode(barcode);

      if (!product) {
        toast.error('Ürün bulunamadı');
        return;
      }

      const newItem: CountItem = {
        id: `item-${Date.now()}`,
        barcode,
        product_code: product.code,
        product_name: product.name,
        expected_quantity: product.stock || 0,
        counted_quantity: 1,
        difference: 1 - (product.stock || 0),
        counted_at: new Date().toISOString(),
        synced: false
      };

      setSession({
        ...session,
        items: [...session.items, newItem]
      });

      // Add to pending sync if offline
      if (!isOnline) {
        setPendingSync([...pendingSync, newItem]);
        localStorage.setItem('pending_sync', JSON.stringify([...pendingSync, newItem]));
      }

      toast.success(`${product.name} eklendi`);
    }

    setScannedBarcode('');
    stopCamera();
  };

  // Mock product fetch
  const fetchProductByBarcode = async (barcode: string): Promise<any> => {
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 300));

    // Mock product
    return {
      id: `prod-${barcode}`,
      code: `P${barcode}`,
      name: `Ürün ${barcode}`,
      stock: Math.floor(Math.random() * 100)
    };
  };

  // Manual entry
  const handleManualEntry = (barcode: string, quantity: number) => {
    if (!session) return;

    const existingItem = session.items.find(item => item.barcode === barcode);

    if (existingItem) {
      const updatedItems = session.items.map(item =>
        item.barcode === barcode
          ? { 
              ...item, 
              counted_quantity: quantity,
              difference: quantity - item.expected_quantity,
              counted_at: new Date().toISOString()
            }
          : item
      );

      setSession({ ...session, items: updatedItems });
    }
  };

  // Complete session
  const completeSession = async () => {
    if (!session) return;

    if (!isOnline) {
      toast.error('Sayımı tamamlamak için internet bağlantısı gerekli');
      return;
    }

    // Sync all items
    await syncPendingItems();

    const completedSession: InventorySession = {
      ...session,
      status: 'COMPLETED',
      completed_at: new Date().toISOString()
    };

    setSession(completedSession);

    // Save to API
    try {
      // await api.saveInventoryCount(completedSession);
      toast.success('Sayım tamamlandı ve kaydedildi');
      
      // Clear local storage
      localStorage.removeItem('inventory_session');
      localStorage.removeItem('pending_sync');
      
      setSession(null);
      setPendingSync([]);
    } catch (error) {
      toast.error('Kayıt hatası');
    }
  };

  // Sync pending items
  const syncPendingItems = async () => {
    if (pendingSync.length === 0) return;

    try {
      // await api.syncInventoryItems(pendingSync);
      
      const updatedItems = session?.items.map(item => ({
        ...item,
        synced: true
      })) || [];

      if (session) {
        setSession({ ...session, items: updatedItems });
      }

      setPendingSync([]);
      localStorage.removeItem('pending_sync');
      
      toast.success(`${pendingSync.length} kayıt senkronize edildi`);
    } catch (error) {
      toast.error('Senkronizasyon hatası');
    }
  };

  // Statistics
  const stats = session ? {
    total: session.items.length,
    matched: session.items.filter(i => i.difference === 0).length,
    surplus: session.items.filter(i => i.difference > 0).length,
    deficit: session.items.filter(i => i.difference < 0).length
  } : null;

  if (!session) {
    return (
      <div className="min-h-screen bg-gray-100 p-4">
        <div className="max-w-md mx-auto">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-center mb-6">
              <Package className="w-16 h-16 mx-auto text-blue-600 mb-4" />
              <h1 className="text-xl mb-2">Envanter Sayımı</h1>
              <p className="text-sm text-gray-600">Yeni sayım başlatın</p>
            </div>

            <button
              onClick={() => startSession('wh-001', 'Ana Depo')}
              className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition-colors"
            >
              Sayım Başlat
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Header */}
      <div className="bg-blue-600 text-white p-4 sticky top-0 z-10">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-lg">Envanter Sayımı</h1>
          <div className="flex items-center gap-2">
            {isOnline ? (
              <Wifi className="w-5 h-5 text-green-300" />
            ) : (
              <WifiOff className="w-5 h-5 text-red-300" />
            )}
            {pendingSync.length > 0 && (
              <span className="bg-red-500 px-2 py-0.5 rounded-full text-xs">
                {pendingSync.length} bekliyor
              </span>
            )}
          </div>
        </div>
        <div className="text-sm opacity-90">{session.warehouse_name}</div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="bg-white border-b p-3">
          <div className="grid grid-cols-4 gap-2 text-center text-xs">
            <div>
              <div className="text-gray-600">Toplam</div>
              <div className="text-base text-blue-600">{stats.total}</div>
            </div>
            <div>
              <div className="text-gray-600">Eşit</div>
              <div className="text-base text-green-600">{stats.matched}</div>
            </div>
            <div>
              <div className="text-gray-600">Fazla</div>
              <div className="text-base text-orange-600">{stats.surplus}</div>
            </div>
            <div>
              <div className="text-gray-600">Eksik</div>
              <div className="text-base text-red-600">{stats.deficit}</div>
            </div>
          </div>
        </div>
      )}

      {/* Scanner */}
      {isScanning ? (
        <div className="relative bg-black" style={{ height: '300px' }}>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="border-2 border-blue-500 w-64 h-32 rounded-lg"></div>
          </div>
          <button
            onClick={stopCamera}
            className="absolute top-4 right-4 bg-red-600 text-white p-2 rounded-full"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
      ) : (
        <div className="p-4 bg-white border-b">
          <div className="flex gap-2">
            <input
              type="text"
              value={scannedBarcode}
              onChange={(e) => setScannedBarcode(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && scannedBarcode) {
                  handleScan(scannedBarcode);
                }
              }}
              placeholder="Barkod girin veya okutun"
              className="flex-1 px-4 py-3 border rounded-lg text-base"
            />
            <button
              onClick={startCamera}
              className="bg-blue-600 text-white px-4 rounded-lg hover:bg-blue-700"
            >
              <Camera className="w-6 h-6" />
            </button>
          </div>
        </div>
      )}

      {/* Items List */}
      <div className="flex-1 overflow-auto p-4 space-y-2">
        {session.items.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            <Package className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Henüz ürün sayılmadı</p>
          </div>
        ) : (
          session.items.map((item) => (
            <div
              key={item.id}
              className="bg-white rounded-lg p-3 border shadow-sm"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <div className="text-sm mb-1">{item.product_name}</div>
                  <div className="text-xs text-gray-600">
                    {item.product_code} • {item.barcode}
                  </div>
                </div>
                {!item.synced && (
                  <AlertCircle className="w-4 h-4 text-orange-500" />
                )}
              </div>

              <div className="flex items-center justify-between text-xs">
                <div className="flex gap-4">
                  <div>
                    <span className="text-gray-600">Beklenen:</span>
                    <span className="ml-1">{item.expected_quantity}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Sayılan:</span>
                    <span className="ml-1 font-medium">{item.counted_quantity}</span>
                  </div>
                </div>

                <div className={`px-2 py-0.5 rounded ${
                  item.difference === 0 
                    ? 'bg-green-100 text-green-700'
                    : item.difference > 0
                    ? 'bg-orange-100 text-orange-700'
                    : 'bg-red-100 text-red-700'
                }`}>
                  {item.difference > 0 ? '+' : ''}{item.difference}
                </div>
              </div>

              {/* Quick adjust */}
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => handleManualEntry(item.barcode, item.counted_quantity - 1)}
                  className="flex-1 bg-gray-100 py-1 rounded text-xs hover:bg-gray-200"
                >
                  -1
                </button>
                <button
                  onClick={() => handleManualEntry(item.barcode, item.counted_quantity + 1)}
                  className="flex-1 bg-gray-100 py-1 rounded text-xs hover:bg-gray-200"
                >
                  +1
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Actions */}
      <div className="bg-white border-t p-4 space-y-2">
        {pendingSync.length > 0 && isOnline && (
          <button
            onClick={syncPendingItems}
            className="w-full bg-orange-600 text-white py-3 rounded-lg hover:bg-orange-700 transition-colors flex items-center justify-center gap-2"
          >
            <Upload className="w-5 h-5" />
            Bekleyen Kayıtları Senkronize Et ({pendingSync.length})
          </button>
        )}

        <button
          onClick={completeSession}
          disabled={!isOnline || session.items.length === 0}
          className="w-full bg-green-600 text-white py-3 rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          <Check className="w-5 h-5" />
          Sayımı Tamamla
        </button>

        <button
          onClick={() => {
            if (confirm('Sayımı iptal etmek istediğinizden emin misiniz?')) {
              localStorage.removeItem('inventory_session');
              setSession(null);
              toast.info('Sayım iptal edildi');
            }
          }}
          className="w-full bg-gray-200 text-gray-700 py-3 rounded-lg hover:bg-gray-300 transition-colors"
        >
          İptal
        </button>
      </div>
    </div>
  );
}

