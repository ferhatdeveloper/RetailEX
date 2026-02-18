import { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft, Scan, CheckCircle, XCircle, AlertCircle,
  Camera, Check, X, ClipboardCheck, Eye, FileCheck,
  ThumbsUp, ThumbsDown, Clock, Package, Image as ImageIcon,
  Pause, Play, AlertTriangle, TrendingUp, BarChart3
} from 'lucide-react';

interface QCChecklistItem {
  id: string;
  description: string;
  category: 'appearance' | 'function' | 'packaging' | 'documentation';
  status: 'pending' | 'pass' | 'fail';
  notes: string;
}

interface QCInspection {
  receiptNo: string;
  barcode: string;
  productName: string;
  lotNumber: string;
  quantity: number;
  sampleSize: number;
  checklist: QCChecklistItem[];
  photos: string[];
  inspectorName: string;
  overallStatus: 'pending' | 'approved' | 'rejected' | 'on-hold';
  defectCount: number;
  notes: string;
}

interface QualityControlProps {
  onBack: () => void;
}

export function QualityControl({ onBack }: QualityControlProps) {
  const [step, setStep] = useState<'receipt-scan' | 'product-scan' | 'inspection' | 'decision' | 'complete'>('receipt-scan');
  const [receiptNumber, setReceiptNumber] = useState('');
  const [scannedBarcode, setScannedBarcode] = useState('');
  const [currentInspection, setCurrentInspection] = useState<QCInspection | null>(null);
  const [inspectorName, setInspectorName] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const defaultChecklist: QCChecklistItem[] = [
    // Appearance
    { id: 'app-1', description: 'Ürün ambalajı sağlam', category: 'appearance', status: 'pending', notes: '' },
    { id: 'app-2', description: 'Etiket bilgileri doğru', category: 'appearance', status: 'pending', notes: '' },
    { id: 'app-3', description: 'Fiziksel hasar yok', category: 'appearance', status: 'pending', notes: '' },
    { id: 'app-4', description: 'Renk/görünüm uygun', category: 'appearance', status: 'pending', notes: '' },
    
    // Function
    { id: 'func-1', description: 'Ürün çalışıyor (test edildi)', category: 'function', status: 'pending', notes: '' },
    { id: 'func-2', description: 'Tüm aksesuarlar mevcut', category: 'function', status: 'pending', notes: '' },
    { id: 'func-3', description: 'Seri no/IMEI okunuyor', category: 'function', status: 'pending', notes: '' },
    
    // Packaging
    { id: 'pack-1', description: 'Kutu içeriği tam', category: 'packaging', status: 'pending', notes: '' },
    { id: 'pack-2', description: 'Koruyucu malzemeler yerinde', category: 'packaging', status: 'pending', notes: '' },
    { id: 'pack-3', description: 'Koli bandı sağlam', category: 'packaging', status: 'pending', notes: '' },
    
    // Documentation
    { id: 'doc-1', description: 'Kullanım kılavuzu var', category: 'documentation', status: 'pending', notes: '' },
    { id: 'doc-2', description: 'Garanti belgesi mevcut', category: 'documentation', status: 'pending', notes: '' },
    { id: 'doc-3', description: 'SKT/Üretim tarihi uygun', category: 'documentation', status: 'pending', notes: '' },
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

  const handleReceiptScan = (receipt: string) => {
    setReceiptNumber(receipt);
    setStep('product-scan');
    vibrate();
    beep(true);
  };

  const handleProductScan = (barcode: string) => {
    // Calculate sample size (AQL based)
    const totalQty = Math.floor(Math.random() * 100) + 10;
    const sampleSize = totalQty < 10 ? totalQty : Math.ceil(totalQty * 0.1); // 10% sample

    const inspection: QCInspection = {
      receiptNo: receiptNumber,
      barcode,
      productName: `Product ${barcode.slice(-4)}`,
      lotNumber: `LOT-${new Date().getTime().toString().slice(-6)}`,
      quantity: totalQty,
      sampleSize,
      checklist: [...defaultChecklist],
      photos: [],
      inspectorName: inspectorName || 'QC Inspector',
      overallStatus: 'pending',
      defectCount: 0,
      notes: '',
    };

    setCurrentInspection(inspection);
    setStep('inspection');
    vibrate();
    beep(true);
  };

  const handleChecklistUpdate = (itemId: string, status: 'pass' | 'fail', notes?: string) => {
    if (!currentInspection) return;

    const updatedChecklist = currentInspection.checklist.map(item =>
      item.id === itemId ? { ...item, status, notes: notes || item.notes } : item
    );

    const defectCount = updatedChecklist.filter(item => item.status === 'fail').length;

    setCurrentInspection({
      ...currentInspection,
      checklist: updatedChecklist,
      defectCount,
    });

    vibrate();
    beep(status === 'pass');
  };

  const isInspectionComplete = () => {
    if (!currentInspection) return false;
    return currentInspection.checklist.every(item => item.status !== 'pending');
  };

  const handleFinalDecision = (decision: 'approved' | 'rejected' | 'on-hold') => {
    if (!currentInspection) return;

    setCurrentInspection({
      ...currentInspection,
      overallStatus: decision,
    });

    setShowSuccess(true);
    setTimeout(() => {
      setShowSuccess(false);
      setStep('complete');
    }, 2000);

    vibrate();
    beep(decision === 'approved');
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'appearance': return 'ğŸ‘ï¸';
      case 'function': return '⚙️';
      case 'packaging': return 'ğŸ“¦';
      case 'documentation': return 'ğŸ“„';
      default: return '✓';
    }
  };

  const getCategoryLabel = (category: string) => {
    switch (category) {
      case 'appearance': return 'Görünüm';
      case 'function': return 'Fonksiyon';
      case 'packaging': return 'Paketleme';
      case 'documentation': return 'Dokümantasyon';
      default: return category;
    }
  };

  const getCompletionPercentage = () => {
    if (!currentInspection) return 0;
    const completed = currentInspection.checklist.filter(item => item.status !== 'pending').length;
    return Math.round((completed / currentInspection.checklist.length) * 100);
  };

  const getPassRate = () => {
    if (!currentInspection) return 0;
    const passed = currentInspection.checklist.filter(item => item.status === 'pass').length;
    const total = currentInspection.checklist.filter(item => item.status !== 'pending').length;
    if (total === 0) return 0;
    return Math.round((passed / total) * 100);
  };

  // Receipt Scan
  if (step === 'receipt-scan') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100">
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-4 sticky top-0 z-10 shadow-lg">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-lg">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex-1">
              <h1 className="text-lg font-bold">Kalite Kontrol</h1>
              <p className="text-xs text-blue-100">Quality Control (QC)</p>
            </div>
          </div>
        </div>

        <div className="p-6 flex flex-col items-center justify-center min-h-[70vh]">
          <div className="w-32 h-32 bg-blue-500 rounded-3xl flex items-center justify-center mb-6 animate-pulse shadow-xl">
            <ClipboardCheck className="w-16 h-16 text-white" />
          </div>
          
          <h2 className="text-2xl font-bold text-gray-900 mb-2">QC Fişi</h2>
          <p className="text-gray-600 text-center mb-8">
            Kontrol edilecek mal kabul/iade fişini okutun<br />
            <span className="text-sm text-gray-500">Örn: GR-2024-001, RET-2024-001</span>
          </p>

          <div className="w-full max-w-md">
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Kontrol Eden
              </label>
              <div className="relative">
                <Eye className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={inspectorName}
                  onChange={(e) => setInspectorName(e.target.value)}
                  placeholder="QC ismi..."
                  className="w-full pl-10 pr-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:border-blue-500"
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
                  handleReceiptScan(scannedBarcode);
                  setScannedBarcode('');
                }
              }}
              placeholder="Fiş barkodu..."
              className="w-full px-4 py-4 text-lg border-2 border-blue-300 rounded-xl focus:outline-none focus:border-blue-500 text-center font-mono"
            />
            
            <button
              onClick={() => {
                const receipt = prompt('Fiş numarası:');
                if (receipt) handleReceiptScan(receipt);
              }}
              className="w-full mt-3 px-4 py-3 bg-white border-2 border-blue-300 text-blue-700 rounded-xl font-medium hover:bg-blue-50"
            >
              Manuel Giriş
            </button>
          </div>

          <div className="mt-8 p-4 bg-amber-50 rounded-xl max-w-md">
            <p className="text-sm text-amber-900 font-medium mb-2">ğŸ¯ QC Süreci:</p>
            <ul className="text-xs text-amber-800 space-y-1">
              <li>• Fiş okut → Ürün seç</li>
              <li>• Checklist kontrol et</li>
              <li>• Fotoğraf çek (opsiyonel)</li>
              <li>• Onay/Red kararı ver</li>
              <li>• AQL (Acceptable Quality Level) bazlı</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  // Product Scan
  if (step === 'product-scan') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100">
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-4 sticky top-0 z-10 shadow-lg">
          <div className="flex items-center gap-3">
            <button onClick={() => setStep('receipt-scan')} className="p-2 hover:bg-white/10 rounded-lg">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex-1">
              <h1 className="text-lg font-bold">Ürün Seçimi</h1>
              <p className="text-xs text-blue-100">{receiptNumber}</p>
            </div>
          </div>
        </div>

        <div className="p-6 flex flex-col items-center justify-center min-h-[70vh]">
          <div className="w-32 h-32 bg-blue-500 rounded-3xl flex items-center justify-center mb-6 animate-pulse shadow-xl">
            <Scan className="w-16 h-16 text-white" />
          </div>
          
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Ürün Barkodu</h2>
          <p className="text-gray-600 text-center mb-8">
            QC yapılacak ürünü okutun
          </p>

          <div className="w-full max-w-md">
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
              placeholder="Ürün barkodu..."
              className="w-full px-4 py-4 text-lg border-2 border-blue-300 rounded-xl focus:outline-none focus:border-blue-500 text-center font-mono"
            />
          </div>
        </div>
      </div>
    );
  }

  // Inspection
  if (step === 'inspection' && currentInspection) {
    const completionPercentage = getCompletionPercentage();
    const passRate = getPassRate();

    // Group by category
    const groupedChecklist = currentInspection.checklist.reduce((acc, item) => {
      if (!acc[item.category]) acc[item.category] = [];
      acc[item.category].push(item);
      return acc;
    }, {} as Record<string, QCChecklistItem[]>);

    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 overflow-y-auto">
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-4 sticky top-0 z-10 shadow-lg">
          <div className="flex items-center gap-3 mb-3">
            <button onClick={() => setStep('product-scan')} className="p-2 hover:bg-white/10 rounded-lg">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex-1">
              <h1 className="text-lg font-bold">QC Kontrol</h1>
              <p className="text-xs text-blue-100">{currentInspection.productName}</p>
            </div>
            {isInspectionComplete() && (
              <button
                onClick={() => setStep('decision')}
                className="px-4 py-2 bg-white/20 backdrop-blur-sm rounded-lg font-medium text-sm"
              >
                Karar
              </button>
            )}
          </div>

          {/* Progress */}
          <div className="mb-2">
            <div className="flex items-center justify-between text-xs mb-1">
              <span>İlerleme</span>
              <span className="font-bold">{completionPercentage}%</span>
            </div>
            <div className="w-full bg-white/20 rounded-full h-2">
              <div
                className="h-2 bg-white rounded-full transition-all"
                style={{ width: `${completionPercentage}%` }}
              />
            </div>
          </div>
        </div>

        <div className="p-6">
          {/* Product Info */}
          <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                <Package className="w-6 h-6 text-blue-600" />
              </div>
              <div className="flex-1">
                <div className="font-bold text-gray-900">{currentInspection.productName}</div>
                <div className="text-sm text-gray-500 font-mono">{currentInspection.barcode}</div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="bg-blue-50 rounded-lg p-2 text-center">
                <div className="text-gray-600">Toplam</div>
                <div className="font-bold text-blue-600">{currentInspection.quantity}</div>
              </div>
              <div className="bg-green-50 rounded-lg p-2 text-center">
                <div className="text-gray-600">Numune</div>
                <div className="font-bold text-green-600">{currentInspection.sampleSize}</div>
              </div>
              <div className="bg-purple-50 rounded-lg p-2 text-center">
                <div className="text-gray-600">LOT</div>
                <div className="font-bold text-purple-600 text-[10px]">{currentInspection.lotNumber}</div>
              </div>
            </div>
          </div>

          {/* Statistics */}
          {completionPercentage > 0 && (
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-green-50 rounded-xl p-3 text-center border border-green-200">
                <div className="text-xs text-gray-600 mb-1">Başarı Oranı</div>
                <div className="text-2xl font-bold text-green-600">{passRate}%</div>
              </div>
              <div className="bg-red-50 rounded-xl p-3 text-center border border-red-200">
                <div className="text-xs text-gray-600 mb-1">Hata Sayısı</div>
                <div className="text-2xl font-bold text-red-600">{currentInspection.defectCount}</div>
              </div>
            </div>
          )}

          {/* Checklist by Category */}
          <div className="space-y-4">
            {Object.entries(groupedChecklist).map(([category, items]) => (
              <div key={category} className="bg-white rounded-xl p-4 shadow-sm">
                <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                  <span className="text-xl">{getCategoryIcon(category)}</span>
                  {getCategoryLabel(category)}
                  <span className="ml-auto text-xs text-gray-500">
                    {items.filter(i => i.status !== 'pending').length}/{items.length}
                  </span>
                </h3>

                <div className="space-y-2">
                  {items.map((item) => (
                    <div key={item.id} className={`p-3 rounded-lg border-2 transition-all ${
                      item.status === 'pass' ? 'bg-green-50 border-green-300' :
                      item.status === 'fail' ? 'bg-red-50 border-red-300' :
                      'bg-gray-50 border-gray-300'
                    }`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex-1 text-sm font-medium text-gray-900">
                          {item.description}
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleChecklistUpdate(item.id, 'pass')}
                            className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all ${
                              item.status === 'pass'
                                ? 'bg-green-500 text-white shadow-md'
                                : 'bg-white border-2 border-green-300 text-green-600 hover:bg-green-50'
                            }`}
                          >
                            <ThumbsUp className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => handleChecklistUpdate(item.id, 'fail')}
                            className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all ${
                              item.status === 'fail'
                                ? 'bg-red-500 text-white shadow-md'
                                : 'bg-white border-2 border-red-300 text-red-600 hover:bg-red-50'
                            }`}
                          >
                            <ThumbsDown className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                      {item.status === 'fail' && (
                        <textarea
                          placeholder="Hata detayı..."
                          value={item.notes}
                          onChange={(e) => handleChecklistUpdate(item.id, 'fail', e.target.value)}
                          className="w-full px-3 py-2 border border-red-300 rounded-lg text-sm focus:outline-none focus:border-red-500"
                          rows={2}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Photo Upload */}
          <div className="bg-white rounded-xl p-4 shadow-sm mt-4">
            <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
              <Camera className="w-4 h-4" />
              Fotoğraflar (Opsiyonel)
            </h3>
            <button className="w-full py-3 border-2 border-dashed border-gray-300 rounded-xl hover:border-blue-400 hover:bg-blue-50 transition-all">
              <Camera className="w-6 h-6 mx-auto mb-1 text-gray-400" />
              <span className="text-sm text-gray-600">Fotoğraf Ekle</span>
            </button>
          </div>

          {/* General Notes */}
          <div className="bg-white rounded-xl p-4 shadow-sm mt-4">
            <h3 className="text-sm font-bold text-gray-700 mb-3">Genel Notlar</h3>
            <textarea
              value={currentInspection.notes}
              onChange={(e) => setCurrentInspection({ ...currentInspection, notes: e.target.value })}
              placeholder="Ek açıklama..."
              rows={3}
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        <div className="h-20"></div>
      </div>
    );
  }

  // Decision
  if (step === 'decision' && currentInspection) {
    const passRate = getPassRate();
    const recommendedDecision = passRate >= 95 ? 'approved' : passRate >= 70 ? 'on-hold' : 'rejected';

    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 overflow-y-auto">
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-4 sticky top-0 z-10 shadow-lg">
          <div className="flex items-center gap-3">
            <button onClick={() => setStep('inspection')} className="p-2 hover:bg-white/10 rounded-lg">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex-1">
              <h1 className="text-lg font-bold">QC Kararı</h1>
              <p className="text-xs text-blue-100">Final Decision</p>
            </div>
          </div>
        </div>

        <div className="p-6">
          {/* Summary */}
          <div className="bg-white rounded-xl p-5 shadow-sm mb-4">
            <h3 className="text-sm font-bold text-gray-700 mb-3">Kontrol Özeti</h3>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="bg-blue-50 rounded-lg p-3 text-center">
                <div className="text-xs text-gray-600 mb-1">Başarı Oranı</div>
                <div className="text-3xl font-bold text-blue-600">{passRate}%</div>
              </div>
              <div className="bg-red-50 rounded-lg p-3 text-center">
                <div className="text-xs text-gray-600 mb-1">Hata</div>
                <div className="text-3xl font-bold text-red-600">{currentInspection.defectCount}</div>
              </div>
            </div>
            <div className="text-xs text-gray-600 space-y-1">
              <div className="flex justify-between">
                <span>Ürün:</span>
                <span className="font-bold">{currentInspection.productName}</span>
              </div>
              <div className="flex justify-between">
                <span>LOT:</span>
                <span className="font-mono font-bold">{currentInspection.lotNumber}</span>
              </div>
              <div className="flex justify-between">
                <span>Miktar:</span>
                <span className="font-bold">{currentInspection.quantity} adet</span>
              </div>
              <div className="flex justify-between">
                <span>Numune:</span>
                <span className="font-bold">{currentInspection.sampleSize} adet</span>
              </div>
            </div>
          </div>

          {/* Recommendation */}
          <div className={`rounded-xl p-4 mb-4 ${
            recommendedDecision === 'approved' ? 'bg-green-50 border-2 border-green-300' :
            recommendedDecision === 'on-hold' ? 'bg-yellow-50 border-2 border-yellow-300' :
            'bg-red-50 border-2 border-red-300'
          }`}>
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className={`w-5 h-5 ${
                recommendedDecision === 'approved' ? 'text-green-600' :
                recommendedDecision === 'on-hold' ? 'text-yellow-600' :
                'text-red-600'
              }`} />
              <span className="font-bold text-sm text-gray-900">Sistem Önerisi:</span>
            </div>
            <div className={`font-bold ${
              recommendedDecision === 'approved' ? 'text-green-700' :
              recommendedDecision === 'on-hold' ? 'text-yellow-700' :
              'text-red-700'
            }`}>
              {recommendedDecision === 'approved' && '✅ ONAY (Başarı oranı %95+)'}
              {recommendedDecision === 'on-hold' && '⏸️ ASKIYA AL (Başarı oranı %70-95)'}
              {recommendedDecision === 'rejected' && '❌ REDDET (Başarı oranı %70-)'}
            </div>
          </div>

          {/* Decision Buttons */}
          <h3 className="text-sm font-bold text-gray-700 mb-3">Karar Verin:</h3>
          <div className="space-y-3">
            {/* Approved */}
            <button
              onClick={() => handleFinalDecision('approved')}
              className="w-full bg-gradient-to-r from-green-500 to-green-600 text-white rounded-xl p-5 shadow-md hover:shadow-lg transition-all"
            >
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center">
                  <CheckCircle className="w-8 h-8" />
                </div>
                <div className="flex-1 text-left">
                  <div className="text-lg font-bold">ONAYLA</div>
                  <div className="text-sm text-green-100">Stok alınabilir</div>
                </div>
              </div>
            </button>

            {/* On Hold */}
            <button
              onClick={() => handleFinalDecision('on-hold')}
              className="w-full bg-white border-2 border-yellow-400 rounded-xl p-5 shadow-sm hover:shadow-md transition-all"
            >
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-yellow-100 rounded-2xl flex items-center justify-center">
                  <Pause className="w-8 h-8 text-yellow-600" />
                </div>
                <div className="flex-1 text-left">
                  <div className="text-lg font-bold text-gray-900">ASKIYA AL</div>
                  <div className="text-sm text-gray-600">İnceleme bekliyor</div>
                </div>
              </div>
            </button>

            {/* Rejected */}
            <button
              onClick={() => handleFinalDecision('rejected')}
              className="w-full bg-white border-2 border-red-400 rounded-xl p-5 shadow-sm hover:shadow-md transition-all"
            >
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-red-100 rounded-2xl flex items-center justify-center">
                  <XCircle className="w-8 h-8 text-red-600" />
                </div>
                <div className="flex-1 text-left">
                  <div className="text-lg font-bold text-gray-900">REDDET</div>
                  <div className="text-sm text-gray-600">İade edilecek</div>
                </div>
              </div>
            </button>
          </div>
        </div>

        {showSuccess && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-8 text-center shadow-2xl">
              <CheckCircle className="w-16 h-16 text-green-600 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-gray-900 mb-2">Karar Kaydedildi!</h3>
              <p className="text-gray-600">QC raporu oluşturuluyor...</p>
            </div>
          </div>
        )}

        <div className="h-20"></div>
      </div>
    );
  }

  // Complete
  if (step === 'complete' && currentInspection) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100">
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-4 sticky top-0 z-10 shadow-lg">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-lg">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex-1">
              <h1 className="text-lg font-bold">QC Tamamlandı</h1>
              <p className="text-xs text-blue-100">Quality Control Completed</p>
            </div>
          </div>
        </div>

        <div className="p-6">
          <div className="bg-white rounded-2xl p-6 shadow-lg text-center">
            <div className={`w-24 h-24 rounded-3xl flex items-center justify-center mx-auto mb-6 ${
              currentInspection.overallStatus === 'approved' ? 'bg-green-100' :
              currentInspection.overallStatus === 'on-hold' ? 'bg-yellow-100' :
              'bg-red-100'
            }`}>
              {currentInspection.overallStatus === 'approved' && <CheckCircle className="w-12 h-12 text-green-600" />}
              {currentInspection.overallStatus === 'on-hold' && <Pause className="w-12 h-12 text-yellow-600" />}
              {currentInspection.overallStatus === 'rejected' && <XCircle className="w-12 h-12 text-red-600" />}
            </div>
            
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              {currentInspection.overallStatus === 'approved' && 'Onaylandı!'}
              {currentInspection.overallStatus === 'on-hold' && 'Askıya Alındı'}
              {currentInspection.overallStatus === 'rejected' && 'Reddedildi'}
            </h2>
            <p className="text-gray-600 mb-6">QC raporu başarıyla kaydedildi</p>

            <div className="bg-blue-50 rounded-xl p-4 mb-6">
              <div className="text-sm text-gray-700 space-y-2">
                <div className="flex justify-between">
                  <span>QC No:</span>
                  <span className="font-bold font-mono">QC-{new Date().getTime().toString().slice(-6)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Ürün:</span>
                  <span className="font-bold">{currentInspection.productName}</span>
                </div>
                <div className="flex justify-between">
                  <span>Başarı Oranı:</span>
                  <span className="font-bold">{getPassRate()}%</span>
                </div>
                <div className="flex justify-between">
                  <span>Kontrol Eden:</span>
                  <span className="font-bold">{currentInspection.inspectorName}</span>
                </div>
              </div>
            </div>

            {currentInspection.overallStatus === 'approved' && (
              <div className="bg-green-50 rounded-xl p-4 mb-6 text-left">
                <p className="text-xs text-green-900 font-medium mb-2">✅ Sonraki Adımlar:</p>
                <ul className="text-xs text-green-800 space-y-1">
                  <li>• Stok giriş işlemi yapılabilir</li>
                  <li>• Ürün raflara yerleştirilebilir</li>
                  <li>• Satışa hazır</li>
                </ul>
              </div>
            )}

            {currentInspection.overallStatus === 'on-hold' && (
              <div className="bg-yellow-50 rounded-xl p-4 mb-6 text-left">
                <p className="text-xs text-yellow-900 font-medium mb-2">⏸️ Sonraki Adımlar:</p>
                <ul className="text-xs text-yellow-800 space-y-1">
                  <li>• Karantina alanına alınacak</li>
                  <li>• Detaylı inceleme yapılacak</li>
                  <li>• Yönetici onayı beklenecek</li>
                </ul>
              </div>
            )}

            {currentInspection.overallStatus === 'rejected' && (
              <div className="bg-red-50 rounded-xl p-4 mb-6 text-left">
                <p className="text-xs text-red-900 font-medium mb-2">❌ Sonraki Adımlar:</p>
                <ul className="text-xs text-red-800 space-y-1">
                  <li>• Tedarikçi iade süreci başlatılacak</li>
                  <li>• RMA numarası oluşturulacak</li>
                  <li>• İade raporu gönderilecek</li>
                </ul>
              </div>
            )}

            <button
              onClick={onBack}
              className="w-full py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl font-bold hover:shadow-lg"
            >
              Ana Menü
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

