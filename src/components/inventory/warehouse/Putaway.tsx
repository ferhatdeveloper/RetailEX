import { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft, Scan, Package, CheckCircle, AlertCircle,
  MapPin, Check, X, Box, Navigation, TrendingUp, Zap
} from 'lucide-react';

interface PutawayItem {
  barcode: string;
  productName: string;
  quantity: number;
  suggestedLocation: string;
  actualLocation?: string;
  putaway: boolean;
}

interface PutawayProps {
  onBack: () => void;
}

export function Putaway({ onBack }: PutawayProps) {
  const [step, setStep] = useState<'receipt-scan' | 'putaway' | 'complete'>('receipt-scan');
  const [receiptNumber, setReceiptNumber] = useState('');
  const [scannedBarcode, setScannedBarcode] = useState('');
  const [putawayList, setPutawayList] = useState<PutawayItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [locationInput, setLocationInput] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
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

  const handleReceiptScan = (receiptNo: string) => {
    if (receiptNo.startsWith('GR-')) {
      setReceiptNumber(receiptNo);
      
      // Mock putaway list with smart location suggestions
      const mockList: PutawayItem[] = [
        { barcode: '8690012345678', productName: 'Samsung Galaxy S24', quantity: 10, suggestedLocation: 'A-01-05', putaway: false },
        { barcode: '8690087654321', productName: 'iPhone 15 Pro', quantity: 5, suggestedLocation: 'A-02-10', putaway: false },
        { barcode: '8690099887766', productName: 'AirPods Pro', quantity: 20, suggestedLocation: 'B-03-15', putaway: false },
      ];
      
      setPutawayList(mockList);
      setStep('putaway');
      vibrate();
      beep(true);
    } else {
      beep(false);
      vibrate();
    }
  };

  const handleLocationScan = (location: string) => {
    const currentItem = putawayList[currentIndex];
    
    if (!currentItem) return;

    const updatedList = [...putawayList];
    updatedList[currentIndex].actualLocation = location;
    updatedList[currentIndex].putaway = true;
    setPutawayList(updatedList);

    if (location !== currentItem.suggestedLocation) {
      alert(`⚠️ Farklı lokasyon! Önerilen: ${currentItem.suggestedLocation}, Seçilen: ${location}`);
    }

    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 1500);
    
    if (currentIndex < putawayList.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
    
    setLocationInput('');
    vibrate();
    beep(true);
  };

  const handleComplete = () => {
    console.log('Completing putaway:', { receiptNumber, items: putawayList });
    vibrate();
    beep(true);
    onBack();
  };

  const isPutawayComplete = () => {
    return putawayList.every(item => item.putaway);
  };

  // Receipt Scan
  if (step === 'receipt-scan') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-teal-50 to-teal-100">
        <div className="bg-gradient-to-r from-teal-600 to-teal-700 text-white p-4 sticky top-0 z-10 shadow-lg">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-lg">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex-1">
              <h1 className="text-lg font-bold">Mal Yerleştirme</h1>
              <p className="text-xs text-teal-100">Putaway</p>
            </div>
          </div>
        </div>

        <div className="p-6 flex flex-col items-center justify-center min-h-[70vh]">
          <div className="w-32 h-32 bg-teal-500 rounded-3xl flex items-center justify-center mb-6 animate-pulse shadow-xl">
            <Box className="w-16 h-16 text-white" />
          </div>
          
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Mal Kabul Fişi</h2>
          <p className="text-gray-600 text-center mb-8">
            Yerleştirilecek malların kabul fişini okutun<br />
            <span className="text-sm text-gray-500">Örn: GR-2024-001</span>
          </p>

          <div className="w-full max-w-md">
            <input
              ref={inputRef}
              type="text"
              value={scannedBarcode}
              onChange={(e) => setScannedBarcode(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && scannedBarcode) {
                  handleReceiptScan(scannedBarcode);
                  setScannedBarcode('');
                }
              }}
              placeholder="Kabul fişi barkodu..."
              className="w-full px-4 py-4 text-lg border-2 border-teal-300 rounded-xl focus:outline-none focus:border-teal-500 text-center font-mono"
            />
            
            <button
              onClick={() => {
                const receipt = prompt('Kabul fişi numarası:');
                if (receipt) handleReceiptScan(receipt);
              }}
              className="w-full mt-3 px-4 py-3 bg-white border-2 border-teal-300 text-teal-700 rounded-xl font-medium hover:bg-teal-50"
            >
              Manuel Giriş
            </button>
          </div>

          <div className="mt-8 p-4 bg-blue-50 rounded-xl max-w-md">
            <p className="text-sm text-blue-900 font-medium mb-2">ğŸ¯ Smart Putaway:</p>
            <ul className="text-xs text-blue-800 space-y-1">
              <li>• Akıllı konum önerisi</li>
              <li>• ABC analizi bazlı yerleştirme</li>
              <li>• Boş raf tespiti</li>
              <li>• Hızlı erişim optimizasyonu</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  // Putaway Process
  if (step === 'putaway') {
    const currentItem = putawayList[currentIndex];
    const progress = Math.round((putawayList.filter(i => i.putaway).length / putawayList.length) * 100);

    return (
      <div className="min-h-screen bg-gradient-to-br from-teal-50 to-teal-100 overflow-y-auto">
        <div className="bg-gradient-to-r from-teal-600 to-teal-700 text-white p-4 sticky top-0 z-10 shadow-lg">
          <div className="flex items-center gap-3 mb-3">
            <button onClick={() => setStep('receipt-scan')} className="p-2 hover:bg-white/10 rounded-lg">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex-1">
              <h1 className="text-lg font-bold">Yerleştirme</h1>
              <p className="text-xs text-teal-100">{receiptNumber}</p>
            </div>
            {isPutawayComplete() && (
              <button
                onClick={() => setStep('complete')}
                className="px-4 py-2 bg-white/20 backdrop-blur-sm rounded-lg font-medium text-sm"
              >
                Tamamla
              </button>
            )}
          </div>

          {/* Progress */}
          <div className="mb-2">
            <div className="flex items-center justify-between text-xs mb-1">
              <span>İlerleme</span>
              <span className="font-bold">
                {putawayList.filter(i => i.putaway).length} / {putawayList.length} • {progress}%
              </span>
            </div>
            <div className="w-full bg-white/20 rounded-full h-2">
              <div
                className="h-2 bg-white rounded-full transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>

        {/* Current Item */}
        {currentItem && !currentItem.putaway && (
          <div className="p-6">
            {/* Product Info */}
            <div className="bg-white rounded-2xl p-5 shadow-lg mb-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 bg-teal-100 rounded-xl flex items-center justify-center">
                  <Package className="w-6 h-6 text-teal-600" />
                </div>
                <div className="flex-1">
                  <div className="font-bold text-gray-900">{currentItem.productName}</div>
                  <div className="text-sm text-gray-500 font-mono">{currentItem.barcode}</div>
                </div>
                <div className="text-2xl font-bold text-teal-600">{currentItem.quantity}</div>
              </div>
            </div>

            {/* Suggested Location */}
            <div className="bg-gradient-to-r from-teal-500 to-teal-600 text-white rounded-2xl p-6 shadow-xl mb-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
                  <Zap className="w-6 h-6" />
                </div>
                <div className="flex-1">
                  <div className="text-sm text-teal-100">Önerilen Konum:</div>
                  <div className="text-3xl font-bold font-mono">{currentItem.suggestedLocation}</div>
                </div>
                <Navigation className="w-8 h-8 text-white" />
              </div>
              
              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3 text-sm">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp className="w-4 h-4" />
                  <span className="font-medium">Optimum Konum</span>
                </div>
                <div className="text-xs text-teal-100">
                  • Yüksek devir ürünü<br />
                  • Hızlı erişim bölgesi<br />
                  • Yeterli kapasite mevcut
                </div>
              </div>
            </div>

            {/* Location Scanner */}
            <div className="bg-white rounded-2xl p-6 shadow-lg">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Raf Konumu Okutun</h3>
              
              <input
                ref={inputRef}
                type="text"
                value={locationInput}
                onChange={(e) => setLocationInput(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && locationInput) {
                    handleLocationScan(locationInput);
                  }
                }}
                placeholder="Raf barkodu (A-01-05)..."
                className="w-full px-4 py-4 text-xl border-2 border-teal-300 rounded-xl focus:outline-none focus:border-teal-500 text-center font-mono mb-3"
              />

              <button
                onClick={() => {
                  if (currentItem.suggestedLocation) {
                    handleLocationScan(currentItem.suggestedLocation);
                  }
                }}
                className="w-full py-3 bg-teal-100 border-2 border-teal-300 text-teal-700 rounded-xl font-bold hover:bg-teal-200 mb-2"
              >
                Önerilen Konumu Kullan ({currentItem.suggestedLocation})
              </button>

              <button
                onClick={() => {
                  const loc = prompt('Farklı konum kodu:');
                  if (loc) handleLocationScan(loc);
                }}
                className="w-full py-3 bg-gray-100 border-2 border-gray-300 text-gray-700 rounded-xl font-bold hover:bg-gray-200"
              >
                Farklı Konum Gir
              </button>
            </div>
          </div>
        )}

        {showSuccess && (
          <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 bg-teal-600 text-white px-6 py-3 rounded-full shadow-lg flex items-center gap-2 animate-bounce z-50">
            <CheckCircle className="w-5 h-5" />
            <span className="font-medium">Yerleştirildi!</span>
          </div>
        )}

        {/* Putaway List */}
        <div className="p-6 pt-0">
          <h3 className="text-sm font-bold text-gray-700 mb-3">
            Yerleştirme Listesi ({putawayList.filter(i => i.putaway).length}/{putawayList.length})
          </h3>
          <div className="space-y-2">
            {putawayList.map((item, idx) => (
              <div
                key={idx}
                className={`bg-white rounded-xl p-4 shadow-sm transition-all ${
                  idx === currentIndex && !item.putaway
                    ? 'border-2 border-teal-500 shadow-md'
                    : item.putaway
                    ? 'border-l-4 border-green-500 opacity-60'
                    : 'border border-gray-200'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {item.putaway ? (
                      <CheckCircle className="w-5 h-5 text-green-600" />
                    ) : idx === currentIndex ? (
                      <div className="w-5 h-5 bg-teal-500 rounded-full animate-pulse" />
                    ) : (
                      <div className="w-5 h-5 bg-gray-300 rounded-full" />
                    )}
                    <div className="font-medium text-gray-900">{item.productName}</div>
                  </div>
                  <div className="text-xl font-bold text-teal-600">{item.quantity}</div>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono text-gray-500">{item.barcode}</span>
                  <span className="flex items-center gap-1 text-gray-600">
                    <MapPin className="w-3 h-3" />
                    {item.putaway && item.actualLocation ? item.actualLocation : item.suggestedLocation}
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

  // Complete
  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 to-teal-100">
      <div className="bg-gradient-to-r from-teal-600 to-teal-700 text-white p-4 sticky top-0 z-10 shadow-lg">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-lg">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold">Tamamlandı</h1>
            <p className="text-xs text-teal-100">{receiptNumber}</p>
          </div>
        </div>
      </div>

      <div className="p-6">
        <div className="bg-white rounded-2xl p-6 shadow-lg text-center">
          <div className="w-24 h-24 bg-green-100 rounded-3xl flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-12 h-12 text-green-600" />
          </div>
          
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Yerleştirme Tamamlandı!</h2>
          <p className="text-gray-600 mb-6">Tüm ürünler raflara yerleştirildi</p>

          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="p-3 bg-teal-50 rounded-xl text-center">
              <div className="text-xs text-gray-600 mb-1">Toplam Ürün</div>
              <div className="text-2xl font-bold text-teal-600">{putawayList.length}</div>
            </div>
            <div className="p-3 bg-green-50 rounded-xl text-center">
              <div className="text-xs text-gray-600 mb-1">Toplam Adet</div>
              <div className="text-2xl font-bold text-green-600">
                {putawayList.reduce((sum, item) => sum + item.quantity, 0)}
              </div>
            </div>
          </div>

          <button
            onClick={handleComplete}
            className="w-full py-3 bg-gradient-to-r from-teal-600 to-teal-700 text-white rounded-xl font-bold hover:shadow-lg"
          >
            Ana Menü
          </button>
        </div>
      </div>
    </div>
  );
}







