import { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft, Scan, Package, CheckCircle,
  Check, RefreshCw, TruckIcon, FileText,
  User, ShoppingBag, RotateCcw
} from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';

interface ReturnItem {
  barcode: string;
  productName: string;
  quantity: number;
  returnReason: string;
  condition: 'good' | 'damaged' | 'defective' | 'opened';
  photos: string[];
  notes: string;
}

interface ReturnsManagementProps {
  onBack: () => void;
}

export function ReturnsManagement({ onBack }: ReturnsManagementProps) {
  const { tm } = useLanguage();
  const [returnType, setReturnType] = useState<'customer' | 'supplier' | null>(null);
  const [step, setStep] = useState<'type-select' | 'order-scan' | 'item-scan' | 'reason-select' | 'photo-upload' | 'review' | 'complete'>('type-select');
  const [orderNumber, setOrderNumber] = useState('');
  const [scannedBarcode, setScannedBarcode] = useState('');
  const [returnItems, setReturnItems] = useState<ReturnItem[]>([]);
  const [currentItem, setCurrentItem] = useState<any>(null);
  const [selectedReason, setSelectedReason] = useState('');
  const [selectedCondition, setSelectedCondition] = useState<'good' | 'damaged' | 'defective' | 'opened'>('good');
  const [notes, setNotes] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const customerReturnReasons = [
    { id: 'wrong-product', label: tm('retReasonWrongProduct'), icon: '?', severity: 'low' },
    { id: 'damaged', label: tm('retReasonDamaged'), icon: '??', severity: 'high' },
    { id: 'defective', label: tm('retReasonDefective'), icon: '??', severity: 'high' },
    { id: 'not-as-described', label: tm('retReasonNotDescribed'), icon: '??', severity: 'medium' },
    { id: 'changed-mind', label: tm('retReasonChangedMind'), icon: '??', severity: 'low' },
    { id: 'late-delivery', label: tm('retReasonLate'), icon: '?', severity: 'medium' },
    { id: 'duplicate', label: tm('retReasonDuplicate'), icon: '??', severity: 'low' },
    { id: 'quality-issue', label: tm('retReasonQuality'), icon: '?', severity: 'high' },
    { id: 'other', label: tm('retReasonOther'), icon: '??', severity: 'low' },
  ];

  const supplierReturnReasons = [
    { id: 'quality-issue', label: tm('retSupReasonQuality'), icon: '??', severity: 'high' },
    { id: 'wrong-product', label: tm('retSupReasonWrong'), icon: '?', severity: 'high' },
    { id: 'damaged-in-transit', label: tm('retSupReasonTransit'), icon: '??', severity: 'medium' },
    { id: 'expired', label: tm('retSupReasonExpired'), icon: '??', severity: 'high' },
    { id: 'excess-stock', label: tm('retSupReasonExcess'), icon: '??', severity: 'low' },
    { id: 'defective', label: tm('retSupReasonDefective'), icon: '??', severity: 'high' },
    { id: 'recall', label: tm('retSupReasonRecall'), icon: '??', severity: 'critical' },
    { id: 'price-dispute', label: tm('retSupReasonPrice'), icon: '??', severity: 'medium' },
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

  const handleOrderScan = (order: string) => {
    setOrderNumber(order);
    setStep('item-scan');
    vibrate();
    beep(true);
  };

  const handleItemScan = (barcode: string) => {
    const mockItem = {
      barcode,
      productName: `Product ${barcode.slice(-4)}`,
      originalQty: Math.floor(Math.random() * 5) + 1,
    };
    setCurrentItem(mockItem);
    setStep('reason-select');
    vibrate();
    beep(true);
  };

  const handleAddReturnItem = () => {
    if (!currentItem || !selectedReason) return;

    const newItem: ReturnItem = {
      barcode: currentItem.barcode,
      productName: currentItem.productName,
      quantity: 1,
      returnReason: selectedReason,
      condition: selectedCondition,
      photos: [],
      notes: notes,
    };

    setReturnItems([...returnItems, newItem]);
    setCurrentItem(null);
    setSelectedReason('');
    setSelectedCondition('good');
    setNotes('');
    setStep('item-scan');
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 1500);
    vibrate();
    beep(true);
  };

  const handleComplete = () => {
    console.log('Return completed:', { returnType, orderNumber, items: returnItems, customer: customerName });
    vibrate();
    beep(true);
    setStep('complete');
  };

  const getReasonList = () => {
    return returnType === 'customer' ? customerReturnReasons : supplierReturnReasons;
  };

  const getConditionColor = (condition: string) => {
    switch (condition) {
      case 'good': return 'bg-green-100 border-green-400 text-green-700';
      case 'opened': return 'bg-blue-100 border-blue-400 text-blue-700';
      case 'damaged': return 'bg-orange-100 border-orange-400 text-orange-700';
      case 'defective': return 'bg-red-100 border-red-400 text-red-700';
      default: return 'bg-gray-100 border-gray-400 text-gray-700';
    }
  };

  const conditionLabel = (condition: string) => {
    if (condition === 'good') return `? ${tm('retCondGood')}`;
    if (condition === 'opened') return `?? ${tm('retCondOpened')}`;
    if (condition === 'damaged') return `?? ${tm('retCondDamaged')}`;
    if (condition === 'defective') return `? ${tm('retCondDefective')}`;
    return condition;
  };

  if (step === 'type-select') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-rose-50 to-rose-100">
        <div className="bg-gradient-to-r from-rose-600 to-rose-700 text-white p-4 sticky top-0 z-10 shadow-lg">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-lg">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex-1">
              <h1 className="text-lg font-bold">{tm('retTitle')}</h1>
              <p className="text-xs text-rose-100">Returns Management</p>
            </div>
          </div>
        </div>

        <div className="p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">{tm('retSelectType')}</h2>

          <button
            onClick={() => {
              setReturnType('customer');
              setStep('order-scan');
            }}
            className="w-full bg-gradient-to-r from-rose-500 to-rose-600 text-white rounded-xl p-6 shadow-lg hover:shadow-xl transition-all mb-4"
          >
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center">
                <ShoppingBag className="w-8 h-8" />
              </div>
              <div className="flex-1 text-left">
                <div className="text-xl font-bold">{tm('retCustomerReturn')}</div>
                <div className="text-sm text-rose-100">Customer Return</div>
                <div className="text-xs text-rose-200 mt-2">
                  {tm('retCustomerReturnDesc')}
                </div>
              </div>
              <RotateCcw className="w-8 h-8 text-white/70" />
            </div>
          </button>

          <button
            onClick={() => {
              setReturnType('supplier');
              setStep('order-scan');
            }}
            className="w-full bg-white border-2 border-rose-300 rounded-xl p-6 shadow-sm hover:shadow-md transition-all"
          >
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-rose-100 rounded-2xl flex items-center justify-center">
                <TruckIcon className="w-8 h-8 text-rose-600" />
              </div>
              <div className="flex-1 text-left">
                <div className="text-xl font-bold text-gray-900">{tm('retSupplierReturn')}</div>
                <div className="text-sm text-gray-600">Supplier Return (RMA)</div>
                <div className="text-xs text-gray-500 mt-2">
                  {tm('retSupplierReturnDesc')}
                </div>
              </div>
              <RefreshCw className="w-8 h-8 text-gray-400" />
            </div>
          </button>

          <div className="mt-8 p-4 bg-blue-50 rounded-xl">
            <p className="text-sm text-blue-900 font-medium mb-2">?? {tm('retOpsTitle')}</p>
            <ul className="text-xs text-blue-800 space-y-1">
              <li>• {tm('retOpsCustomer')}</li>
              <li>• {tm('retOpsSupplier')}</li>
              <li>• {tm('retOpsReason')}</li>
              <li>• {tm('retOpsQc')}</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'order-scan') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-rose-50 to-rose-100">
        <div className="bg-gradient-to-r from-rose-600 to-rose-700 text-white p-4 sticky top-0 z-10 shadow-lg">
          <div className="flex items-center gap-3">
            <button onClick={() => setStep('type-select')} className="p-2 hover:bg-white/10 rounded-lg">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex-1">
              <h1 className="text-lg font-bold">
                {returnType === 'customer' ? tm('retCustomerReturn') : tm('retSupplierReturn')}
              </h1>
              <p className="text-xs text-rose-100">
                {returnType === 'customer' ? 'Customer Return' : 'Supplier Return'}
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 flex flex-col items-center justify-center min-h-[70vh]">
          <div className="w-32 h-32 bg-rose-500 rounded-3xl flex items-center justify-center mb-6 animate-pulse shadow-xl">
            <FileText className="w-16 h-16 text-white" />
          </div>

          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            {returnType === 'customer' ? tm('retSalesSlip') : tm('retPurchaseSlip')}
          </h2>
          <p className="text-gray-600 text-center mb-8">
            {tm('retScanSlipHint').replace('{kind}', returnType === 'customer' ? tm('retKindSales') : tm('retKindPurchase'))}
            <br />
            <span className="text-sm text-gray-500">
              e.g. {returnType === 'customer' ? 'SO-2024-001' : 'PO-2024-001'}
            </span>
          </p>

          <div className="w-full max-w-md">
            {returnType === 'customer' && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {tm('retCustomerName')}
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder={tm('retCustomerNamePh')}
                    className="w-full pl-10 pr-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:border-rose-500"
                  />
                </div>
              </div>
            )}

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
              placeholder={tm('retSlipNoPh')}
              className="w-full px-4 py-4 text-lg border-2 border-rose-300 rounded-xl focus:outline-none focus:border-rose-500 text-center font-mono"
            />

            <button
              onClick={() => {
                const order = prompt(tm('retSlipNoPrompt'));
                if (order) handleOrderScan(order);
              }}
              className="w-full mt-3 px-4 py-3 bg-white border-2 border-rose-300 text-rose-700 rounded-xl font-medium hover:bg-rose-50"
            >
              {tm('retManualEntry')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'item-scan') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-rose-50 to-rose-100 overflow-y-auto">
        <div className="bg-gradient-to-r from-rose-600 to-rose-700 text-white p-4 sticky top-0 z-10 shadow-lg">
          <div className="flex items-center gap-3 mb-3">
            <button onClick={() => setStep('order-scan')} className="p-2 hover:bg-white/10 rounded-lg">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex-1">
              <h1 className="text-lg font-bold">{tm('retProductsTitle')}</h1>
              <p className="text-xs text-rose-100">{orderNumber}</p>
            </div>
            {returnItems.length > 0 && (
              <button
                onClick={() => setStep('review')}
                className="px-4 py-2 bg-white/20 backdrop-blur-sm rounded-lg font-medium text-sm"
              >
                {tm('retReviewBtn').replace('{count}', String(returnItems.length))}
              </button>
            )}
          </div>
        </div>

        <div className="p-6">
          <div className="bg-white rounded-2xl p-6 text-center shadow-lg border-2 border-dashed border-rose-300">
            <div className="w-20 h-20 bg-rose-100 rounded-2xl flex items-center justify-center mx-auto mb-4 animate-pulse">
              <Scan className="w-10 h-10 text-rose-600" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">{tm('retScanProduct')}</h3>
            <p className="text-sm text-gray-600 mb-4">{tm('retScanBarcodeHint')}</p>

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
              placeholder={tm('retBarcodePh')}
              className="w-full px-4 py-3 border-2 border-rose-300 rounded-xl focus:outline-none focus:border-rose-500 text-center font-mono text-lg"
            />
          </div>

          {returnItems.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-bold text-gray-700 mb-3">
                {tm('retReturnedProducts').replace('{count}', String(returnItems.length))}
              </h3>
              <div className="space-y-2">
                {returnItems.map((item, idx) => (
                  <div key={idx} className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-rose-500">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-medium text-gray-900">{item.productName}</div>
                      <div className={`px-3 py-1 rounded-full text-xs font-medium border ${getConditionColor(item.condition)}`}>
                        {conditionLabel(item.condition)}
                      </div>
                    </div>
                    <div className="text-xs text-gray-600">
                      <div>{tm('retReasonLabel')} {getReasonList().find(r => r.id === item.returnReason)?.label}</div>
                      <div className="font-mono text-gray-500 mt-1">{item.barcode}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {showSuccess && (
          <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 bg-rose-600 text-white px-6 py-3 rounded-full shadow-lg flex items-center gap-2 animate-bounce z-50">
            <CheckCircle className="w-5 h-5" />
            <span className="font-medium">{tm('retAdded')}</span>
          </div>
        )}

        <div className="h-20"></div>
      </div>
    );
  }

  if (step === 'reason-select') {
    const reasons = getReasonList();

    return (
      <div className="min-h-screen bg-gradient-to-br from-rose-50 to-rose-100 overflow-y-auto">
        <div className="bg-gradient-to-r from-rose-600 to-rose-700 text-white p-4 sticky top-0 z-10 shadow-lg">
          <div className="flex items-center gap-3">
            <button onClick={() => setStep('item-scan')} className="p-2 hover:bg-white/10 rounded-lg">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex-1">
              <h1 className="text-lg font-bold">{tm('retReasonTitle')}</h1>
              <p className="text-xs text-rose-100">{currentItem?.productName}</p>
            </div>
          </div>
        </div>

        <div className="p-6">
          <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-rose-100 rounded-xl flex items-center justify-center">
                <Package className="w-6 h-6 text-rose-600" />
              </div>
              <div className="flex-1">
                <div className="font-bold text-gray-900">{currentItem?.productName}</div>
                <div className="text-sm text-gray-500 font-mono">{currentItem?.barcode}</div>
              </div>
            </div>
          </div>

          <h3 className="text-sm font-bold text-gray-700 mb-3">{tm('retReasonHeading')}</h3>
          <div className="grid grid-cols-1 gap-2 mb-6">
            {reasons.map((reason) => (
              <button
                key={reason.id}
                onClick={() => setSelectedReason(reason.id)}
                className={`w-full p-4 rounded-xl border-2 transition-all text-left ${
                  selectedReason === reason.id
                    ? 'bg-rose-100 border-rose-500 shadow-md'
                    : 'bg-white border-gray-300 hover:border-rose-300'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{reason.icon}</span>
                  <div className="flex-1">
                    <div className="font-medium text-gray-900">{reason.label}</div>
                    {reason.severity === 'high' && (
                      <div className="text-xs text-red-600 mt-1">?? {tm('retHighPriority')}</div>
                    )}
                    {reason.severity === 'critical' && (
                      <div className="text-xs text-red-700 font-bold mt-1">?? {tm('retCritical')}</div>
                    )}
                  </div>
                  {selectedReason === reason.id && (
                    <CheckCircle className="w-6 h-6 text-rose-600" />
                  )}
                </div>
              </button>
            ))}
          </div>

          <h3 className="text-sm font-bold text-gray-700 mb-3">{tm('retConditionHeading')}</h3>
          <div className="grid grid-cols-2 gap-3 mb-6">
            {[
              { value: 'good', label: tm('retCondGood'), icon: '?', color: 'green' },
              { value: 'opened', label: tm('retCondOpened'), icon: '??', color: 'blue' },
              { value: 'damaged', label: tm('retCondDamaged'), icon: '??', color: 'orange' },
              { value: 'defective', label: tm('retCondDefective'), icon: '?', color: 'red' },
            ].map((cond) => (
              <button
                key={cond.value}
                onClick={() => setSelectedCondition(cond.value as any)}
                className={`p-4 rounded-xl border-2 transition-all ${
                  selectedCondition === cond.value
                    ? `bg-${cond.color}-100 border-${cond.color}-500`
                    : 'bg-white border-gray-300'
                }`}
              >
                <div className="text-2xl mb-1">{cond.icon}</div>
                <div className="text-sm font-medium">{cond.label}</div>
              </button>
            ))}
          </div>

          <h3 className="text-sm font-bold text-gray-700 mb-3">{tm('retNotesOptional')}</h3>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={tm('retNotesPh')}
            rows={3}
            className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:border-rose-500 mb-6"
          />

          <div className="flex gap-3">
            <button
              onClick={() => setStep('item-scan')}
              className="flex-1 py-3 border-2 border-gray-300 rounded-xl font-bold hover:bg-gray-50"
            >
              {tm('cancel')}
            </button>
            <button
              onClick={handleAddReturnItem}
              disabled={!selectedReason}
              className={`flex-1 py-3 rounded-xl font-bold ${
                selectedReason
                  ? 'bg-gradient-to-r from-rose-600 to-rose-700 text-white hover:shadow-lg'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              {tm('add')}
            </button>
          </div>
        </div>

        <div className="h-20"></div>
      </div>
    );
  }

  if (step === 'review') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-rose-50 to-rose-100 overflow-y-auto">
        <div className="bg-gradient-to-r from-rose-600 to-rose-700 text-white p-4 sticky top-0 z-10 shadow-lg">
          <div className="flex items-center gap-3">
            <button onClick={() => setStep('item-scan')} className="p-2 hover:bg-white/10 rounded-lg">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex-1">
              <h1 className="text-lg font-bold">{tm('retSummary')}</h1>
              <p className="text-xs text-rose-100">Return Summary</p>
            </div>
          </div>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-white rounded-xl p-4 shadow-sm text-center">
              <div className="text-xs text-gray-600 mb-1">{tm('retTotalProducts')}</div>
              <div className="text-2xl font-bold text-rose-600">{returnItems.length}</div>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm text-center">
              <div className="text-xs text-gray-600 mb-1">{tm('retTotalQty')}</div>
              <div className="text-2xl font-bold text-rose-600">
                {returnItems.reduce((sum, item) => sum + item.quantity, 0)}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
            <h3 className="text-sm font-bold text-gray-700 mb-2">{tm('retInfo')}</h3>
            <div className="text-xs text-gray-600 space-y-1">
              <div className="flex justify-between">
                <span>{tm('retTypeLabel')}</span>
                <span className="font-bold">
                  {returnType === 'customer' ? tm('retCustomerReturn') : tm('retSupplierReturn')}
                </span>
              </div>
              <div className="flex justify-between">
                <span>{tm('retSlipNoLabel')}</span>
                <span className="font-bold font-mono">{orderNumber}</span>
              </div>
              {customerName && (
                <div className="flex justify-between">
                  <span>{tm('retCustomerLabel')}</span>
                  <span className="font-bold">{customerName}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>{tm('retDateLabel')}</span>
                <span className="font-bold">{new Date().toLocaleDateString()}</span>
              </div>
            </div>
          </div>

          <h3 className="text-sm font-bold text-gray-700 mb-3">{tm('retReturnedList')}</h3>
          <div className="space-y-2 mb-4">
            {returnItems.map((item, idx) => (
              <div key={idx} className="bg-white rounded-xl p-4 shadow-sm">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <div className="font-medium text-gray-900">{item.productName}</div>
                    <div className="text-xs text-gray-500 font-mono mt-1">{item.barcode}</div>
                  </div>
                  <div className={`px-3 py-1 rounded-full text-xs font-medium border ${getConditionColor(item.condition)}`}>
                    {conditionLabel(item.condition)}
                  </div>
                </div>
                <div className="text-xs text-gray-600 bg-gray-50 rounded-lg p-2">
                  <div className="font-medium mb-1">
                    {getReasonList().find(r => r.id === item.returnReason)?.icon}{' '}
                    {getReasonList().find(r => r.id === item.returnReason)?.label}
                  </div>
                  {item.notes && (
                    <div className="text-gray-500 italic">{tm('retNotePrefix')} {item.notes}</div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setStep('item-scan')}
              className="flex-1 py-3 border-2 border-gray-300 rounded-xl font-bold hover:bg-gray-50"
            >
              {tm('retBack')}
            </button>
            <button
              onClick={handleComplete}
              className="flex-1 py-3 bg-gradient-to-r from-rose-600 to-rose-700 text-white rounded-xl font-bold hover:shadow-lg flex items-center justify-center gap-2"
            >
              <Check className="w-5 h-5" />
              {tm('confirm')}
            </button>
          </div>
        </div>

        <div className="h-20"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 to-rose-100">
      <div className="bg-gradient-to-r from-rose-600 to-rose-700 text-white p-4 sticky top-0 z-10 shadow-lg">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-lg">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold">{tm('retCompleted')}</h1>
            <p className="text-xs text-rose-100">Return Completed</p>
          </div>
        </div>
      </div>

      <div className="p-6">
        <div className="bg-white rounded-2xl p-6 shadow-lg text-center">
          <div className="w-24 h-24 bg-green-100 rounded-3xl flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-12 h-12 text-green-600" />
          </div>

          <h2 className="text-2xl font-bold text-gray-900 mb-2">{tm('retSaved')}</h2>
          <p className="text-gray-600 mb-6">
            {tm('retSavedDesc').replace(
              '{kind}',
              returnType === 'customer' ? tm('retKindCustomerLower') : tm('retKindSupplierLower')
            )}
          </p>

          <div className="bg-rose-50 rounded-xl p-4 mb-6">
            <div className="text-sm text-gray-700 space-y-2">
              <div className="flex justify-between">
                <span>{tm('retNoLabel')}</span>
                <span className="font-bold font-mono">RET-{new Date().getTime().toString().slice(-6)}</span>
              </div>
              <div className="flex justify-between">
                <span>{tm('retProductCount')}</span>
                <span className="font-bold">{returnItems.length}</span>
              </div>
              <div className="flex justify-between">
                <span>{tm('retStatusLabel')}</span>
                <span className="font-bold text-green-600">? {tm('retApproved')}</span>
              </div>
            </div>
          </div>

          {returnType === 'customer' && (
            <div className="bg-blue-50 rounded-xl p-4 mb-6 text-left">
              <p className="text-xs text-blue-900 font-medium mb-2">? {tm('retNextSteps')}</p>
              <ul className="text-xs text-blue-800 space-y-1">
                <li>? {tm('retCustStep1')}</li>
                <li>• {tm('retCustStep2')}</li>
                <li>• {tm('retCustStep3')}</li>
              </ul>
            </div>
          )}

          {returnType === 'supplier' && (
            <div className="bg-blue-50 rounded-xl p-4 mb-6 text-left">
              <p className="text-xs text-blue-900 font-medium mb-2">? {tm('retNextSteps')}</p>
              <ul className="text-xs text-blue-800 space-y-1">
                <li>? {tm('retSupStep1')}</li>
                <li>• {tm('retSupStep2')}</li>
                <li>• {tm('retSupStep3')}</li>
              </ul>
            </div>
          )}

          <button
            onClick={onBack}
            className="w-full py-3 bg-gradient-to-r from-rose-600 to-rose-700 text-white rounded-xl font-bold hover:shadow-lg"
          >
            {tm('retMainMenu')}
          </button>
        </div>
      </div>
    </div>
  );
}
