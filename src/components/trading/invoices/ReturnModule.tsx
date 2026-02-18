import { RefreshCw, TrendingDown, Plus, Edit, Trash2, Eye, ArrowLeft, Save, X } from 'lucide-react';
import { useState } from 'react';
import { formatNumber } from '../../../utils/formatNumber';

export function ReturnModule() {
  const [view, setView] = useState<'list' | 'create' | 'edit'>('list');
  const [selectedReturn, setSelectedReturn] = useState<any>(null);

  const [returns, setReturns] = useState([
    { id: 'IAD-2025-0001', originalInvoice: 'SAT-2025-0003', customer: 'Ali Al-Sadr', supplier: '', type: 'Satış İadesi', date: '2025-01-18', amount: 850000, reason: 'Hasarlı Ürün', status: 'Onaylandı' },
    { id: 'IAD-2025-0002', originalInvoice: 'SAT-2025-0001', customer: 'Mohammed Hassan', supplier: '', type: 'Satış İadesi', date: '2025-01-17', amount: 1200000, reason: 'Müşteri Talebi', status: 'Beklemede' },
    { id: 'ALIADE-2025-0001', originalInvoice: 'ALI-2025-0004', customer: '', supplier: 'ABC Gıda Ltd.', type: 'Alış İadesi', date: '2025-01-16', amount: 450000, reason: 'Kalite Sorunu', status: 'Onaylandı' },
  ]);

  // Form View (Create/Edit)
  if (view === 'create' || view === 'edit') {
    return (
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-orange-600 to-orange-700 text-white px-4 py-3 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button 
                onClick={() => {
                  setView('list');
                  setSelectedReturn(null);
                }}
                className="p-2 hover:bg-orange-800 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h2 className="text-lg font-semibold">
                  {view === 'create' ? 'Yeni İade Faturası' : 'İade Faturası Düzenle'}
                </h2>
                {view === 'edit' && selectedReturn && (
                  <p className="text-sm text-orange-100">İade No: {selectedReturn.id}</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Form Content */}
        <div className="flex-1 overflow-auto p-6">
          <div className="bg-white rounded-lg shadow-sm border max-w-4xl mx-auto">
            <div className="p-6 space-y-6">
              {/* İade Türü */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">İade Türü *</label>
                <select 
                  defaultValue={selectedReturn?.type || 'Satış İadesi'}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                >
                  <option>Satış İadesi</option>
                  <option>Alış İadesi</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Orijinal Fatura */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Orijinal Fatura No *</label>
                  <input 
                    type="text" 
                    defaultValue={selectedReturn?.originalInvoice}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500" 
                    placeholder="SAT-2025-0001"
                  />
                </div>

                {/* Tarih */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">İade Tarihi *</label>
                  <input 
                    type="date" 
                    defaultValue={selectedReturn?.date || new Date().toISOString().split('T')[0]}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500" 
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Müşteri/Tedarikçi */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Müşteri/Tedarikçi *</label>
                  <select 
                    defaultValue={selectedReturn?.customer || selectedReturn?.supplier}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                  >
                    <option value="">Seçiniz...</option>
                    <option>Ahmed Al-Maliki</option>
                    <option>Mohammed Hassan</option>
                    <option>Ali Al-Sadr</option>
                    <option>ABC Gıda Ltd.</option>
                    <option>XYZ Toptan</option>
                  </select>
                </div>

                {/* Tutar */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">İade Tutarı (IQD) *</label>
                  <input 
                    type="number" 
                    defaultValue={selectedReturn?.amount}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500" 
                    placeholder="1000000"
                  />
                </div>
              </div>

              {/* İade Sebebi */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">İade Sebebi *</label>
                <select 
                  defaultValue={selectedReturn?.reason}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                >
                  <option>Hasarlı Ürün</option>
                  <option>Kalite Sorunu</option>
                  <option>Müşteri Talebi</option>
                  <option>Yanlış Ürün Gönderimi</option>
                  <option>Eksik Teslimat</option>
                  <option>Diğer</option>
                </select>
              </div>

              {/* Açıklama */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Açıklama</label>
                <textarea 
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                  placeholder="İade ile ilgili detaylı açıklama..."
                />
              </div>

              {/* Durum */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Durum</label>
                <select 
                  defaultValue={selectedReturn?.status || 'Beklemede'}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                >
                  <option>Beklemede</option>
                  <option>Onaylandı</option>
                  <option>İptal Edildi</option>
                </select>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t">
                <button 
                  onClick={() => {
                    setView('list');
                    setSelectedReturn(null);
                  }}
                  className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  İptal
                </button>
                <button 
                  onClick={() => {
                    alert(view === 'create' ? 'İade faturası oluşturuldu!' : 'İade faturası güncellendi!');
                    setView('list');
                    setSelectedReturn(null);
                  }}
                  className="px-6 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 flex items-center gap-2"
                >
                  <Save className="h-4 w-4" />
                  Kaydet
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="bg-gradient-to-r from-orange-600 to-orange-700 text-white px-4 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4" />
            <h2 className="text-sm">İade Faturaları</h2>
            <span className="text-orange-100 text-[10px] ml-2">• Satış ve alış iadeleri</span>
          </div>
          <button 
            onClick={() => setView('create')}
            className="flex items-center gap-1 px-2 py-1 bg-white text-orange-700 hover:bg-orange-50 transition-colors text-[10px] rounded"
          >
            <Plus className="w-3 h-3" />
            <span>Yeni İade</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-3">
        {/* Kurumsal Özet Panel */}
        <div className="bg-white border border-gray-300 rounded mb-3">
          <div className="bg-[#E3F2FD] border-b border-gray-300 px-3 py-1.5">
            <h3 className="text-[11px] text-gray-700">İade Özeti</h3>
          </div>
          <div className="grid grid-cols-4 divide-x divide-gray-200">
            <div className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <TrendingDown className="w-4 h-4 text-red-600" />
                <span className="text-[10px] text-gray-600">Toplam İade</span>
              </div>
              <div className="text-base text-gray-900">{returns.length}</div>
            </div>
            <div className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <RefreshCw className="w-4 h-4 text-orange-600" />
                <span className="text-[10px] text-gray-600">İade Tutarı</span>
              </div>
              <div className="text-base text-orange-600">
                {formatNumber(returns.reduce((s, r) => s + r.amount, 0), 2, true)} IQD
              </div>
            </div>
            <div className="p-3">
              <div className="text-[10px] text-gray-600 mb-1">Satış İadesi</div>
              <div className="text-base text-blue-600">
                {returns.filter(r => r.type === 'Satış İadesi').length}
              </div>
            </div>
            <div className="p-3">
              <div className="text-[10px] text-gray-600 mb-1">Alış İadesi</div>
              <div className="text-base text-purple-600">
                {returns.filter(r => r.type === 'Alış İadesi').length}
              </div>
            </div>
          </div>
        </div>

        {/* Tablo */}
        <div className="bg-white border border-gray-300">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-[#E3F2FD] border-b border-gray-300">
                <th className="px-2 py-1 text-left text-[10px] text-gray-700 border-r border-gray-300">İADE NO</th>
                <th className="px-2 py-1 text-left text-[10px] text-gray-700 border-r border-gray-300">TÜR</th>
                <th className="px-2 py-1 text-left text-[10px] text-gray-700 border-r border-gray-300">ORİJİNAL FATURA</th>
                <th className="px-2 py-1 text-left text-[10px] text-gray-700 border-r border-gray-300">MÜŞTERİ/TEDARİKÇİ</th>
                <th className="px-2 py-1 text-left text-[10px] text-gray-700 border-r border-gray-300">TARİH</th>
                <th className="px-2 py-1 text-right text-[10px] text-gray-700 border-r border-gray-300">TUTAR</th>
                <th className="px-2 py-1 text-left text-[10px] text-gray-700 border-r border-gray-300">SEBEP</th>
                <th className="px-2 py-1 text-center text-[10px] text-gray-700 border-r border-gray-300">DURUM</th>
                <th className="px-2 py-1 text-center text-[10px] text-gray-700">İŞLEMLER</th>
              </tr>
            </thead>
            <tbody>
              {returns.map(ret => (
                <tr key={ret.id} className="border-b border-gray-200 hover:bg-gray-50">
                  <td className="px-2 py-0.5 font-mono text-[10px] border-r border-gray-200">{ret.id}</td>
                  <td className="px-2 py-0.5 text-[10px] border-r border-gray-200">
                    <span className={`px-2 py-0.5 rounded text-[9px] ${
                      ret.type === 'Satış İadesi' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                    }`}>
                      {ret.type}
                    </span>
                  </td>
                  <td className="px-2 py-0.5 font-mono text-[10px] text-blue-600 border-r border-gray-200">{ret.originalInvoice}</td>
                  <td className="px-2 py-0.5 text-[10px] border-r border-gray-200">{ret.customer || ret.supplier}</td>
                  <td className="px-2 py-0.5 text-[10px] text-gray-600 border-r border-gray-200">{new Date(ret.date).toLocaleDateString('tr-TR')}</td>
                  <td className="px-2 py-0.5 text-right text-[10px] text-red-600 border-r border-gray-200">
                    {formatNumber(ret.amount, 2, true)} IQD
                  </td>
                  <td className="px-2 py-0.5 text-[10px] border-r border-gray-200">{ret.reason}</td>
                  <td className="px-2 py-0.5 text-center border-r border-gray-200">
                    <span className={`px-2 py-0.5 rounded text-[9px] ${
                      ret.status === 'Onaylandı' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                    }`}>
                      {ret.status}
                    </span>
                  </td>
                  <td className="px-2 py-0.5 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button 
                        onClick={() => {
                          setSelectedReturn(ret);
                          setView('edit');
                        }}
                        className="p-0.5 text-blue-600 hover:bg-blue-50 rounded" 
                        title="Düzenle"
                      >
                        <Edit className="w-3 h-3" />
                      </button>
                      <button 
                        onClick={() => alert(`İade görüntüleniyor: ${ret.id}`)}
                        className="p-0.5 text-green-600 hover:bg-green-50 rounded" 
                        title="Görüntüle"
                      >
                        <Eye className="w-3 h-3" />
                      </button>
                      <button 
                        onClick={() => {
                          if (confirm(`${ret.id} numaralı iadeyi silmek istediğinize emin misiniz?`)) {
                            setReturns(returns.filter(r => r.id !== ret.id));
                            alert('İade silindi!');
                          }
                        }}
                        className="p-0.5 text-red-600 hover:bg-red-50 rounded" 
                        title="Sil"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

