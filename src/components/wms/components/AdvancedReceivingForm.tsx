// ğŸ“¦ Advanced Receiving Form - Gelişmiş Mal Kabul Formu
// Şartlı kabul, SKT, Parti, Palet seçimi

import { useState } from 'react';
import { 
  AlertTriangle, Calendar, Package, Box, Layers,
  CheckCircle, XCircle, Clock, Tag, Ruler, Save, X
} from 'lucide-react';
import { BarcodeScanner } from './BarcodeScanner';

interface AdvancedReceivingFormProps {
  darkMode: boolean;
  onSave: (data: ReceivingFormData) => void;
  onCancel: () => void;
  initialData?: Partial<ReceivingFormData>;
}

export interface ReceivingFormData {
  product_id: string;
  barcode?: string;
  product_name?: string;
  ordered_quantity: number;
  received_quantity: number;
  accepted_quantity: number;
  rejected_quantity: number;
  conditional_quantity: number; // Şartlı kabul
  unit: string;
  unit_cost: number;
  
  // SKT
  has_expiry: boolean;
  expiry_date?: string;
  
  // Parti
  has_lot: boolean;
  lot_number?: string;
  
  // Palet
  pallet_type?: string;
  pallet_count?: number;
  
  // Yerleşim
  putaway_location_id?: string;
  
  // Notlar
  notes?: string;
}

const PALLET_TYPES = [
  { id: 'euro_80x120', name: 'Euro Palet (80x120)', size: '80x120 cm' },
  { id: 'epal_80x120', name: 'EPAL/Turpal (80x120)', size: '80x120 cm' },
  { id: 'chep_80x120', name: 'CHEP (80x120)', size: '80x120 cm' },
  { id: 'plastic_80x120', name: 'Plastik (80x120)', size: '80x120 cm' },
  { id: 'generic_80x120', name: 'Vasıfsız (80x120)', size: '80x120 cm' },
  { id: 'dusseldorf_80x60', name: 'Düsseldorf (80x60)', size: '80x60 cm' },
  { id: 'large_120x120', name: 'Büyük Boy (120x120)', size: '120x120 cm' },
];

export function AdvancedReceivingForm({ 
  darkMode, 
  onSave, 
  onCancel, 
  initialData 
}: AdvancedReceivingFormProps) {
  const [activeTab, setActiveTab] = useState<'basic' | 'conditional' | 'expiry' | 'lot' | 'pallet'>('basic');
  const [showScanner, setShowScanner] = useState(false);
  const [formData, setFormData] = useState<ReceivingFormData>({
    product_id: initialData?.product_id || '',
    barcode: initialData?.barcode || '',
    product_name: initialData?.product_name || '',
    ordered_quantity: initialData?.ordered_quantity || 0,
    received_quantity: initialData?.received_quantity || 0,
    accepted_quantity: initialData?.accepted_quantity || 0,
    rejected_quantity: initialData?.rejected_quantity || 0,
    conditional_quantity: initialData?.conditional_quantity || 0,
    unit: initialData?.unit || 'Adet',
    unit_cost: initialData?.unit_cost || 0,
    has_expiry: initialData?.has_expiry || false,
    expiry_date: initialData?.expiry_date || '',
    has_lot: initialData?.has_lot || false,
    lot_number: initialData?.lot_number || '',
    pallet_type: initialData?.pallet_type || '',
    pallet_count: initialData?.pallet_count || 0,
    putaway_location_id: initialData?.putaway_location_id || '',
    notes: initialData?.notes || '',
  });

  const bgClass = darkMode ? 'bg-gray-900' : 'bg-gray-50';
  const cardClass = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const textClass = darkMode ? 'text-gray-100' : 'text-gray-900';
  const inputClass = darkMode ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-900';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  const tabs = [
    { id: 'basic', label: 'Temel Bilgiler', icon: Package },
    { id: 'conditional', label: 'Şartlı Kabul', icon: AlertTriangle },
    { id: 'expiry', label: 'SKT Girişi', icon: Calendar },
    { id: 'lot', label: 'Parti No', icon: Tag },
    { id: 'pallet', label: 'Palet Seçimi', icon: Layers },
  ];

  return (
    <div className={`min-h-screen ${bgClass} p-6`}>
      <div className={`max-w-6xl mx-auto`}>
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className={`text-2xl font-bold ${textClass} mb-1`}>
              Mal Kabul Detayları
            </h2>
            <p className="text-gray-500">Ürün bilgilerini girin ve kabul durumunu belirleyin</p>
          </div>
          <button
            onClick={onCancel}
            className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className={`w-6 h-6 ${textClass}`} />
          </button>
        </div>

        {/* Tabs */}
        <div className={`${cardClass} border rounded-xl mb-6 overflow-hidden`}>
          <div className="flex overflow-x-auto">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex-1 min-w-[140px] flex items-center justify-center gap-2 px-4 py-4 border-b-2 transition-colors ${
                    isActive
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-transparent hover:bg-gray-50 dark:hover:bg-gray-700/50'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-blue-500' : 'text-gray-400'}`} />
                  <span className={`text-sm font-medium ${isActive ? 'text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400'}`}>
                    {tab.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Tab Content */}
          <div className={`${cardClass} border rounded-xl p-6 mb-6`}>
            {/* BASIC INFO */}
            {activeTab === 'basic' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Barcode */}
                  <div>
                    <label className={`block text-sm font-medium ${textClass} mb-2`}>
                      Barkod
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={formData.barcode}
                        onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                        className={`flex-1 px-4 py-2 rounded-lg border ${inputClass}`}
                        placeholder="Barkod numarası"
                      />
                      <button
                        type="button"
                        onClick={() => setShowScanner(true)}
                        className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg"
                      >
                        Tara
                      </button>
                    </div>
                  </div>

                  {/* Product Name */}
                  <div>
                    <label className={`block text-sm font-medium ${textClass} mb-2`}>
                      Ürün Adı
                    </label>
                    <input
                      type="text"
                      value={formData.product_name}
                      onChange={(e) => setFormData({ ...formData, product_name: e.target.value })}
                      className={`w-full px-4 py-2 rounded-lg border ${inputClass}`}
                      placeholder="Ürün adı"
                      required
                    />
                  </div>

                  {/* Ordered Quantity */}
                  <div>
                    <label className={`block text-sm font-medium ${textClass} mb-2`}>
                      Sipariş Miktarı
                    </label>
                    <input
                      type="number"
                      value={formData.ordered_quantity}
                      onChange={(e) => setFormData({ ...formData, ordered_quantity: parseFloat(e.target.value) })}
                      className={`w-full px-4 py-2 rounded-lg border ${inputClass}`}
                      min="0"
                      step="0.01"
                      required
                    />
                  </div>

                  {/* Received Quantity */}
                  <div>
                    <label className={`block text-sm font-medium ${textClass} mb-2`}>
                      Gelen Miktar
                    </label>
                    <input
                      type="number"
                      value={formData.received_quantity}
                      onChange={(e) => {
                        const received = parseFloat(e.target.value);
                        setFormData({ 
                          ...formData, 
                          received_quantity: received,
                          accepted_quantity: received // Auto-fill accepted
                        });
                      }}
                      className={`w-full px-4 py-2 rounded-lg border ${inputClass}`}
                      min="0"
                      step="0.01"
                      required
                    />
                  </div>

                  {/* Accepted Quantity */}
                  <div>
                    <label className={`block text-sm font-medium ${textClass} mb-2 flex items-center gap-2`}>
                      <CheckCircle className="w-4 h-4 text-green-500" />
                      Kabul Edilen
                    </label>
                    <input
                      type="number"
                      value={formData.accepted_quantity}
                      onChange={(e) => setFormData({ ...formData, accepted_quantity: parseFloat(e.target.value) })}
                      className={`w-full px-4 py-2 rounded-lg border ${inputClass}`}
                      min="0"
                      step="0.01"
                    />
                  </div>

                  {/* Rejected Quantity */}
                  <div>
                    <label className={`block text-sm font-medium ${textClass} mb-2 flex items-center gap-2`}>
                      <XCircle className="w-4 h-4 text-red-500" />
                      Reddedilen
                    </label>
                    <input
                      type="number"
                      value={formData.rejected_quantity}
                      onChange={(e) => setFormData({ ...formData, rejected_quantity: parseFloat(e.target.value) })}
                      className={`w-full px-4 py-2 rounded-lg border ${inputClass}`}
                      min="0"
                      step="0.01"
                    />
                  </div>

                  {/* Unit */}
                  <div>
                    <label className={`block text-sm font-medium ${textClass} mb-2`}>
                      Birim
                    </label>
                    <select
                      value={formData.unit}
                      onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                      className={`w-full px-4 py-2 rounded-lg border ${inputClass}`}
                    >
                      <option value="Adet">Adet</option>
                      <option value="Kg">Kg</option>
                      <option value="Lt">Lt</option>
                      <option value="Koli">Koli</option>
                      <option value="Palet">Palet</option>
                    </select>
                  </div>

                  {/* Unit Cost */}
                  <div>
                    <label className={`block text-sm font-medium ${textClass} mb-2`}>
                      Birim Fiyat
                    </label>
                    <input
                      type="number"
                      value={formData.unit_cost}
                      onChange={(e) => setFormData({ ...formData, unit_cost: parseFloat(e.target.value) })}
                      className={`w-full px-4 py-2 rounded-lg border ${inputClass}`}
                      min="0"
                      step="0.01"
                    />
                  </div>
                </div>

                {/* Summary */}
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">Toplam Tutar</div>
                      <div className={`text-xl font-bold ${textClass}`}>
                        {(formData.received_quantity * formData.unit_cost).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} IQD
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">Fark</div>
                      <div className={`text-xl font-bold ${formData.received_quantity > formData.ordered_quantity ? 'text-green-600' : formData.received_quantity < formData.ordered_quantity ? 'text-red-600' : textClass}`}>
                        {formData.received_quantity - formData.ordered_quantity > 0 ? '+' : ''}{formData.received_quantity - formData.ordered_quantity}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">Fire</div>
                      <div className={`text-xl font-bold text-red-600`}>
                        {formData.rejected_quantity}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* CONDITIONAL ACCEPTANCE */}
            {activeTab === 'conditional' && (
              <div className="space-y-6">
                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-6">
                  <div className="flex items-start gap-3 mb-4">
                    <AlertTriangle className="w-6 h-6 text-yellow-600 flex-shrink-0 mt-1" />
                    <div>
                      <h3 className={`text-lg font-bold ${textClass} mb-2`}>Şartlı Mal Kabul</h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Kalite kontrolü bekleyen, hasarlı veya eksik ürünler için şartlı kabul işlemi yapılabilir.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                    <div>
                      <label className={`block text-sm font-medium ${textClass} mb-2`}>
                        Şartlı Kabul Miktarı
                      </label>
                      <input
                        type="number"
                        value={formData.conditional_quantity}
                        onChange={(e) => setFormData({ ...formData, conditional_quantity: parseFloat(e.target.value) })}
                        className={`w-full px-4 py-2 rounded-lg border ${inputClass}`}
                        min="0"
                        step="0.01"
                      />
                    </div>

                    <div>
                      <label className={`block text-sm font-medium ${textClass} mb-2`}>
                        Şartlı Kabul Nedeni
                      </label>
                      <select className={`w-full px-4 py-2 rounded-lg border ${inputClass}`}>
                        <option>Kalite kontrolü bekliyor</option>
                        <option>Ambalaj hasarlı</option>
                        <option>Eksik teslimat</option>
                        <option>SKT yakın</option>
                        <option>Diğer</option>
                      </select>
                    </div>

                    <div className="md:col-span-2">
                      <label className={`block text-sm font-medium ${textClass} mb-2`}>
                        Açıklama
                      </label>
                      <textarea
                        value={formData.notes}
                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                        className={`w-full px-4 py-2 rounded-lg border ${inputClass}`}
                        rows={3}
                        placeholder="Şartlı kabul ile ilgili detaylar..."
                      />
                    </div>
                  </div>
                </div>

                {/* Status Distribution */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg text-center">
                    <CheckCircle className="w-8 h-8 text-green-600 mx-auto mb-2" />
                    <div className="text-sm text-gray-600 dark:text-gray-400">Kabul</div>
                    <div className={`text-2xl font-bold text-green-600`}>{formData.accepted_quantity}</div>
                  </div>
                  <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg text-center">
                    <Clock className="w-8 h-8 text-yellow-600 mx-auto mb-2" />
                    <div className="text-sm text-gray-600 dark:text-gray-400">Şartlı</div>
                    <div className={`text-2xl font-bold text-yellow-600`}>{formData.conditional_quantity}</div>
                  </div>
                  <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg text-center">
                    <XCircle className="w-8 h-8 text-red-600 mx-auto mb-2" />
                    <div className="text-sm text-gray-600 dark:text-gray-400">Red</div>
                    <div className={`text-2xl font-bold text-red-600`}>{formData.rejected_quantity}</div>
                  </div>
                </div>
              </div>
            )}

            {/* EXPIRY DATE */}
            {activeTab === 'expiry' && (
              <div className="space-y-6">
                <div className="flex items-center gap-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <input
                    type="checkbox"
                    id="has_expiry"
                    checked={formData.has_expiry}
                    onChange={(e) => setFormData({ ...formData, has_expiry: e.target.checked })}
                    className="w-5 h-5"
                  />
                  <label htmlFor="has_expiry" className={`text-sm font-medium ${textClass}`}>
                    Bu ürünün son kullanma tarihi (SKT) var
                  </label>
                </div>

                {formData.has_expiry && (
                  <>
                    <div>
                      <label className={`block text-sm font-medium ${textClass} mb-2`}>
                        Son Kullanma Tarihi (SKT)
                      </label>
                      <input
                        type="date"
                        value={formData.expiry_date}
                        onChange={(e) => setFormData({ ...formData, expiry_date: e.target.value })}
                        className={`w-full px-4 py-2 rounded-lg border ${inputClass}`}
                        required={formData.has_expiry}
                      />
                    </div>

                    {/* SKT Warning */}
                    {formData.expiry_date && (
                      <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                        <div className="flex items-start gap-3">
                          <Calendar className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                          <div>
                            <div className="text-sm font-medium text-yellow-800 dark:text-yellow-300 mb-1">
                              SKT Uyarısı
                            </div>
                            <div className="text-sm text-yellow-700 dark:text-yellow-400">
                              {(() => {
                                const expiryDate = new Date(formData.expiry_date);
                                const today = new Date();
                                const daysUntilExpiry = Math.floor((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                                
                                if (daysUntilExpiry < 0) {
                                  return `⚠️ Bu ürün ${Math.abs(daysUntilExpiry)} gün önce tarihi geçmiş!`;
                                } else if (daysUntilExpiry < 30) {
                                  return `⚠️ SKT'ye ${daysUntilExpiry} gün kaldı - Öncelikli yerleştirme önerilir`;
                                } else if (daysUntilExpiry < 90) {
                                  return `ℹ️ SKT'ye ${daysUntilExpiry} gün kaldı`;
                                } else {
                                  return `✓ SKT uygun (${daysUntilExpiry} gün)`;
                                }
                              })()}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className={`${cardClass} border rounded-lg p-4`}>
                      <h4 className={`text-sm font-medium ${textClass} mb-3`}>SKT Öncelik Bilgisi</h4>
                      <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                        <li className="flex items-start gap-2">
                          <span className="text-blue-500 mt-1">•</span>
                          <span>Ürün yerleşiminde SKT'si en yakın ürünler öncelikli olarak yerleştirilir</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="text-blue-500 mt-1">•</span>
                          <span>Stok beslemede FEFO (First Expired, First Out) prensibi uygulanır</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="text-blue-500 mt-1">•</span>
                          <span>30 gün altı SKT'ye sahip ürünler için otomatik uyarı oluşturulur</span>
                        </li>
                      </ul>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* LOT NUMBER */}
            {activeTab === 'lot' && (
              <div className="space-y-6">
                <div className="flex items-center gap-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <input
                    type="checkbox"
                    id="has_lot"
                    checked={formData.has_lot}
                    onChange={(e) => setFormData({ ...formData, has_lot: e.target.checked })}
                    className="w-5 h-5"
                  />
                  <label htmlFor="has_lot" className={`text-sm font-medium ${textClass}`}>
                    Bu ürün parti numarası ile takip ediliyor
                  </label>
                </div>

                {formData.has_lot && (
                  <>
                    <div>
                      <label className={`block text-sm font-medium ${textClass} mb-2`}>
                        Parti Numarası
                      </label>
                      <input
                        type="text"
                        value={formData.lot_number}
                        onChange={(e) => setFormData({ ...formData, lot_number: e.target.value })}
                        className={`w-full px-4 py-2 rounded-lg border ${inputClass}`}
                        placeholder="LOT-2024-12345"
                        required={formData.has_lot}
                      />
                    </div>

                    <div className={`${cardClass} border rounded-lg p-4`}>
                      <h4 className={`text-sm font-medium ${textClass} mb-3`}>Parti Takibi Avantajları</h4>
                      <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                        <li className="flex items-start gap-2">
                          <Tag className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                          <span>Ürün izlenebilirliği: Hangi partiden kaç adet satıldığı takip edilir</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <Tag className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                          <span>Geri çağırma: Sorunlu parti tespit edildiğinde hızlı aksiyon alınabilir</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <Tag className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                          <span>Kalite kontrol: Parti bazında kalite raporları oluşturulur</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <Tag className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                          <span>Stok rotasyonu: FIFO/FEFO kuralları parti bazında uygulanır</span>
                        </li>
                      </ul>
                    </div>

                    {/* Recent Lots */}
                    <div>
                      <h4 className={`text-sm font-medium ${textClass} mb-3`}>Son Kullanılan Parti Numaraları</h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {['LOT-2024-001', 'LOT-2024-002', 'LOT-2024-003', 'LOT-2024-004'].map((lot) => (
                          <button
                            key={lot}
                            type="button"
                            onClick={() => setFormData({ ...formData, lot_number: lot })}
                            className={`px-3 py-2 rounded-lg border text-sm ${
                              formData.lot_number === lot
                                ? 'bg-blue-500 text-white border-blue-500'
                                : darkMode
                                ? 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600'
                                : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                            }`}
                          >
                            {lot}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* PALLET SELECTION */}
            {activeTab === 'pallet' && (
              <div className="space-y-6">
                <div>
                  <label className={`block text-sm font-medium ${textClass} mb-3`}>
                    Palet Tipi Seçin
                  </label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {PALLET_TYPES.map((pallet) => (
                      <button
                        key={pallet.id}
                        type="button"
                        onClick={() => setFormData({ ...formData, pallet_type: pallet.id })}
                        className={`p-4 rounded-lg border-2 text-left transition-all ${
                          formData.pallet_type === pallet.id
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                            : darkMode
                            ? 'border-gray-700 bg-gray-800 hover:border-gray-600'
                            : 'border-gray-200 bg-white hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <Layers className={`w-6 h-6 flex-shrink-0 ${
                            formData.pallet_type === pallet.id ? 'text-blue-500' : 'text-gray-400'
                          }`} />
                          <div className="flex-1">
                            <div className={`font-medium mb-1 ${
                              formData.pallet_type === pallet.id 
                                ? 'text-blue-600 dark:text-blue-400' 
                                : textClass
                            }`}>
                              {pallet.name}
                            </div>
                            <div className="text-sm text-gray-500">
                              Ebat: {pallet.size}
                            </div>
                          </div>
                          {formData.pallet_type === pallet.id && (
                            <CheckCircle className="w-5 h-5 text-blue-500" />
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {formData.pallet_type && (
                  <>
                    <div>
                      <label className={`block text-sm font-medium ${textClass} mb-2`}>
                        Palet Adedi
                      </label>
                      <input
                        type="number"
                        value={formData.pallet_count}
                        onChange={(e) => setFormData({ ...formData, pallet_count: parseFloat(e.target.value) })}
                        className={`w-full px-4 py-2 rounded-lg border ${inputClass}`}
                        min="0"
                        step="1"
                        placeholder="Palet sayısı"
                      />
                    </div>

                    {/* Pallet Summary */}
                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                      <div className="grid grid-cols-3 gap-4 text-center">
                        <div>
                          <div className="text-sm text-gray-600 dark:text-gray-400">Toplam Palet</div>
                          <div className={`text-xl font-bold ${textClass}`}>{formData.pallet_count || 0}</div>
                        </div>
                        <div>
                          <div className="text-sm text-gray-600 dark:text-gray-400">Adet/Palet</div>
                          <div className={`text-xl font-bold ${textClass}`}>
                            {formData.pallet_count > 0 ? Math.round(formData.received_quantity / formData.pallet_count) : 0}
                          </div>
                        </div>
                        <div>
                          <div className="text-sm text-gray-600 dark:text-gray-400">Palet Tipi</div>
                          <div className={`text-sm font-bold ${textClass}`}>
                            {PALLET_TYPES.find(p => p.id === formData.pallet_type)?.size || '-'}
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onCancel}
              className={`px-6 py-3 rounded-lg border ${
                darkMode ? 'border-gray-600 hover:bg-gray-700' : 'border-gray-300 hover:bg-gray-50'
              }`}
            >
              İptal
            </button>
            <button
              type="submit"
              className="flex items-center gap-2 px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
            >
              <Save className="w-5 h-5" />
              Kaydet ve Devam Et
            </button>
          </div>
        </form>
      </div>

      {/* Barcode Scanner Modal */}
      {showScanner && (
        <BarcodeScanner
          darkMode={darkMode}
          onScan={(barcode) => {
            setFormData({ ...formData, barcode });
            setShowScanner(false);
          }}
          onClose={() => setShowScanner(false)}
          isOpen={showScanner}
        />
      )}
    </div>
  );
}

