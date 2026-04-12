import { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft, Scan, AlertTriangle, Camera, Banknote,
  User, Calendar, Package, FileText, Check, X,
  Trash2, TrendingDown, BarChart3, Image as ImageIcon,
  MapPin, Clock, MessageSquare, AlertCircle
} from 'lucide-react';

interface DamageRecord {
  barcode: string;
  productName: string;
  quantity: number;
  damageType: string;
  damageReason: string;
  location: string;
  responsiblePerson: string;
  estimatedCost: number;
  photos: string[];
  notes: string;
  recordedBy: string;
  recordedAt: string;
  status: 'pending' | 'approved' | 'rejected';
}

interface DamageRecordingProps {
  onBack: () => void;
}

export function DamageRecording({ onBack }: DamageRecordingProps) {
  const [step, setStep] = useState<'type-select' | 'product-scan' | 'details' | 'review' | 'complete'>('type-select');
  const [recordType, setRecordType] = useState<'damage' | 'loss' | null>(null);
  const [scannedBarcode, setScannedBarcode] = useState('');
  const [currentProduct, setCurrentProduct] = useState<any>(null);
  const [quantity, setQuantity] = useState(1);
  const [selectedDamageType, setSelectedDamageType] = useState('');
  const [selectedReason, setSelectedReason] = useState('');
  const [location, setLocation] = useState('');
  const [responsiblePerson, setResponsiblePerson] = useState('');
  const [estimatedCost, setEstimatedCost] = useState('');
  const [notes, setNotes] = useState('');
  const [recordedBy, setRecordedBy] = useState('');
  const [records, setRecords] = useState<DamageRecord[]>([]);
  const [showSuccess, setShowSuccess] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const damageTypes = [
    { id: 'broken', label: 'Kırık/Çatlak', icon: 'ğŸ’”', severity: 'high' },
    { id: 'scratched', label: 'Çizik/Ezik', icon: '✏️', severity: 'medium' },
    { id: 'wet', label: 'Islak/Nemli', icon: 'ğŸ’§', severity: 'high' },
    { id: 'expired', label: 'SKT Geçmiş', icon: 'ğŸ“…', severity: 'high' },
    { id: 'deformed', label: 'Deforme/Bozuk', icon: '⚠️', severity: 'high' },
    { id: 'torn', label: 'Yırtık/Açık', icon: 'ğŸ“¦', severity: 'medium' },
    { id: 'faded', label: 'Soluk/Renkli', icon: 'ğŸ¨', severity: 'low' },
    { id: 'other', label: 'Diğer', icon: 'ğŸ’¬', severity: 'medium' },
  ];

  const damageReasons = [
    { id: 'transport', label: 'Taşıma Sırasında', icon: 'ğŸšš' },
    { id: 'storage', label: 'Depolama Hatası', icon: 'ğŸ“¦' },
    { id: 'handling', label: 'Elleçleme Hatası', icon: '✋' },
    { id: 'supplier', label: 'Tedarikçi Hatası', icon: 'ğŸ­' },
    { id: 'weather', label: 'Hava Koşulları', icon: 'ğŸŒ§ï¸' },
    { id: 'equipment', label: 'Ekipman Arızası', icon: 'ğŸ”§' },
    { id: 'theft', label: 'Hırsızlık/Kayıp', icon: 'ğŸš¨' },
    { id: 'natural', label: 'Doğal Bozulma', icon: 'ğŸ‚' },
    { id: 'unknown', label: 'Bilinmiyor', icon: '❓' },
  ];

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, [step]);

  const vibrate = () => {
    if (navigator.vibrate) navigator.vibrate(100);
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

  const handleProductScan = (barcode: string) => {
    const mockProduct = {
      barcode,
      productName: `Product ${barcode.slice(-4)}`,
      stockQty: Math.floor(Math.random() * 100) + 10,
      unitPrice: Math.floor(Math.random() * 1000) + 100,
    };

    setCurrentProduct(mockProduct);
    setStep('details');
    vibrate();
    beep(true);
  };

  const handleSaveRecord = () => {
    if (!currentProduct) return;

    const newRecord: DamageRecord = {
      barcode: currentProduct.barcode,
      productName: currentProduct.productName,
      quantity,
      damageType: selectedDamageType,
      damageReason: selectedReason,
      location,
      responsiblePerson,
      estimatedCost: parseFloat(estimatedCost) || 0,
      photos: [],
      notes,
      recordedBy: recordedBy || 'Operator',
      recordedAt: new Date().toISOString(),
      status: 'pending',
    };

    setRecords([...records, newRecord]);
    
    // Reset
    setCurrentProduct(null);
    setQuantity(1);
    setSelectedDamageType('');
    setSelectedReason('');
    setLocation('');
    setResponsiblePerson('');
    setEstimatedCost('');
    setNotes('');
    setStep('product-scan');
    
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 1500);
    vibrate();
    beep(true);
  };

  const handleComplete = () => {
    console.log('Damage records completed:', records);
    vibrate();
    beep(true);
    setStep('complete');
  };

  const getTotalCost = () => {
    return records.reduce((sum, record) => sum + record.estimatedCost, 0);
  };

  const getTotalQuantity = () => {
    return records.reduce((sum, record) => sum + record.quantity, 0);
  };

  // Type Selection
  if (step === 'type-select') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 to-orange-100">
        <div className="bg-gradient-to-r from-orange-600 to-orange-700 text-white p-4 sticky top-0 z-10 shadow-lg">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-lg">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex-1">
              <h1 className="text-lg font-bold">Hasar/Fire Kaydı</h1>
              <p className="text-xs text-orange-100">Damage & Loss Recording</p>
            </div>
          </div>
        </div>

        <div className="p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Kayıt Türü Seçin</h2>

          {/* Damage */}
          <button
            onClick={() => {
              setRecordType('damage');
              setStep('product-scan');
            }}
            className="w-full bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl p-6 shadow-lg hover:shadow-xl transition-all mb-4"
          >
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center">
                <AlertTriangle className="w-8 h-8" />
              </div>
              <div className="flex-1 text-left">
                <div className="text-xl font-bold">Hasar Kaydı</div>
                <div className="text-sm text-orange-100">Damage Record</div>
                <div className="text-xs text-orange-200 mt-2">
                  Hasarlı/bozuk ürün kaydı
                </div>
              </div>
              <AlertCircle className="w-8 h-8 text-white/70" />
            </div>
          </button>

          {/* Loss */}
          <button
            onClick={() => {
              setRecordType('loss');
              setStep('product-scan');
            }}
            className="w-full bg-white border-2 border-orange-300 rounded-xl p-6 shadow-sm hover:shadow-md transition-all"
          >
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-orange-100 rounded-2xl flex items-center justify-center">
                <TrendingDown className="w-8 h-8 text-orange-600" />
              </div>
              <div className="flex-1 text-left">
                <div className="text-xl font-bold text-gray-900">Fire/Kayıp Kaydı</div>
                <div className="text-sm text-gray-600">Loss Record</div>
                <div className="text-xs text-gray-500 mt-2">
                  Kayıp/çalıntı/fire kaydı
                </div>
              </div>
              <Trash2 className="w-8 h-8 text-gray-400" />
            </div>
          </button>

          <div className="mt-8 p-4 bg-red-50 rounded-xl">
            <p className="text-sm text-red-900 font-medium mb-2">⚠️ Önemli:</p>
            <ul className="text-xs text-red-800 space-y-1">
              <li>• Tüm hasar/fire kayıtları dokümante edilir</li>
              <li>• Fotoğraf çekmek önerilir</li>
              <li>• Sorumlu personel belirlenmeli</li>
              <li>• Maliyet tahmin edilmeli</li>
              <li>• Stok otomatik düşülür</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  // Product Scan
  if (step === 'product-scan') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 to-orange-100 overflow-y-auto">
        <div className="bg-gradient-to-r from-orange-600 to-orange-700 text-white p-4 sticky top-0 z-10 shadow-lg">
          <div className="flex items-center gap-3 mb-3">
            <button onClick={() => setStep('type-select')} className="p-2 hover:bg-white/10 rounded-lg">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex-1">
              <h1 className="text-lg font-bold">
                {recordType === 'damage' ? 'Hasar Kaydı' : 'Fire Kaydı'}
              </h1>
              <p className="text-xs text-orange-100">
                {recordType === 'damage' ? 'Damage Record' : 'Loss Record'}
              </p>
            </div>
            {records.length > 0 && (
              <button
                onClick={() => setStep('review')}
                className="px-4 py-2 bg-white/20 backdrop-blur-sm rounded-lg font-medium text-sm"
              >
                İncele ({records.length})
              </button>
            )}
          </div>
        </div>

        <div className="p-6">
          <div className="bg-white rounded-2xl p-6 text-center shadow-lg border-2 border-dashed border-orange-300">
            <div className="w-20 h-20 bg-orange-100 rounded-2xl flex items-center justify-center mx-auto mb-4 animate-pulse">
              <Scan className="w-10 h-10 text-orange-600" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Ürün Barkodu Okutun</h3>
            <p className="text-sm text-gray-600 mb-4">
              {recordType === 'damage' ? 'Hasarlı' : 'Kayıp'} ürünü okutun
            </p>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Kaydeden
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={recordedBy}
                  onChange={(e) => setRecordedBy(e.target.value)}
                  placeholder="İsim..."
                  className="w-full pl-10 pr-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:border-orange-500"
                />
              </div>
            </div>

            <input
              ref={inputRef}
              type="text"
              value={scannedBarcode}
              onChange={(e) => setScannedBarcode(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && scannedBarcode) {
                  handleProductScan(scannedBarcode);
                  setScannedBarcode('');
                }
              }}
              placeholder="Barkod..."
              className="w-full px-4 py-3 border-2 border-orange-300 rounded-xl focus:outline-none focus:border-orange-500 text-center font-mono text-lg"
            />
          </div>

          {records.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-bold text-gray-700 mb-3">
                Kayıtlar ({records.length})
              </h3>
              <div className="space-y-2">
                {records.map((record, idx) => (
                  <div key={idx} className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-orange-500">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-medium text-gray-900">{record.productName}</div>
                      <div className="text-right">
                        <div className="text-lg font-bold text-orange-600">{record.quantity} adet</div>
                        <div className="text-xs text-gray-500">{record.estimatedCost.toLocaleString('tr-TR')} IQD</div>
                      </div>
                    </div>
                    <div className="text-xs text-gray-600">
                      <div>
                        {damageTypes.find(t => t.id === record.damageType)?.icon}{' '}
                        {damageTypes.find(t => t.id === record.damageType)?.label}
                      </div>
                      <div className="font-mono text-gray-500 mt-1">{record.barcode}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {showSuccess && (
          <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 bg-orange-600 text-white px-6 py-3 rounded-full shadow-lg flex items-center gap-2 animate-bounce z-50">
            <Check className="w-5 h-5" />
            <span className="font-medium">Kaydedildi!</span>
          </div>
        )}

        <div className="h-20"></div>
      </div>
    );
  }

  // Details
  if (step === 'details' && currentProduct) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 to-orange-100 overflow-y-auto">
        <div className="bg-gradient-to-r from-orange-600 to-orange-700 text-white p-4 sticky top-0 z-10 shadow-lg">
          <div className="flex items-center gap-3">
            <button onClick={() => setStep('product-scan')} className="p-2 hover:bg-white/10 rounded-lg">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex-1">
              <h1 className="text-lg font-bold">Hasar Detayları</h1>
              <p className="text-xs text-orange-100">{currentProduct.productName}</p>
            </div>
          </div>
        </div>

        <div className="p-6">
          {/* Product Info */}
          <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center">
                <Package className="w-6 h-6 text-orange-600" />
              </div>
              <div className="flex-1">
                <div className="font-bold text-gray-900">{currentProduct.productName}</div>
                <div className="text-sm text-gray-500 font-mono">{currentProduct.barcode}</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-blue-50 rounded-lg p-2">
                <div className="text-gray-600">Stok</div>
                <div className="font-bold text-blue-600">{currentProduct.stockQty} adet</div>
              </div>
              <div className="bg-green-50 rounded-lg p-2">
                <div className="text-gray-600">Birim Fiyat</div>
                <div className="font-bold text-green-600">{currentProduct.unitPrice.toLocaleString('tr-TR')} IQD</div>
              </div>
            </div>
          </div>

          {/* Quantity */}
          <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-3">
              {recordType === 'damage' ? 'Hasarlı' : 'Kayıp'} Miktar
            </label>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                className="w-12 h-12 bg-red-500 text-white rounded-xl font-bold flex items-center justify-center hover:bg-red-600"
              >
                -
              </button>
              <input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                className="flex-1 px-4 py-3 text-2xl font-bold border-2 border-gray-300 rounded-xl text-center focus:outline-none focus:border-orange-500"
              />
              <button
                onClick={() => setQuantity(quantity + 1)}
                className="w-12 h-12 bg-green-500 text-white rounded-xl font-bold flex items-center justify-center hover:bg-green-600"
              >
                +
              </button>
            </div>
          </div>

          {/* Damage Type */}
          <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-3">
              {recordType === 'damage' ? 'Hasar Türü' : 'Kayıp Türü'}
            </label>
            <div className="grid grid-cols-2 gap-2">
              {damageTypes.map((type) => (
                <button
                  key={type.id}
                  onClick={() => setSelectedDamageType(type.id)}
                  className={`p-3 rounded-xl border-2 transition-all text-left ${
                    selectedDamageType === type.id
                      ? 'bg-orange-100 border-orange-500'
                      : 'bg-gray-50 border-gray-300 hover:border-orange-300'
                  }`}
                >
                  <div className="text-xl mb-1">{type.icon}</div>
                  <div className="text-xs font-medium">{type.label}</div>
                  {type.severity === 'high' && (
                    <div className="text-[10px] text-red-600 mt-1">⚠️ Yüksek</div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Damage Reason */}
          <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-3">Sebep</label>
            <div className="grid grid-cols-1 gap-2">
              {damageReasons.map((reason) => (
                <button
                  key={reason.id}
                  onClick={() => setSelectedReason(reason.id)}
                  className={`p-3 rounded-xl border-2 transition-all text-left ${
                    selectedReason === reason.id
                      ? 'bg-orange-100 border-orange-500'
                      : 'bg-gray-50 border-gray-300 hover:border-orange-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{reason.icon}</span>
                    <span className="text-sm font-medium">{reason.label}</span>
                    {selectedReason === reason.id && (
                      <Check className="w-5 h-5 text-orange-600 ml-auto" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Location */}
          <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Lokasyon</label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="A-01-05"
                className="w-full pl-10 pr-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:border-orange-500 font-mono"
              />
            </div>
          </div>

          {/* Responsible Person */}
          <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Sorumlu Personel (Opsiyonel)
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={responsiblePerson}
                onChange={(e) => setResponsiblePerson(e.target.value)}
                placeholder="Personel adı..."
                className="w-full pl-10 pr-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:border-orange-500"
              />
            </div>
          </div>

          {/* Estimated Cost */}
          <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tahmini Maliyet (IQD)
            </label>
            <div className="relative">
              <Banknote className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="number"
                value={estimatedCost}
                onChange={(e) => setEstimatedCost(e.target.value)}
                placeholder="0"
                className="w-full pl-10 pr-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:border-orange-500 text-lg"
              />
            </div>
            <div className="text-xs text-gray-500 mt-2">
              Otomatik hesaplama: {(quantity * currentProduct.unitPrice).toLocaleString('tr-TR')} IQD
            </div>
            <button
              onClick={() => setEstimatedCost((quantity * currentProduct.unitPrice).toString())}
              className="text-xs text-orange-600 hover:underline mt-1"
            >
              Otomatik hesaplamayı kullan
            </button>
          </div>

          {/* Photos */}
          <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Fotoğraflar (Önerilir)
            </label>
            <button className="w-full py-3 border-2 border-dashed border-gray-300 rounded-xl hover:border-orange-400 hover:bg-orange-50 transition-all">
              <Camera className="w-6 h-6 mx-auto mb-1 text-gray-400" />
              <span className="text-sm text-gray-600">Fotoğraf Çek</span>
            </button>
          </div>

          {/* Notes */}
          <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Açıklama</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ek bilgi..."
              rows={3}
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:border-orange-500"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={() => setStep('product-scan')}
              className="flex-1 py-3 border-2 border-gray-300 rounded-xl font-bold hover:bg-gray-50"
            >
              İptal
            </button>
            <button
              onClick={handleSaveRecord}
              disabled={!selectedDamageType || !selectedReason}
              className={`flex-1 py-3 rounded-xl font-bold ${
                selectedDamageType && selectedReason
                  ? 'bg-gradient-to-r from-orange-600 to-orange-700 text-white hover:shadow-lg'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              Kaydet
            </button>
          </div>
        </div>

        <div className="h-20"></div>
      </div>
    );
  }

  // Review
  if (step === 'review') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 to-orange-100 overflow-y-auto">
        <div className="bg-gradient-to-r from-orange-600 to-orange-700 text-white p-4 sticky top-0 z-10 shadow-lg">
          <div className="flex items-center gap-3">
            <button onClick={() => setStep('product-scan')} className="p-2 hover:bg-white/10 rounded-lg">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex-1">
              <h1 className="text-lg font-bold">Özet</h1>
              <p className="text-xs text-orange-100">Summary</p>
            </div>
          </div>
        </div>

        <div className="p-6">
          {/* Statistics */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-white rounded-xl p-4 shadow-sm text-center">
              <div className="text-xs text-gray-600 mb-1">Toplam Kayıt</div>
              <div className="text-2xl font-bold text-orange-600">{records.length}</div>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm text-center">
              <div className="text-xs text-gray-600 mb-1">Toplam Miktar</div>
              <div className="text-2xl font-bold text-orange-600">{getTotalQuantity()}</div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Toplam Maliyet</span>
              <span className="text-xl font-bold text-red-600">
                {getTotalCost().toLocaleString('tr-TR')} IQD
              </span>
            </div>
          </div>

          {/* Records */}
          <h3 className="text-sm font-bold text-gray-700 mb-3">Kayıtlar</h3>
          <div className="space-y-2 mb-4">
            {records.map((record, idx) => (
              <div key={idx} className="bg-white rounded-xl p-4 shadow-sm">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex-1">
                    <div className="font-medium text-gray-900">{record.productName}</div>
                    <div className="text-xs text-gray-500 font-mono mt-1">{record.barcode}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-orange-600">{record.quantity} adet</div>
                    <div className="text-xs text-gray-500">{record.estimatedCost.toLocaleString('tr-TR')} IQD</div>
                  </div>
                </div>
                <div className="text-xs text-gray-600 bg-gray-50 rounded-lg p-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-gray-500">Tür:</span>{' '}
                      {damageTypes.find(t => t.id === record.damageType)?.label}
                    </div>
                    <div>
                      <span className="text-gray-500">Sebep:</span>{' '}
                      {damageReasons.find(r => r.id === record.damageReason)?.label}
                    </div>
                    {record.location && (
                      <div>
                        <span className="text-gray-500">Konum:</span> {record.location}
                      </div>
                    )}
                    {record.responsiblePerson && (
                      <div>
                        <span className="text-gray-500">Sorumlu:</span> {record.responsiblePerson}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={() => setStep('product-scan')}
              className="flex-1 py-3 border-2 border-gray-300 rounded-xl font-bold hover:bg-gray-50"
            >
              Geri
            </button>
            <button
              onClick={handleComplete}
              className="flex-1 py-3 bg-gradient-to-r from-orange-600 to-orange-700 text-white rounded-xl font-bold hover:shadow-lg flex items-center justify-center gap-2"
            >
              <Check className="w-5 h-5" />
              Onayla
            </button>
          </div>
        </div>

        <div className="h-20"></div>
      </div>
    );
  }

  // Complete
  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-orange-100">
      <div className="bg-gradient-to-r from-orange-600 to-orange-700 text-white p-4 sticky top-0 z-10 shadow-lg">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-lg">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold">Kayıt Tamamlandı</h1>
            <p className="text-xs text-orange-100">Record Completed</p>
          </div>
        </div>
      </div>

      <div className="p-6">
        <div className="bg-white rounded-2xl p-6 shadow-lg text-center">
          <div className="w-24 h-24 bg-orange-100 rounded-3xl flex items-center justify-center mx-auto mb-6">
            <Check className="w-12 h-12 text-orange-600" />
          </div>
          
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            {recordType === 'damage' ? 'Hasar' : 'Fire'} Kaydedildi!
          </h2>
          <p className="text-gray-600 mb-6">
            {records.length} kayıt başarıyla sisteme işlendi
          </p>

          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="p-3 bg-orange-50 rounded-xl text-center">
              <div className="text-xs text-gray-600 mb-1">Toplam Kayıt</div>
              <div className="text-2xl font-bold text-orange-600">{records.length}</div>
            </div>
            <div className="p-3 bg-red-50 rounded-xl text-center">
              <div className="text-xs text-gray-600 mb-1">Toplam Zarar</div>
              <div className="text-xl font-bold text-red-600">
                {getTotalCost().toLocaleString('tr-TR', { maximumFractionDigits: 0 })}
              </div>
            </div>
          </div>

          <div className="bg-blue-50 rounded-xl p-4 mb-6 text-left">
            <p className="text-xs text-blue-900 font-medium mb-2">⏭️ Sonraki Adımlar:</p>
            <ul className="text-xs text-blue-800 space-y-1">
              <li>✓ Stoktan düşülecek</li>
              <li>• Muhasebe bilgilendirilecek</li>
              <li>• Sigorta değerlendirmesi yapılacak</li>
              <li>• Yönetici onayı beklenecek</li>
            </ul>
          </div>

          <button
            onClick={onBack}
            className="w-full py-3 bg-gradient-to-r from-orange-600 to-orange-700 text-white rounded-xl font-bold hover:shadow-lg"
          >
            Ana Menü
          </button>
        </div>
      </div>
    </div>
  );
}

