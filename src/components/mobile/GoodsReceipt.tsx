/**
 * Mobile Goods Receipt Screen (Mal Kabul)
 * Pattern: Offline-First
 * Features: Barcode scanning, quantity verification, photo upload
 */

import { useState, useEffect, useRef } from 'react';
import { Camera, Check, X, Package, AlertTriangle, Upload, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner@2.0.3';

interface ReceiptItem {
  id: string;
  barcode: string;
  product_code: string;
  product_name: string;
  ordered_quantity: number;
  received_quantity: number;
  damaged_quantity: number;
  lot_number?: string;
  expiry_date?: string;
  photos: string[];
  notes?: string;
  received_at: string;
}

interface GoodsReceiptSession {
  id: string;
  purchase_order_id: string;
  supplier_name: string;
  warehouse_id: string;
  items: ReceiptItem[];
  status: 'IN_PROGRESS' | 'COMPLETED';
  received_by: string;
  started_at: string;
  completed_at?: string;
}

export function GoodsReceipt() {
  const [session, setSession] = useState<GoodsReceiptSession | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scannedBarcode, setScannedBarcode] = useState('');
  const [showItemDetail, setShowItemDetail] = useState<ReceiptItem | null>(null);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Load session from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('goods_receipt_session');
    if (saved) {
      setSession(JSON.parse(saved));
    }
  }, []);

  // Save session
  useEffect(() => {
    if (session) {
      localStorage.setItem('goods_receipt_session', JSON.stringify(session));
    }
  }, [session]);

  // Start new receipt session
  const startSession = (poId: string, supplierName: string) => {
    const newSession: GoodsReceiptSession = {
      id: `gr-${Date.now()}`,
      purchase_order_id: poId,
      supplier_name: supplierName,
      warehouse_id: 'wh-001',
      items: [],
      status: 'IN_PROGRESS',
      received_by: 'user-1',
      started_at: new Date().toISOString()
    };

    setSession(newSession);
    toast.success('Mal kabul başlatıldı');
  };

  // Start camera
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setIsScanning(true);
      }
    } catch (error) {
      toast.error('Kamera açılamadı');
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

  // Capture photo
  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    if (!context) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0);

    const photoUrl = canvas.toDataURL('image/jpeg', 0.8);
    setCapturedPhoto(photoUrl);
    stopCamera();

    toast.success('Fotoğraf çekildi');
  };

  // Handle scan
  const handleScan = async (barcode: string) => {
    if (!session) {
      toast.error('Önce mal kabul başlatın');
      return;
    }

    // Check if already received
    const existingItem = session.items.find(item => item.barcode === barcode);

    if (existingItem) {
      // Show detail for quantity update
      setShowItemDetail(existingItem);
    } else {
      // Fetch product from PO
      const product = await fetchProductFromPO(session.purchase_order_id, barcode);

      if (!product) {
        toast.error('Ürün sipariş listesinde bulunamadı');
        return;
      }

      const newItem: ReceiptItem = {
        id: `item-${Date.now()}`,
        barcode,
        product_code: product.code,
        product_name: product.name,
        ordered_quantity: product.ordered_quantity,
        received_quantity: 0,
        damaged_quantity: 0,
        photos: [],
        received_at: new Date().toISOString()
      };

      setShowItemDetail(newItem);
    }

    setScannedBarcode('');
  };

  // Mock fetch product from PO
  const fetchProductFromPO = async (poId: string, barcode: string): Promise<any> => {
    await new Promise(resolve => setTimeout(resolve, 300));

    return {
      code: `P${barcode}`,
      name: `Ürün ${barcode}`,
      ordered_quantity: Math.floor(Math.random() * 100) + 10
    };
  };

  // Update item
  const updateItem = (item: ReceiptItem) => {
    if (!session) return;

    const existingIndex = session.items.findIndex(i => i.barcode === item.barcode);

    let updatedItems: ReceiptItem[];

    if (existingIndex >= 0) {
      updatedItems = [...session.items];
      updatedItems[existingIndex] = item;
    } else {
      updatedItems = [...session.items, item];
    }

    setSession({ ...session, items: updatedItems });
    setShowItemDetail(null);

    toast.success('Ürün kaydedildi');
  };

  // Complete receipt
  const completeReceipt = async () => {
    if (!session) return;

    if (session.items.length === 0) {
      toast.error('En az bir ürün kabul edilmeli');
      return;
    }

    const completedSession: GoodsReceiptSession = {
      ...session,
      status: 'COMPLETED',
      completed_at: new Date().toISOString()
    };

    // Save to API
    try {
      // await api.saveGoodsReceipt(completedSession);
      toast.success('Mal kabul tamamlandı');

      localStorage.removeItem('goods_receipt_session');
      setSession(null);
    } catch (error) {
      toast.error('Kayıt hatası');
    }
  };

  // Stats
  const stats = session ? {
    total: session.items.length,
    fullReceived: session.items.filter(i => i.received_quantity === i.ordered_quantity).length,
    partial: session.items.filter(i => i.received_quantity > 0 && i.received_quantity < i.ordered_quantity).length,
    damaged: session.items.filter(i => i.damaged_quantity > 0).length
  } : null;

  if (!session) {
    return (
      <div className="min-h-screen bg-gray-100 p-4">
        <div className="max-w-md mx-auto">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-center mb-6">
              <Package className="w-16 h-16 mx-auto text-green-600 mb-4" />
              <h1 className="text-xl mb-2">Mal Kabul</h1>
              <p className="text-sm text-gray-600">Yeni mal kabul başlatın</p>
            </div>

            <button
              onClick={() => startSession('PO-001', 'Test Tedarikçi A.Ş.')}
              className="w-full bg-green-600 text-white py-3 rounded-lg hover:bg-green-700"
            >
              Mal Kabul Başlat
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Item detail modal
  if (showItemDetail) {
    return (
      <div className="min-h-screen bg-gray-100 p-4">
        <div className="max-w-md mx-auto bg-white rounded-lg shadow">
          {/* Header */}
          <div className="bg-green-600 text-white p-4 rounded-t-lg">
            <h2 className="text-lg mb-1">{showItemDetail.product_name}</h2>
            <div className="text-sm opacity-90">{showItemDetail.product_code}</div>
          </div>

          <div className="p-4 space-y-4">
            {/* Quantities */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-blue-50 p-3 rounded">
                <div className="text-xs text-gray-600 mb-1">Sipariş Miktarı</div>
                <div className="text-2xl text-blue-600">{showItemDetail.ordered_quantity}</div>
              </div>
              <div>
                <label className="text-xs text-gray-600 block mb-1">Teslim Alınan</label>
                <input
                  type="number"
                  value={showItemDetail.received_quantity}
                  onChange={(e) => setShowItemDetail({
                    ...showItemDetail,
                    received_quantity: parseInt(e.target.value) || 0
                  })}
                  className="w-full px-3 py-2 border rounded text-2xl text-center"
                />
              </div>
            </div>

            {/* Damaged */}
            <div>
              <label className="text-xs text-gray-600 block mb-1">Hasarlı/Eksik</label>
              <input
                type="number"
                value={showItemDetail.damaged_quantity}
                onChange={(e) => setShowItemDetail({
                  ...showItemDetail,
                  damaged_quantity: parseInt(e.target.value) || 0
                })}
                className="w-full px-3 py-2 border rounded text-center"
              />
            </div>

            {/* Lot & Expiry */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-gray-600 block mb-1">Lot No</label>
                <input
                  type="text"
                  value={showItemDetail.lot_number || ''}
                  onChange={(e) => setShowItemDetail({
                    ...showItemDetail,
                    lot_number: e.target.value
                  })}
                  placeholder="LOT-001"
                  className="w-full px-3 py-2 border rounded text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-gray-600 block mb-1">SKT</label>
                <input
                  type="date"
                  value={showItemDetail.expiry_date || ''}
                  onChange={(e) => setShowItemDetail({
                    ...showItemDetail,
                    expiry_date: e.target.value
                  })}
                  className="w-full px-3 py-2 border rounded text-sm"
                />
              </div>
            </div>

            {/* Photo */}
            <div>
              <label className="text-xs text-gray-600 block mb-2">Fotoğraf</label>
              
              {capturedPhoto ? (
                <div className="relative">
                  <img src={capturedPhoto} alt="Captured" className="w-full rounded-lg" />
                  <button
                    onClick={() => setCapturedPhoto(null)}
                    className="absolute top-2 right-2 bg-red-600 text-white p-1 rounded-full"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : isScanning ? (
                <div className="relative bg-black rounded-lg" style={{ height: '200px' }}>
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    className="w-full h-full object-cover rounded-lg"
                  />
                  <button
                    onClick={capturePhoto}
                    className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-white p-3 rounded-full"
                  >
                    <Camera className="w-6 h-6 text-gray-700" />
                  </button>
                  <button
                    onClick={stopCamera}
                    className="absolute top-2 right-2 bg-red-600 text-white p-2 rounded-full"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={startCamera}
                  className="w-full border-2 border-dashed border-gray-300 rounded-lg py-8 hover:border-green-500 hover:bg-green-50 transition-colors"
                >
                  <ImageIcon className="w-8 h-8 mx-auto text-gray-400 mb-2" />
                  <div className="text-sm text-gray-600">Fotoğraf Çek</div>
                </button>
              )}
            </div>

            {/* Notes */}
            <div>
              <label className="text-xs text-gray-600 block mb-1">Notlar</label>
              <textarea
                value={showItemDetail.notes || ''}
                onChange={(e) => setShowItemDetail({
                  ...showItemDetail,
                  notes: e.target.value
                })}
                rows={2}
                className="w-full px-3 py-2 border rounded text-sm"
                placeholder="Ek notlar..."
              />
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setShowItemDetail(null)}
                className="flex-1 bg-gray-200 text-gray-700 py-3 rounded-lg hover:bg-gray-300"
              >
                İptal
              </button>
              <button
                onClick={() => {
                  if (capturedPhoto) {
                    showItemDetail.photos.push(capturedPhoto);
                  }
                  updateItem(showItemDetail);
                }}
                className="flex-1 bg-green-600 text-white py-3 rounded-lg hover:bg-green-700"
              >
                Kaydet
              </button>
            </div>
          </div>
        </div>

        <canvas ref={canvasRef} className="hidden" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Header */}
      <div className="bg-green-600 text-white p-4">
        <h1 className="text-lg mb-1">Mal Kabul</h1>
        <div className="text-sm opacity-90">{session.supplier_name}</div>
        <div className="text-xs opacity-75">Sipariş: {session.purchase_order_id}</div>
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
              <div className="text-gray-600">Tam</div>
              <div className="text-base text-green-600">{stats.fullReceived}</div>
            </div>
            <div>
              <div className="text-gray-600">Kısmi</div>
              <div className="text-base text-orange-600">{stats.partial}</div>
            </div>
            <div>
              <div className="text-gray-600">Hasarlı</div>
              <div className="text-base text-red-600">{stats.damaged}</div>
            </div>
          </div>
        </div>
      )}

      {/* Scanner */}
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
            placeholder="Barkod okutun"
            className="flex-1 px-4 py-3 border rounded-lg text-base"
          />
          <button
            onClick={startCamera}
            className="bg-green-600 text-white px-4 rounded-lg"
          >
            <Camera className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Items */}
      <div className="flex-1 overflow-auto p-4 space-y-2">
        {session.items.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            <Package className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Henüz ürün kabul edilmedi</p>
          </div>
        ) : (
          session.items.map((item) => (
            <div
              key={item.id}
              onClick={() => setShowItemDetail(item)}
              className="bg-white rounded-lg p-3 border shadow-sm active:bg-gray-50"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <div className="text-sm mb-1">{item.product_name}</div>
                  <div className="text-xs text-gray-600">{item.product_code}</div>
                </div>
                {item.received_quantity === item.ordered_quantity ? (
                  <Check className="w-5 h-5 text-green-600" />
                ) : item.received_quantity > 0 ? (
                  <AlertTriangle className="w-5 h-5 text-orange-500" />
                ) : (
                  <X className="w-5 h-5 text-gray-400" />
                )}
              </div>

              <div className="flex items-center justify-between text-xs">
                <div className="flex gap-3">
                  <div>
                    <span className="text-gray-600">Sipariş:</span>
                    <span className="ml-1">{item.ordered_quantity}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Alınan:</span>
                    <span className="ml-1 font-medium">{item.received_quantity}</span>
                  </div>
                  {item.damaged_quantity > 0 && (
                    <div className="text-red-600">
                      Hasarlı: {item.damaged_quantity}
                    </div>
                  )}
                </div>

                {item.photos.length > 0 && (
                  <div className="flex items-center gap-1 text-gray-600">
                    <ImageIcon className="w-3 h-3" />
                    <span>{item.photos.length}</span>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Actions */}
      <div className="bg-white border-t p-4">
        <button
          onClick={completeReceipt}
          disabled={session.items.length === 0}
          className="w-full bg-green-600 text-white py-3 rounded-lg hover:bg-green-700 disabled:bg-gray-300 flex items-center justify-center gap-2"
        >
          <Check className="w-5 h-5" />
          Mal Kabulü Tamamla
        </button>
      </div>
    </div>
  );
}

