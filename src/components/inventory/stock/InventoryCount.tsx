import { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft, Scan, Package, CheckCircle, AlertCircle,
  Plus, Minus, Check, X, Save, List, BarChart3,
  MapPin, Calendar, User, Upload, Download, RefreshCw,
  Building, Loader2
} from 'lucide-react';
import { postgres } from '../../../services/postgres';
import { stockCountAPI } from '../../../services/stockCountAPI';

interface CountedItem {
  barcode: string;
  productId: string;
  productName: string;
  location: string;
  systemQty: number;
  countedQty: number;
  variance: number;
  countedAt: string;
  countedBy: string;
}

interface InventoryCountProps {
  onBack: () => void;
}

export function InventoryCount({ onBack }: InventoryCountProps) {
  const [step, setStep] = useState<'type-select' | 'warehouse-select' | 'location-scan' | 'item-count' | 'summary'>('type-select');
  const [countType, setCountType] = useState<'full' | 'cycle' | 'location'>('full');
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [location, setLocation] = useState('');
  const [scannedBarcode, setScannedBarcode] = useState('');
  const [countedItems, setCountedItems] = useState<CountedItem[]>([]);
  const [currentItem, setCurrentItem] = useState<any>(null);
  const [quantity, setQuantity] = useState(1);
  const [countedBy, setCountedBy] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadWarehouses();
  }, []);

  const loadWarehouses = async () => {
    try {
      const { rows } = await postgres.query('SELECT id, name FROM stores WHERE is_active = true');
      setWarehouses(rows);
      if (rows.length > 0) setSelectedWarehouseId(rows[0].id);
    } catch (error) {
      console.error('Error loading warehouses:', error);
    }
  };

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, [step]);

  const vibrate = () => {
    if (navigator.vibrate) {
      navigator.vibrate(100);
    }
  };

  const beep = (success = true) => {
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(context.destination);

    oscillator.frequency.value = success ? 1000 : 500;
    oscillator.type = 'sine';

    gainNode.gain.setValueAtTime(0.3, context.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, context.currentTime + 0.1);

    oscillator.start(context.currentTime);
    oscillator.stop(context.currentTime + 0.1);
  };

  const handleLocationScan = (loc: string) => {
    setLocation(loc);
    setStep('item-count');
    vibrate();
    beep(true);
  };

  const handleItemScan = async (barcode: string) => {
    setSearching(true);
    try {
      // Find product by barcode or code
      const { rows } = await postgres.query(
        `SELECT p.id, p.name, p.code, p.stock
         FROM products p
         LEFT JOIN product_barcodes pb ON pb.product_id = p.id
         WHERE pb.barcode = $1 OR p.code = $1
         LIMIT 1`,
        [barcode]
      );

      if (rows.length > 0) {
        const product = rows[0];
        setCurrentItem({
          barcode: barcode,
          productId: product.id,
          productName: product.name,
          systemQty: Number(product.stock) || 0,
          location: location || '-'
        });
        setQuantity(1); // Default to 1 for easier scanning
        vibrate();
        beep(true);
      } else {
        beep(false);
        alert('Ürün bulunamadı: ' + barcode);
      }
    } catch (err) {
      console.error('Search error:', err);
      beep(false);
    } finally {
      setSearching(false);
    }
  };

  const handleAddCount = () => {
    if (currentItem) {
      const variance = quantity - currentItem.systemQty;

      setCountedItems([
        ...countedItems,
        {
          barcode: currentItem.barcode,
          productId: currentItem.productId,
          productName: currentItem.productName,
          location: currentItem.location,
          systemQty: currentItem.systemQty,
          countedQty: quantity,
          variance: quantity - currentItem.systemQty,
          countedAt: new Date().toISOString(),
          countedBy: countedBy || 'Operator'
        }
      ]);

      setCurrentItem(null);
      setScannedBarcode('');
      setQuantity(0);
      setShowSuccess(true);
      vibrate();
      beep(true);
      setTimeout(() => setShowSuccess(false), 1500);
    }
  };

  const handleComplete = async () => {
    if (countedItems.length === 0) return;

    setSaving(true);
    try {
      const warehouseName = warehouses.find(w => w.id === selectedWarehouseId)?.name || 'Depo';

      await stockCountAPI.create({
        count_no: `CNT-${Date.now().toString().slice(-6)}`,
        warehouse_id: selectedWarehouseId,
        count_date: new Date().toISOString(),
        status: 'completed',
        notes: `${countType.toUpperCase()} - ${location || 'Genel'} - Yapan: ${countedBy || 'Sistem'}`
      }, countedItems.map(item => ({
        product_id: item.productId,
        expected_quantity: item.systemQty,
        counted_quantity: item.countedQty,
        notes: item.location
      })));

      vibrate();
      beep(true);
      alert('Sayım başarıyla veritabanına kaydedildi.');
      onBack();
    } catch (err) {
      console.error('Save error:', err);
      beep(false);
      alert('Sayım kaydedilirken bir hata oluştu!');
    } finally {
      setSaving(false);
    }
  };

  const getTotalVariance = () => {
    return countedItems.reduce((sum, item) => sum + Math.abs(item.variance), 0);
  };

  const getAccuracyRate = () => {
    if (countedItems.length === 0) return 100;
    const accurateCount = countedItems.filter(item => item.variance === 0).length;
    return ((accurateCount / countedItems.length) * 100).toFixed(1);
  };

  // Type Selection
  if (step === 'type-select') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-purple-100 md:bg-white">
        <div className="bg-gradient-to-r from-purple-600 to-purple-700 text-white p-4 sticky top-0 z-10 shadow-lg">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-lg">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex-1">
              <h1 className="text-lg font-bold">Stok Sayım</h1>
              <p className="text-xs text-purple-100">Inventory Count</p>
            </div>
          </div>
        </div>

        <div className="p-6 md:p-8 max-w-4xl mx-auto">
          <h2 className="text-xl md:text-2xl font-bold text-gray-900 mb-4 md:mb-6">Sayım Türü Seçin</h2>

          {/* Count Type Options */}
          <div className="space-y-3">
            {/* Full Count */}
            <button
              onClick={() => {
                setCountType('full');
                setStep('warehouse-select');
              }}
              className="w-full md:max-w-md bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-xl p-5 md:p-6 shadow-lg hover:shadow-xl transition-all"
            >
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center">
                  <Package className="w-7 h-7" />
                </div>
                <div className="flex-1 text-left">
                  <div className="text-lg font-bold">Tam Sayım</div>
                  <div className="text-sm text-purple-100">Full Inventory Count</div>
                  <div className="text-xs text-purple-200 mt-1">Tüm depo sayımı</div>
                </div>
              </div>
            </button>

            {/* Cycle Count */}
            <button
              onClick={() => {
                setCountType('cycle');
                setStep('warehouse-select');
              }}
              className="w-full md:max-w-md bg-white border-2 border-purple-300 rounded-xl p-5 md:p-6 shadow-sm hover:shadow-md transition-all"
            >
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-purple-100 rounded-2xl flex items-center justify-center">
                  <RefreshCw className="w-7 h-7 text-purple-600" />
                </div>
                <div className="flex-1 text-left">
                  <div className="text-lg font-bold text-gray-900">Devirli Sayım</div>
                  <div className="text-sm text-gray-600">Cycle Count</div>
                  <div className="text-xs text-gray-500 mt-1">Periyodik kısmi sayım</div>
                </div>
              </div>
            </button>

            {/* Location Count */}
            <button
              onClick={() => {
                setCountType('location');
                setStep('warehouse-select');
              }}
              className="w-full md:max-w-md bg-white border-2 border-purple-300 rounded-xl p-5 md:p-6 shadow-sm hover:shadow-md transition-all"
            >
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-purple-100 rounded-2xl flex items-center justify-center">
                  <MapPin className="w-7 h-7 text-purple-600" />
                </div>
                <div className="flex-1 text-left">
                  <div className="text-lg font-bold text-gray-900">Lokasyon Sayımı</div>
                  <div className="text-sm text-gray-600">Location Count</div>
                  <div className="text-xs text-gray-500 mt-1">Belirli raf/bölge sayımı</div>
                </div>
              </div>
            </button>
          </div>

          {/* Counter Info */}
          <div className="mt-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Sayımı Yapan
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={countedBy}
                onChange={(e) => setCountedBy(e.target.value)}
                placeholder="İsim..."
                className="w-full pl-10 pr-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:border-purple-500"
              />
            </div>
          </div>

          <div className="mt-8 p-4 bg-blue-50 rounded-xl">
            <p className="text-sm text-blue-900 font-medium mb-2">ğŸ’¡ İpuçları:</p>
            <ul className="text-xs text-blue-800 space-y-1">
              <li>• Tam Sayım: Tüm depo stok kontrolü</li>
              <li>• Devirli: Günlük/haftalık rutin sayım</li>
              <li>• Lokasyon: Sadece bir raf/bölge</li>
              <li>• Scanner ile hızlı sayım yapın</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  // Warehouse Selection Step
  if (step === 'warehouse-select') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-purple-100">
        <div className="bg-gradient-to-r from-purple-600 to-purple-700 text-white p-4 sticky top-0 z-10 shadow-lg">
          <div className="flex items-center gap-3">
            <button onClick={() => setStep('type-select')} className="p-2 hover:bg-white/10 rounded-lg">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex-1">
              <h1 className="text-lg font-bold">Depo Seç</h1>
              <p className="text-xs text-purple-100">Warehouse Selection</p>
            </div>
          </div>
        </div>

        <div className="p-6 md:p-8 max-w-4xl mx-auto">
          <h2 className="text-xl md:text-2xl font-bold text-gray-900 mb-6">Sayım Yapılacak Depo</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {warehouses.map((w) => (
              <button
                key={w.id}
                onClick={() => {
                  setSelectedWarehouseId(w.id);
                  if (countType === 'location') setStep('location-scan');
                  else setStep('item-count');
                }}
                className={`p-6 rounded-2xl border-2 text-left transition-all ${selectedWarehouseId === w.id
                  ? 'border-purple-600 bg-purple-50 shadow-md'
                  : 'border-white bg-white hover:border-purple-200 shadow-sm'
                  }`}
              >
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${selectedWarehouseId === w.id ? 'bg-purple-600 text-white' : 'bg-purple-100 text-purple-600'
                    }`}>
                    <Building className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="font-bold text-gray-900">{w.name}</div>
                    <div className="text-xs text-gray-500 uppercase">Warehouse Code: {w.id.slice(0, 8)}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>

          <button
            onClick={() => {
              if (countType === 'location') setStep('location-scan');
              else setStep('item-count');
            }}
            disabled={!selectedWarehouseId}
            className="w-full mt-8 py-4 bg-purple-600 text-white rounded-xl font-bold disabled:opacity-50"
          >
            Devam Et
          </button>
        </div>
      </div>
    );
  }

  // Location Scan Step
  if (step === 'location-scan') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-purple-100">
        <div className="bg-gradient-to-r from-purple-600 to-purple-700 text-white p-4 sticky top-0 z-10 shadow-lg">
          <div className="flex items-center gap-3">
            <button onClick={() => setStep('type-select')} className="p-2 hover:bg-white/10 rounded-lg">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex-1">
              <h1 className="text-lg font-bold">Lokasyon Seç</h1>
              <p className="text-xs text-purple-100">Location Selection</p>
            </div>
          </div>
        </div>

        <div className="p-6 flex flex-col items-center justify-center min-h-[70vh]">
          <div className="w-32 h-32 bg-purple-500 rounded-3xl flex items-center justify-center mb-6 animate-pulse shadow-xl">
            <MapPin className="w-16 h-16 text-white" />
          </div>

          <h2 className="text-2xl font-bold text-gray-900 mb-2">Raf/Konum</h2>
          <p className="text-gray-600 text-center mb-8">
            Sayım yapılacak lokasyonu okutun<br />
            <span className="text-sm text-gray-500">Örn: A-01-05</span>
          </p>

          <div className="w-full max-w-md">
            <input
              ref={inputRef}
              type="text"
              value={scannedBarcode}
              onChange={(e) => setScannedBarcode(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && scannedBarcode) {
                  handleLocationScan(scannedBarcode);
                  setScannedBarcode('');
                }
              }}
              placeholder="Lokasyon barkodu..."
              className="w-full px-4 py-4 text-lg border-2 border-purple-300 rounded-xl focus:outline-none focus:border-purple-500 text-center font-mono"
            />

            <button
              onClick={() => {
                const loc = prompt('Lokasyon kodu:');
                if (loc) handleLocationScan(loc);
              }}
              className="w-full mt-3 px-4 py-3 bg-white border-2 border-purple-300 text-purple-700 rounded-xl font-medium hover:bg-purple-50"
            >
              Manuel Giriş
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Item Counting Step
  if (step === 'item-count') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-purple-100 overflow-y-auto">
        <div className="bg-gradient-to-r from-purple-600 to-purple-700 text-white p-4 sticky top-0 z-10 shadow-lg">
          <div className="flex items-center gap-3 mb-3">
            <button onClick={() => setStep('type-select')} className="p-2 hover:bg-white/10 rounded-lg">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex-1">
              <h1 className="text-lg font-bold">Stok Sayım</h1>
              <p className="text-xs text-purple-100">
                {countType === 'full' && 'Tam Sayım'}
                {countType === 'cycle' && 'Devirli Sayım'}
                {countType === 'location' && `Lokasyon: ${location}`}
              </p>
            </div>
            {countedItems.length > 0 && (
              <button
                onClick={() => setStep('summary')}
                className="px-4 py-2 bg-white/20 backdrop-blur-sm rounded-lg font-medium text-sm"
              >
                Özet ({countedItems.length})
              </button>
            )}
          </div>
        </div>

        {!currentItem ? (
          <div className="p-6">
            <div className="bg-white rounded-2xl p-6 text-center shadow-lg border-2 border-dashed border-purple-300">
              <div className="w-20 h-20 bg-purple-100 rounded-2xl flex items-center justify-center mx-auto mb-4 animate-pulse">
                <Scan className="w-10 h-10 text-purple-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Ürün Barkodu Okutun</h3>
              <p className="text-sm text-gray-600 mb-4">Sayılacak ürünü okutun</p>

              <input
                ref={inputRef}
                type="text"
                value={scannedBarcode}
                onChange={(e) => setScannedBarcode(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && scannedBarcode) {
                    handleItemScan(scannedBarcode);
                    setScannedBarcode('');
                  }
                }}
                placeholder="Barkod..."
                className="w-full px-4 py-3 border-2 border-purple-300 rounded-xl focus:outline-none focus:border-purple-500 text-center font-mono text-lg"
              />
            </div>
          </div>
        ) : (
          <div className="p-6">
            <div className="bg-white rounded-2xl p-6 shadow-lg">
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-purple-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                  <CheckCircle className="w-8 h-8 text-purple-600" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-1">{currentItem.productName}</h3>
                <p className="text-sm text-gray-500 font-mono">{currentItem.barcode}</p>
                <p className="text-xs text-gray-600 mt-2 flex items-center justify-center gap-1">
                  <MapPin className="w-3" />
                  {currentItem.location}
                </p>
                {searching && (
                  <div className="mt-2 flex items-center justify-center gap-2 text-purple-600 text-xs font-bold">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    ARANIYOR...
                  </div>
                )}
              </div>

              {/* System vs Count */}
              <div className="grid grid-cols-2 gap-3 mb-6">
                <div className="p-3 bg-blue-50 rounded-xl text-center">
                  <div className="text-xs text-gray-600 mb-1">Sistem Stoğu</div>
                  <div className="text-2xl font-bold text-blue-600">{currentItem.systemQty}</div>
                </div>
                <div className="p-3 bg-purple-50 rounded-xl text-center">
                  <div className="text-xs text-gray-600 mb-1">Sayılan</div>
                  <div className="text-2xl font-bold text-purple-600">{quantity}</div>
                </div>
              </div>

              {/* Variance Warning */}
              {quantity > 0 && quantity !== currentItem.systemQty && (
                <div className={`p-3 rounded-xl mb-4 ${Math.abs(quantity - currentItem.systemQty) > 5
                  ? 'bg-red-50 border-2 border-red-300'
                  : 'bg-yellow-50 border-2 border-yellow-300'
                  }`}>
                  <div className="flex items-center gap-2 justify-center">
                    <AlertCircle className={`w-5 h-5 ${Math.abs(quantity - currentItem.systemQty) > 5 ? 'text-red-600' : 'text-yellow-600'
                      }`} />
                    <span className={`font-bold ${Math.abs(quantity - currentItem.systemQty) > 5 ? 'text-red-600' : 'text-yellow-600'
                      }`}>
                      Fark: {quantity - currentItem.systemQty > 0 ? '+' : ''}{quantity - currentItem.systemQty}
                    </span>
                  </div>
                </div>
              )}

              {/* Quantity Controls */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">Sayılan Miktar</label>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setQuantity(Math.max(0, quantity - 1))}
                    className="w-14 h-14 bg-red-500 text-white rounded-xl font-bold text-2xl flex items-center justify-center hover:bg-red-600 active:scale-95 transition-transform"
                  >
                    <Minus className="w-6 h-6" />
                  </button>
                  <input
                    type="number"
                    value={quantity}
                    onChange={(e) => setQuantity(Math.max(0, parseInt(e.target.value) || 0))}
                    className="flex-1 px-4 py-3 text-3xl font-bold border-2 border-gray-300 rounded-xl text-center focus:outline-none focus:border-purple-500"
                  />
                  <button
                    onClick={() => setQuantity(quantity + 1)}
                    className="w-14 h-14 bg-green-500 text-white rounded-xl font-bold text-2xl flex items-center justify-center hover:bg-green-600 active:scale-95 transition-transform"
                  >
                    <Plus className="w-6 h-6" />
                  </button>
                </div>

                <div className="grid grid-cols-5 gap-2 mt-3">
                  {[0, 10, 25, 50, 100].map((q) => (
                    <button
                      key={q}
                      onClick={() => setQuantity(q)}
                      className="py-2 bg-gray-100 rounded-lg font-medium text-sm hover:bg-gray-200 active:scale-95 transition-transform"
                    >
                      {q}
                    </button>
                  ))}
                </div>

                {/* System Qty Quick Set */}
                <button
                  onClick={() => setQuantity(currentItem.systemQty)}
                  className="w-full mt-3 py-2 bg-blue-100 border border-blue-300 text-blue-700 rounded-lg font-medium text-sm hover:bg-blue-200"
                >
                  Sistem Stoğu ({currentItem.systemQty})
                </button>
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setCurrentItem(null);
                    setScannedBarcode('');
                    setQuantity(0);
                  }}
                  className="flex-1 py-3 border-2 border-gray-300 rounded-xl font-bold hover:bg-gray-50 active:scale-95 transition-transform"
                >
                  <X className="w-5 h-5 mx-auto" />
                </button>
                <button
                  onClick={handleAddCount}
                  className="flex-1 py-3 bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-xl font-bold hover:shadow-lg active:scale-95 transition-transform"
                >
                  <Check className="w-5 h-5 mx-auto" />
                </button>
              </div>
            </div>
          </div>
        )}

        {showSuccess && (
          <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 bg-purple-600 text-white px-6 py-3 rounded-full shadow-lg flex items-center gap-2 animate-bounce z-50">
            <CheckCircle className="w-5 h-5" />
            <span className="font-medium">Kaydedildi!</span>
          </div>
        )}

        {countedItems.length > 0 && (
          <div className="p-6 pt-0">
            <h3 className="text-sm font-bold text-gray-700 mb-3">
              Sayılan Ürünler ({countedItems.length})
            </h3>
            <div className="space-y-2">
              {countedItems.map((item, idx) => (
                <div key={idx} className={`bg-white rounded-xl p-4 shadow-sm border-l-4 ${item.variance === 0 ? 'border-green-500' :
                  Math.abs(item.variance) > 5 ? 'border-red-500' :
                    'border-yellow-500'
                  }`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-gray-900">{item.productName}</span>
                    <div className="text-right">
                      <div className="text-xl font-bold text-purple-600">{item.countedQty}</div>
                      <div className="text-xs text-gray-500">Sistem: {item.systemQty}</div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono text-gray-500">{item.barcode}</span>
                    {item.variance !== 0 && (
                      <span className={`font-bold ${Math.abs(item.variance) > 5 ? 'text-red-600' : 'text-yellow-600'
                        }`}>
                        Fark: {item.variance > 0 ? '+' : ''}{item.variance}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="h-20"></div>
      </div>
    );
  }

  // Summary Step
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-purple-100 overflow-y-auto">
      <div className="bg-gradient-to-r from-purple-600 to-purple-700 text-white p-4 sticky top-0 z-10 shadow-lg">
        <div className="flex items-center gap-3">
          <button onClick={() => setStep('item-count')} className="p-2 hover:bg-white/10 rounded-lg">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold">Sayım Özeti</h1>
            <p className="text-xs text-purple-100">Count Summary</p>
          </div>
        </div>
      </div>

      <div className="p-6">
        {/* Statistics */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-white rounded-xl p-4 shadow-sm text-center">
            <div className="text-xs text-gray-600 mb-1">Toplam Ürün</div>
            <div className="text-2xl font-bold text-purple-600">{countedItems.length}</div>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm text-center">
            <div className="text-xs text-gray-600 mb-1">Doğruluk Oranı</div>
            <div className="text-2xl font-bold text-green-600">{getAccuracyRate()}%</div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Toplam Fark (Mutlak)</span>
            <span className="text-xl font-bold text-orange-600">{getTotalVariance()}</span>
          </div>
        </div>

        {/* Counted Items */}
        <h3 className="text-sm font-bold text-gray-700 mb-3">Detaylar</h3>
        <div className="space-y-2 mb-4">
          {countedItems.map((item, idx) => (
            <div key={idx} className="bg-white rounded-xl p-4 shadow-sm">
              <div className="flex justify-between items-start mb-2">
                <div className="flex-1">
                  <div className="font-medium text-gray-900">{item.productName}</div>
                  <div className="text-xs text-gray-500 font-mono mt-1">{item.barcode}</div>
                  <div className="text-xs text-gray-600 flex items-center gap-1 mt-1">
                    <MapPin className="w-3 h-3" />
                    {item.location}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xl font-bold text-purple-600">{item.countedQty}</div>
                  <div className="text-xs text-gray-500">Sistem: {item.systemQty}</div>
                  {item.variance !== 0 && (
                    <div className={`text-xs font-bold mt-1 ${Math.abs(item.variance) > 5 ? 'text-red-600' : 'text-yellow-600'
                      }`}>
                      {item.variance > 0 ? '+' : ''}{item.variance}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Info */}
        <div className="bg-blue-50 rounded-xl p-4 mb-4">
          <div className="text-xs text-blue-900 space-y-1">
            <div className="flex items-center justify-between">
              <span>Sayım Türü:</span>
              <span className="font-bold">
                {countType === 'full' && 'Tam Sayım'}
                {countType === 'cycle' && 'Devirli Sayım'}
                {countType === 'location' && 'Lokasyon Sayımı'}
              </span>
            </div>
            {location && (
              <div className="flex items-center justify-between">
                <span>Lokasyon:</span>
                <span className="font-bold">{location}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span>Sayımı Yapan:</span>
              <span className="font-bold">{countedBy || 'Operator'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Tarih:</span>
              <span className="font-bold">{new Date().toLocaleString('tr-TR')}</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={() => setStep('item-count')}
            className="flex-1 py-3 border-2 border-gray-300 rounded-xl font-bold hover:bg-gray-50"
          >
            Geri
          </button>
          <button
            onClick={handleComplete}
            disabled={saving || countedItems.length === 0}
            className="flex-1 py-3 bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-xl font-bold hover:shadow-lg flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            {saving ? 'Kaydediliyor...' : 'Tamamla'}
          </button>
        </div>
      </div>

      <div className="h-20"></div>
    </div>
  );
}


