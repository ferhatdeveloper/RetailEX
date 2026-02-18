import { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft, Scan, Package, CheckCircle, AlertCircle,
  MapPin, Check, X, Box, ShoppingCart, Printer,
  User, Clock, List, BarChart, Navigation, Send
} from 'lucide-react';

interface PickItem {
  barcode: string;
  productName: string;
  orderedQty: number;
  pickedQty: number;
  location: string;
  picked: boolean;
}

interface PickAndPackProps {
  onBack: () => void;
}

export function PickAndPack({ onBack }: PickAndPackProps) {
  const [step, setStep] = useState<'order-scan' | 'picking' | 'packing' | 'complete'>('order-scan');
  const [orderNumber, setOrderNumber] = useState('');
  const [scannedBarcode, setScannedBarcode] = useState('');
  const [pickList, setPickList] = useState<PickItem[]>([]);
  const [currentPickIndex, setCurrentPickIndex] = useState(0);
  const [scannedCount, setScannedCount] = useState(0);
  const [boxCount, setBoxCount] = useState(1);
  const [weight, setWeight] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [picker, setPicker] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

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

  const handleOrderScan = (orderNo: string) => {
    if (orderNo.startsWith('SO-')) {
      setOrderNumber(orderNo);
      
      // Mock pick list
      const mockPickList: PickItem[] = [
        { barcode: '8690012345678', productName: 'Samsung Galaxy S24', orderedQty: 2, pickedQty: 0, location: 'A-01-05', picked: false },
        { barcode: '8690087654321', productName: 'iPhone 15 Pro', orderedQty: 1, pickedQty: 0, location: 'A-02-10', picked: false },
        { barcode: '8690099887766', productName: 'AirPods Pro', orderedQty: 3, pickedQty: 0, location: 'B-03-15', picked: false },
      ];
      
      setPickList(mockPickList);
      setStep('picking');
      vibrate();
      beep(true);
    } else {
      beep(false);
      vibrate();
    }
  };

  const handleItemScan = (barcode: string) => {
    const currentItem = pickList[currentPickIndex];
    
    if (!currentItem) {
      beep(false);
      alert('Tüm ürünler toplandı!');
      return;
    }

    if (currentItem.barcode === barcode) {
      const newPickedQty = currentItem.pickedQty + 1;
      
      if (newPickedQty <= currentItem.orderedQty) {
        setScannedCount(scannedCount + 1);
        
        const updatedList = [...pickList];
        updatedList[currentPickIndex].pickedQty = newPickedQty;
        
        if (newPickedQty === currentItem.orderedQty) {
          updatedList[currentPickIndex].picked = true;
          setShowSuccess(true);
          setTimeout(() => setShowSuccess(false), 1500);
          
          // Move to next item
          if (currentPickIndex < pickList.length - 1) {
            setCurrentPickIndex(currentPickIndex + 1);
          }
        }
        
        setPickList(updatedList);
        vibrate();
        beep(true);
      } else {
        beep(false);
        alert('Sipariş miktarını aştınız!');
      }
    } else {
      beep(false);
      vibrate();
      alert('Yanlış ürün! Lütfen doğru ürünü okutun.');
    }
  };

  const isPickingComplete = () => {
    return pickList.every(item => item.picked);
  };

  const getTotalPicked = () => {
    return pickList.reduce((sum, item) => sum + item.pickedQty, 0);
  };

  const getTotalOrdered = () => {
    return pickList.reduce((sum, item) => sum + item.orderedQty, 0);
  };

  const handleComplete = () => {
    console.log('Completing pick & pack:', { orderNumber, pickList, boxCount, weight });
    vibrate();
    beep(true);
    onBack();
  };

  // Order Scan Step
  if (step === 'order-scan') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-cyan-50 to-cyan-100">
        <div className="bg-gradient-to-r from-cyan-600 to-cyan-700 text-white p-4 sticky top-0 z-10 shadow-lg">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-lg">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex-1">
              <h1 className="text-lg font-bold">Pick & Pack</h1>
              <p className="text-xs text-cyan-100">Sipariş Toplama & Paketleme</p>
            </div>
          </div>
        </div>

        <div className="p-6 flex flex-col items-center justify-center min-h-[70vh]">
          <div className="w-32 h-32 bg-cyan-500 rounded-3xl flex items-center justify-center mb-6 animate-pulse shadow-xl">
            <ShoppingCart className="w-16 h-16 text-white" />
          </div>
          
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Sipariş Numarası</h2>
          <p className="text-gray-600 text-center mb-8">
            Toplanacak sipariş numarasını okutun<br />
            <span className="text-sm text-gray-500">Örn: SO-2024-001</span>
          </p>

          <div className="w-full max-w-md">
            <input
              ref={inputRef}
              type="text"
              value={scannedBarcode}
              onChange={(e) => setScannedBarcode(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && scannedBarcode) {
                  handleOrderScan(scannedBarcode);
                  setScannedBarcode('');
                }
              }}
              placeholder="Sipariş barkodu..."
              className="w-full px-4 py-4 text-lg border-2 border-cyan-300 rounded-xl focus:outline-none focus:border-cyan-500 text-center font-mono"
            />
            
            <button
              onClick={() => {
                const order = prompt('Sipariş numarası:');
                if (order) handleOrderScan(order);
              }}
              className="w-full mt-3 px-4 py-3 bg-white border-2 border-cyan-300 text-cyan-700 rounded-xl font-medium hover:bg-cyan-50"
            >
              Manuel Giriş
            </button>

            <div className="mt-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Toplayıcı (Picker)
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={picker}
                  onChange={(e) => setPicker(e.target.value)}
                  placeholder="İsim..."
                  className="w-full pl-10 pr-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>
          </div>

          <div className="mt-8 p-4 bg-blue-50 rounded-xl max-w-md">
            <p className="text-sm text-blue-900 font-medium mb-2">ğŸ“¦ Pick & Pack:</p>
            <ul className="text-xs text-blue-800 space-y-1">
              <li>• Sipariş okut → Pick list göster</li>
              <li>• Konum bilgisi ile ürün topla</li>
              <li>• Her ürünü barkod ile doğrula</li>
              <li>• Paketleme bilgisi ekle</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  // Picking Step
  if (step === 'picking') {
    const currentItem = pickList[currentPickIndex];
    const progress = Math.round((getTotalPicked() / getTotalOrdered()) * 100);

    return (
      <div className="min-h-screen bg-gradient-to-br from-cyan-50 to-cyan-100 overflow-y-auto">
        <div className="bg-gradient-to-r from-cyan-600 to-cyan-700 text-white p-4 sticky top-0 z-10 shadow-lg">
          <div className="flex items-center gap-3 mb-3">
            <button onClick={() => setStep('order-scan')} className="p-2 hover:bg-white/10 rounded-lg">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex-1">
              <h1 className="text-lg font-bold">Toplama</h1>
              <p className="text-xs text-cyan-100">{orderNumber}</p>
            </div>
            {isPickingComplete() && (
              <button
                onClick={() => setStep('packing')}
                className="px-4 py-2 bg-white/20 backdrop-blur-sm rounded-lg font-medium text-sm"
              >
                Paketleme →
              </button>
            )}
          </div>

          {/* Progress */}
          <div className="mb-2">
            <div className="flex items-center justify-between text-xs mb-1">
              <span>İlerleme</span>
              <span className="font-bold">{getTotalPicked()} / {getTotalOrdered()} • {progress}%</span>
            </div>
            <div className="w-full bg-white/20 rounded-full h-2">
              <div
                className="h-2 bg-white rounded-full transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>

        {/* Current Item - Navigation Guide */}
        {currentItem && !currentItem.picked && (
          <div className="p-6">
            <div className="bg-gradient-to-r from-cyan-500 to-cyan-600 text-white rounded-2xl p-6 shadow-xl mb-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
                  <Navigation className="w-6 h-6" />
                </div>
                <div className="flex-1">
                  <div className="text-sm text-cyan-100">Gidilecek Raf:</div>
                  <div className="text-2xl font-bold font-mono">{currentItem.location}</div>
                </div>
              </div>
              
              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4">
                <div className="font-bold text-lg mb-1">{currentItem.productName}</div>
                <div className="text-sm text-cyan-100 font-mono">{currentItem.barcode}</div>
                <div className="flex items-center justify-between mt-3">
                  <span className="text-sm">Toplanacak:</span>
                  <span className="text-2xl font-bold">{currentItem.orderedQty - currentItem.pickedQty}</span>
                </div>
              </div>
            </div>

            {/* Scanner */}
            <div className="bg-white rounded-2xl p-6 shadow-lg border-2 border-dashed border-cyan-300">
              <div className="w-20 h-20 bg-cyan-100 rounded-2xl flex items-center justify-center mx-auto mb-4 animate-pulse">
                <Scan className="w-10 h-10 text-cyan-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2 text-center">Ürünü Okutun</h3>
              <p className="text-sm text-gray-600 mb-4 text-center">
                {currentItem.pickedQty}/{currentItem.orderedQty} toplandı
              </p>
              
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
                className="w-full px-4 py-3 border-2 border-cyan-300 rounded-xl focus:outline-none focus:border-cyan-500 text-center font-mono text-lg"
              />
            </div>
          </div>
        )}

        {showSuccess && (
          <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 bg-green-600 text-white px-6 py-3 rounded-full shadow-lg flex items-center gap-2 animate-bounce z-50">
            <CheckCircle className="w-5 h-5" />
            <span className="font-medium">Ürün Tamamlandı!</span>
          </div>
        )}

        {/* Pick List */}
        <div className="p-6 pt-0">
          <h3 className="text-sm font-bold text-gray-700 mb-3">
            Pick List ({pickList.filter(i => i.picked).length}/{pickList.length})
          </h3>
          <div className="space-y-2">
            {pickList.map((item, idx) => (
              <div
                key={idx}
                className={`bg-white rounded-xl p-4 shadow-sm transition-all ${
                  idx === currentPickIndex && !item.picked
                    ? 'border-2 border-cyan-500 shadow-md'
                    : item.picked
                    ? 'border-l-4 border-green-500 opacity-60'
                    : 'border border-gray-200'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {item.picked ? (
                      <CheckCircle className="w-5 h-5 text-green-600" />
                    ) : idx === currentPickIndex ? (
                      <div className="w-5 h-5 bg-cyan-500 rounded-full animate-pulse" />
                    ) : (
                      <div className="w-5 h-5 bg-gray-300 rounded-full" />
                    )}
                    <div className="font-medium text-gray-900">{item.productName}</div>
                  </div>
                  <div className="text-right">
                    <div className={`text-xl font-bold ${
                      item.picked ? 'text-green-600' : 'text-cyan-600'
                    }`}>
                      {item.pickedQty}/{item.orderedQty}
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span className="font-mono">{item.barcode}</span>
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {item.location}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="h-20"></div>
      </div>
    );
  }

  // Packing Step
  if (step === 'packing') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-cyan-50 to-cyan-100 overflow-y-auto">
        <div className="bg-gradient-to-r from-cyan-600 to-cyan-700 text-white p-4 sticky top-0 z-10 shadow-lg">
          <div className="flex items-center gap-3">
            <button onClick={() => setStep('picking')} className="p-2 hover:bg-white/10 rounded-lg">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex-1">
              <h1 className="text-lg font-bold">Paketleme</h1>
              <p className="text-xs text-cyan-100">{orderNumber}</p>
            </div>
          </div>
        </div>

        <div className="p-6">
          <div className="bg-white rounded-2xl p-6 shadow-lg mb-4">
            <div className="text-center mb-6">
              <div className="w-20 h-20 bg-cyan-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Package className="w-10 h-10 text-cyan-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">Paketleme Bilgileri</h2>
              <p className="text-sm text-gray-600">Koli ve ağırlık bilgilerini girin</p>
            </div>

            {/* Box Count */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">Koli Sayısı</label>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setBoxCount(Math.max(1, boxCount - 1))}
                  className="w-12 h-12 bg-red-500 text-white rounded-xl font-bold flex items-center justify-center hover:bg-red-600"
                >
                  -
                </button>
                <input
                  type="number"
                  value={boxCount}
                  onChange={(e) => setBoxCount(Math.max(1, parseInt(e.target.value) || 1))}
                  className="flex-1 px-4 py-3 text-2xl font-bold border-2 border-gray-300 rounded-xl text-center focus:outline-none focus:border-cyan-500"
                />
                <button
                  onClick={() => setBoxCount(boxCount + 1)}
                  className="w-12 h-12 bg-green-500 text-white rounded-xl font-bold flex items-center justify-center hover:bg-green-600"
                >
                  +
                </button>
              </div>
            </div>

            {/* Weight */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">Ağırlık (kg)</label>
              <input
                type="number"
                step="0.1"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                placeholder="0.0"
                className="w-full px-4 py-3 text-xl border-2 border-gray-300 rounded-xl text-center focus:outline-none focus:border-cyan-500"
              />
            </div>

            {/* Print Label */}
            <button className="w-full py-3 bg-gray-100 border-2 border-gray-300 rounded-xl font-bold hover:bg-gray-200 mb-4 flex items-center justify-center gap-2">
              <Printer className="w-5 h-5" />
              Etiket Yazdır
            </button>

            {/* Complete */}
            <button
              onClick={() => setStep('complete')}
              className="w-full py-3 bg-gradient-to-r from-cyan-600 to-cyan-700 text-white rounded-xl font-bold hover:shadow-lg flex items-center justify-center gap-2"
            >
              <Send className="w-5 h-5" />
              Gönderiye Hazır
            </button>
          </div>

          {/* Summary */}
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <h3 className="text-sm font-bold text-gray-700 mb-2">Özet</h3>
            <div className="text-xs text-gray-600 space-y-1">
              <div className="flex justify-between">
                <span>Sipariş:</span>
                <span className="font-bold">{orderNumber}</span>
              </div>
              <div className="flex justify-between">
                <span>Toplam Ürün:</span>
                <span className="font-bold">{getTotalPicked()} adet</span>
              </div>
              <div className="flex justify-between">
                <span>Koli Sayısı:</span>
                <span className="font-bold">{boxCount}</span>
              </div>
              <div className="flex justify-between">
                <span>Ağırlık:</span>
                <span className="font-bold">{weight || '--'} kg</span>
              </div>
              <div className="flex justify-between">
                <span>Toplayıcı:</span>
                <span className="font-bold">{picker || 'Operator'}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="h-20"></div>
      </div>
    );
  }

  // Complete Step
  return (
    <div className="min-h-screen bg-gradient-to-br from-cyan-50 to-cyan-100">
      <div className="bg-gradient-to-r from-cyan-600 to-cyan-700 text-white p-4 sticky top-0 z-10 shadow-lg">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-lg">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold">Tamamlandı</h1>
            <p className="text-xs text-cyan-100">{orderNumber}</p>
          </div>
        </div>
      </div>

      <div className="p-6">
        <div className="bg-white rounded-2xl p-6 shadow-lg text-center">
          <div className="w-24 h-24 bg-green-100 rounded-3xl flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-12 h-12 text-green-600" />
          </div>
          
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Sipariş Hazır!</h2>
          <p className="text-gray-600 mb-6">Pick & Pack işlemi başarıyla tamamlandı</p>

          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="p-3 bg-cyan-50 rounded-xl text-center">
              <div className="text-xs text-gray-600 mb-1">Toplam Ürün</div>
              <div className="text-2xl font-bold text-cyan-600">{getTotalPicked()}</div>
            </div>
            <div className="p-3 bg-green-50 rounded-xl text-center">
              <div className="text-xs text-gray-600 mb-1">Koli</div>
              <div className="text-2xl font-bold text-green-600">{boxCount}</div>
            </div>
          </div>

          <button
            onClick={handleComplete}
            className="w-full py-3 bg-gradient-to-r from-cyan-600 to-cyan-700 text-white rounded-xl font-bold hover:shadow-lg"
          >
            Ana Menü
          </button>
        </div>
      </div>
    </div>
  );
}







