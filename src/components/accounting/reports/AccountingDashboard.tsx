import React, { useState, useEffect } from 'react';
import { accountingAPI, YevmiyeFisi, YevmiyeSatiri, HesapPlani } from '../../../services/api/accounting';
import { Plus, X, Save, AlertCircle } from 'lucide-react';

export function AccountingDashboard() {
  const [fisler, setFisler] = useState<YevmiyeFisi[]>([]);
  const [accounts, setAccounts] = useState<HesapPlani[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNewFisModal, setShowNewFisModal] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [fisData, accountData] = await Promise.all([
        accountingAPI.getJournalEntries(),
        accountingAPI.getChartOfAccounts()
      ]);
      setFisler(fisData || []);
      setAccounts(accountData || []);
    } catch (err: any) {
      console.error('[Accounting] Load error:', err);
      setError(err.message || 'Veriler yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  const loadYevmiyeFisleri = loadData; // Alias for backward compatibility

  const getTotalBorc = (satirlar?: YevmiyeSatiri[]) => {
    if (!satirlar) return 0;
    return satirlar.reduce((sum, s) => sum + (s.borc || 0), 0);
  };

  const getTotalAlacak = (satirlar?: YevmiyeSatiri[]) => {
    if (!satirlar) return 0;
    return satirlar.reduce((sum, s) => sum + (s.alacak || 0), 0);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <h3 className="text-red-800 font-semibold">Hata</h3>
        <p className="text-red-600">{error}</p>
        <button
          onClick={loadYevmiyeFisleri}
          className="mt-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
        >
          Tekrar Dene
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 bg-gray-50 min-h-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <Save className="w-6 h-6 text-blue-600" />
          Muhasebe - Yevmiye Defteri
        </h1>
        <button
          onClick={() => setShowNewFisModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-shadow shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Yeni Fiş
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          <div className="text-sm text-gray-500">Toplam Fiş</div>
          <div className="text-2xl font-bold text-gray-900">{fisler.length}</div>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          <div className="text-sm text-gray-500 font-medium">Onaylı</div>
          <div className="text-2xl font-bold text-green-600">
            {fisler.filter((f: YevmiyeFisi) => f.onay_durumu === 'ONAYLANDI').length}
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          <div className="text-sm text-gray-500 font-medium">Taslak</div>
          <div className="text-2xl font-bold text-orange-500">
            {fisler.filter((f: YevmiyeFisi) => f.onay_durumu === 'TASLAK').length}
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          <div className="text-sm text-gray-500 font-medium">İptal</div>
          <div className="text-2xl font-bold text-red-500">
            {fisler.filter((f: YevmiyeFisi) => f.onay_durumu === 'IPTAL').length}
          </div>
        </div>
      </div>

      {/* Fiş Listesi */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Fiş No</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Tarih</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Açıklama</th>
              <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Borç</th>
              <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Alacak</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Durum</th>
              <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">İşlem</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {fisler.map((fis) => (
              <tr key={fis.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-blue-600">{fis.fis_no}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                  {new Date(fis.fis_tarihi).toLocaleDateString('tr-TR')}
                </td>
                <td className="px-6 py-4 text-sm text-gray-600 truncate max-w-xs">{fis.aciklama}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-semibold text-gray-900">
                  {getTotalBorc(fis.satirlar).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-semibold text-gray-900">
                  {getTotalAlacak(fis.satirlar).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2.5 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${fis.onay_durumu === 'ONAYLANDI' ? 'bg-green-100 text-green-800' :
                      fis.onay_durumu === 'TASLAK' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                    }`}>
                    {fis.onay_durumu}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <button className="text-blue-600 hover:text-blue-900 transition-colors mr-3">Görüntüle</button>
                  <button className="text-gray-400 hover:text-gray-600 transition-colors">Yazdır</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {fisler.length === 0 && (
          <div className="text-center py-20 bg-white">
            <AlertCircle className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-lg">Henüz yevmiye fişi bulunmuyor</p>
            <button
              onClick={() => setShowNewFisModal(true)}
              className="mt-4 text-blue-600 font-medium hover:underline"
            >
              İlk fişi oluşturun
            </button>
          </div>
        )}
      </div>

      {/* Yeni Fiş Modal */}
      {showNewFisModal && (
        <YeniFisModal
          onClose={() => setShowNewFisModal(false)}
          onSave={loadData}
          accounts={accounts}
        />
      )}
    </div>
  );
}

function YeniFisModal({ onClose, onSave, accounts }: { onClose: () => void, onSave: () => void, accounts: HesapPlani[] }) {
  const [fis, setFis] = useState<Omit<YevmiyeFisi, 'id' | 'satirlar'>>({
    fis_no: `YF-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`,
    fis_tarihi: new Date().toISOString().split('T')[0],
    fis_tipi: 'ISLEM',
    donem_yil: new Date().getFullYear(),
    donem_ay: new Date().getMonth() + 1,
    onay_durumu: 'TASLAK',
    olusturan_id: '', // Supposedly from auth context
    aciklama: ''
  });

  const [satirlar, setSatirlar] = useState<Omit<YevmiyeSatiri, 'id' | 'fis_id'>[]>([
    { sira_no: 1, hesap_kodu: '', borc: 0, alacak: 0, aciklama: '' },
    { sira_no: 2, hesap_kodu: '', borc: 0, alacak: 0, aciklama: '' }
  ]);

  const [loading, setLoading] = useState(false);

  const totalBorc = satirlar.reduce((sum, s) => sum + Number(s.borc || 0), 0);
  const totalAlacak = satirlar.reduce((sum, s) => sum + Number(s.alacak || 0), 0);
  const isBalanced = Math.abs(totalBorc - totalAlacak) < 0.01 && totalBorc > 0;

  const handleSave = async () => {
    if (!isBalanced) return;
    try {
      setLoading(true);
      await accountingAPI.createJournalEntry(fis, satirlar);
      onSave();
      onClose();
    } catch (err: any) {
      alert(err.message || 'Fiş kaydedilemedi');
    } finally {
      setLoading(false);
    }
  };

  const addSatir = () => {
    setSatirlar([...satirlar, {
      sira_no: satirlar.length + 1,
      hesap_kodu: '',
      borc: 0,
      alacak: 0,
      aciklama: ''
    }]);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
          <h2 className="text-xl font-bold text-gray-800">Yeni Yevmiye Fişi</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-auto p-6 space-y-6">
          {/* Fiş Bilgileri */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Fiş No</label>
              <input
                type="text"
                value={fis.fis_no}
                onChange={e => setFis({ ...fis, fis_no: e.target.value })}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Tarih</label>
              <input
                type="date"
                value={fis.fis_tarihi}
                onChange={e => setFis({ ...fis, fis_tarihi: e.target.value })}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Fiş Tipi</label>
              <select
                value={fis.fis_tipi}
                onChange={e => setFis({ ...fis, fis_tipi: e.target.value as any })}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                <option value="ISLEM">İşlem</option>
                <option value="MAHSUP">Mahsup</option>
                <option value="ACILIS">Açılış</option>
                <option value="KAPANIŞ">Kapanış</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Açıklama</label>
              <input
                type="text"
                value={fis.aciklama}
                onChange={e => setFis({ ...fis, aciklama: e.target.value })}
                placeholder="Genel açıklama..."
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Satırlar */}
          <div className="border border-gray-100 rounded-xl overflow-hidden shadow-sm">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-[10px] font-bold text-gray-400 uppercase">Hesap</th>
                  <th className="px-4 py-2 text-left text-[10px] font-bold text-gray-400 uppercase">Satır Açıklama</th>
                  <th className="px-4 py-2 text-right text-[10px] font-bold text-gray-400 uppercase w-32">Borç</th>
                  <th className="px-4 py-2 text-right text-[10px] font-bold text-gray-400 uppercase w-32">Alacak</th>
                  <th className="px-4 py-2 w-10"></th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {satirlar.map((satir, idx) => (
                  <tr key={idx} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2">
                      <select
                        value={satir.hesap_kodu}
                        onChange={e => {
                          const newSatirlar = [...satirlar];
                          newSatirlar[idx].hesap_kodu = e.target.value;
                          setSatirlar(newSatirlar);
                        }}
                        className="w-full px-2 py-1.5 border border-transparent hover:border-gray-200 focus:border-blue-500 bg-transparent rounded-md text-sm outline-none transition-all"
                      >
                        <option value="">Hesap Seçin...</option>
                        {accounts.map(acc => (
                          <option key={acc.id} value={acc.hesap_kodu}>
                            {acc.hesap_kodu} - {acc.hesap_adi}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="text"
                        value={satir.aciklama}
                        onChange={e => {
                          const newSatirlar = [...satirlar];
                          newSatirlar[idx].aciklama = e.target.value;
                          setSatirlar(newSatirlar);
                        }}
                        className="w-full px-2 py-1.5 border border-transparent hover:border-gray-200 focus:border-blue-500 bg-transparent rounded-md text-sm outline-none transition-all"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        value={satir.borc}
                        onChange={e => {
                          const newSatirlar = [...satirlar];
                          newSatirlar[idx].borc = Number(e.target.value);
                          if (newSatirlar[idx].borc > 0) newSatirlar[idx].alacak = 0;
                          setSatirlar(newSatirlar);
                        }}
                        className="w-full px-2 py-1.5 border border-transparent hover:border-gray-200 focus:border-blue-500 bg-transparent text-right font-semibold rounded-md text-sm outline-none transition-all"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        value={satir.alacak}
                        onChange={e => {
                          const newSatirlar = [...satirlar];
                          newSatirlar[idx].alacak = Number(e.target.value);
                          if (newSatirlar[idx].alacak > 0) newSatirlar[idx].borc = 0;
                          setSatirlar(newSatirlar);
                        }}
                        className="w-full px-2 py-1.5 border border-transparent hover:border-gray-200 focus:border-blue-500 bg-transparent text-right font-semibold rounded-md text-sm outline-none transition-all"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <button
                        onClick={() => setSatirlar(satirlar.filter((_, i) => i !== idx))}
                        className="p-1 text-red-300 hover:text-red-600 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50/80 font-bold">
                <tr>
                  <td colSpan={2} className="px-4 py-3 text-right text-gray-500 text-xs uppercase">Toplam</td>
                  <td className="px-4 py-3 text-right text-sm text-gray-900 border-l border-gray-200">
                    {totalBorc.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-gray-900 border-l border-gray-200">
                    {totalAlacak.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>

          <button
            onClick={addSatir}
            className="text-blue-600 text-sm font-semibold hover:text-blue-700 flex items-center gap-1 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Yeni Satır Ekle
          </button>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {!isBalanced && totalBorc > 0 && (
              <div className="flex items-center gap-1.5 text-xs font-medium text-amber-600 bg-amber-50 px-3 py-1.5 rounded-full">
                <AlertCircle className="w-4 h-4" />
                Fiş dengesi bozuk (Fark: {(totalBorc - totalAlacak).toFixed(2)})
              </div>
            )}
            {isBalanced && (
              <div className="flex items-center gap-1.5 text-xs font-medium text-green-600 bg-green-50 px-3 py-1.5 rounded-full">
                <AlertCircle className="w-4 h-4" />
                Fiş dengeli ve kaydedilmeye hazır
              </div>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-6 py-2 border border-gray-300 rounded-xl text-gray-700 font-medium hover:bg-gray-100 transition-colors text-sm"
            >
              Vazgeç
            </button>
            <button
              onClick={handleSave}
              disabled={!isBalanced || loading}
              className="px-8 py-2 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-200 transition-all text-sm flex items-center gap-2"
            >
              {loading ? 'Kaydediliyor...' : (
                <>
                  <Save className="w-4 h-4" />
                  Fişi Kaydet
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


