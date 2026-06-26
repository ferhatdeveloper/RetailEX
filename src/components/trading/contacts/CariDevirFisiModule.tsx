import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowRightLeft,
  RefreshCw,
  Save,
  Search,
  Users,
  Truck,
  AlertCircle,
  FileText,
} from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useFirmaDonem } from '../../../contexts/FirmaDonemContext';
import { supplierAPI } from '../../../services/api/suppliers';
import type { Supplier } from '../../../services/api/suppliers';
import { createCariDevirBatch, type CariDevirDirection } from '../../../services/api/cariOpeningBalance';
import { formatNumber } from '../../../utils/formatNumber';
import { repairCariLedgerConsistency } from '../../../services/api/accountLedgerRepair';

type RowDraft = {
  account: Supplier;
  amount: string;
  direction: CariDevirDirection;
  selected: boolean;
};

export function CariDevirFisiModule() {
  const { tm } = useLanguage();
  const { selectedFirm } = useFirmaDonem();
  const mainCurrency = useMemo(
    () => String(selectedFirm?.ana_para_birimi || 'IQD').trim().toUpperCase().slice(0, 10) || 'IQD',
    [selectedFirm?.ana_para_birimi],
  );

  const [accounts, setAccounts] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'customer' | 'supplier'>('all');
  const [devirDate, setDevirDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [batchNotes, setBatchNotes] = useState('Eski program cari devir bakiyesi');
  const [replaceExisting, setReplaceExisting] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    try {
      await repairCariLedgerConsistency().catch(() => undefined);
      const rows = await supplierAPI.getAll();
      setAccounts(rows);
      setDrafts((prev) => {
        const next: Record<string, RowDraft> = { ...prev };
        for (const acc of rows) {
          if (!next[acc.id]) {
            next[acc.id] = {
              account: acc,
              amount: '',
              direction: 'borc',
              selected: false,
            };
          } else {
            next[acc.id] = { ...next[acc.id], account: acc };
          }
        }
        return next;
      });
    } catch (e: any) {
      toast.error(e?.message || 'Cari hesaplar yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLocaleLowerCase('tr-TR');
    return accounts.filter((a) => {
      if (typeFilter === 'customer' && a.cardType !== 'customer') return false;
      if (typeFilter === 'supplier' && a.cardType !== 'supplier') return false;
      if (!q) return true;
      return (
        (a.name || '').toLocaleLowerCase('tr-TR').includes(q) ||
        (a.code || '').toLocaleLowerCase('tr-TR').includes(q)
      );
    });
  }, [accounts, searchQuery, typeFilter]);

  const selectedCount = useMemo(
    () => filteredRows.filter((a) => drafts[a.id]?.selected && parseFloat(drafts[a.id]?.amount || '0') > 0).length,
    [filteredRows, drafts],
  );

  const updateDraft = (id: string, patch: Partial<RowDraft>) => {
    setDrafts((prev) => ({
      ...prev,
      [id]: { ...prev[id], ...patch },
    }));
  };

  const handleSave = async () => {
    const lines = Object.values(drafts)
      .filter((d) => d.selected && parseFloat(d.amount || '0') > 0)
      .map((d) => ({
        accountId: d.account.id,
        cardType: (d.account.cardType === 'supplier' ? 'supplier' : 'customer') as 'customer' | 'supplier',
        accountCode: d.account.code,
        accountName: d.account.name,
        amount: parseFloat(d.amount) || 0,
        direction: d.direction,
      }));

    if (lines.length === 0) {
      toast.error('En az bir cari için devir tutarı girin ve satırı işaretleyin');
      return;
    }

    setSaving(true);
    try {
      const result = await createCariDevirBatch({
        date: devirDate,
        batchNotes,
        replaceExisting,
        lines,
      });
      if (result.errors.length > 0) {
        toast.error(`${result.errors.length} satır kaydedilemedi`, {
          description: result.errors[0]?.message,
        });
      }
      if (result.created > 0) {
        toast.success(`${result.created} cari devir fişi oluşturuldu`);
        await loadAccounts();
        setDrafts((prev) => {
          const next = { ...prev };
          for (const id of Object.keys(next)) {
            next[id] = { ...next[id], amount: '', selected: false };
          }
          return next;
        });
      }
    } catch (e: any) {
      toast.error(e?.message || 'Devir fişleri kaydedilemedi');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-full min-h-0 flex flex-col bg-gray-50">
      <div className="bg-gradient-to-r from-indigo-700 to-blue-700 text-white px-4 py-3 flex-shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5" />
            <div>
              <h1 className="text-base font-bold">Cari Devir Fişi</h1>
              <p className="text-[11px] text-blue-100">
                Eski programdan geçiş — müşteri/tedarikçi açılış borç ve alacak bakiyeleri
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void loadAccounts()}
              className="flex items-center gap-1 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-xs rounded-lg"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              {tm('refreshData')}
            </button>
            <button
              type="button"
              disabled={saving || selectedCount === 0}
              onClick={() => void handleSave()}
              className="flex items-center gap-1 px-4 py-1.5 bg-white text-indigo-800 hover:bg-blue-50 text-xs font-bold rounded-lg disabled:opacity-40"
            >
              <Save className="w-3.5 h-3.5" />
              Devir Kaydet ({selectedCount})
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto p-4 space-y-4">
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-2 text-sm text-amber-900">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Nasıl kullanılır?</p>
            <ul className="mt-1 list-disc list-inside text-xs space-y-0.5 opacity-90">
              <li><strong>Borç:</strong> Müşteri size borçlu veya siz tedarikçiye borçlusunuz (eski program bakiyesi).</li>
              <li><strong>Alacak:</strong> Müşterinin avans/alacağı veya tedarikçinin size borcu.</li>
              <li>Kasa tahsilatı değildir; cari ekstrede &quot;Devir&quot; satırı olarak görünür, kasa bakiyesini etkilemez.</li>
            </ul>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Devir Tarihi</label>
            <input
              type="date"
              value={devirDate}
              onChange={(e) => setDevirDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Açıklama</label>
            <input
              type="text"
              value={batchNotes}
              onChange={(e) => setBatchNotes(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="Eski program devri"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 md:col-span-3">
            <input
              type="checkbox"
              checked={replaceExisting}
              onChange={(e) => setReplaceExisting(e.target.checked)}
              className="rounded"
            />
            Aynı cari için önceki devir fişlerini iptal et ve yeni tutarla değiştir
          </label>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-3 flex flex-wrap gap-2 items-center">
          <div className="flex gap-1">
            {(
              [
                { key: 'all' as const, label: tm('all') },
                { key: 'customer' as const, label: tm('customer') },
                { key: 'supplier' as const, label: tm('supplierLabel') },
              ] as const
            ).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setTypeFilter(tab.key)}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase ${
                  typeFilter === tab.key ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={tm('searchCurrentAccountPlaceholder')}
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          {loading ? (
            <div className="py-16 flex items-center justify-center text-gray-500 gap-2">
              <RefreshCw className="w-5 h-5 animate-spin" />
              {tm('loadingData')}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200 text-[10px] uppercase text-gray-500">
                  <tr>
                    <th className="px-3 py-2 w-10" />
                    <th className="px-3 py-2 text-left">Kod</th>
                    <th className="px-3 py-2 text-left">Ünvan</th>
                    <th className="px-3 py-2 text-left">Tip</th>
                    <th className="px-3 py-2 text-right">Mevcut Bakiye</th>
                    <th className="px-3 py-2 text-left">Yön</th>
                    <th className="px-3 py-2 text-right">Devir Tutarı</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((acc) => {
                    const draft = drafts[acc.id] || {
                      account: acc,
                      amount: '',
                      direction: 'borc' as CariDevirDirection,
                      selected: false,
                    };
                    const bal = acc.balance || 0;
                    const isCustomer = acc.cardType === 'customer';
                    return (
                      <tr key={acc.id} className="border-b border-gray-100 hover:bg-gray-50/80">
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={draft.selected}
                            onChange={(e) => updateDraft(acc.id, { selected: e.target.checked })}
                          />
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-blue-600 font-bold">{acc.code || '—'}</td>
                        <td className="px-3 py-2 font-medium text-gray-900">{acc.name}</td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                            isCustomer ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'
                          }`}>
                            {isCustomer ? <Users className="w-3 h-3" /> : <Truck className="w-3 h-3" />}
                            {isCustomer ? tm('customer') : tm('supplierLabel')}
                          </span>
                        </td>
                        <td className={`px-3 py-2 text-right font-bold ${bal > 0 ? 'text-red-600' : bal < 0 ? 'text-emerald-600' : 'text-gray-400'}`}>
                          {formatNumber(Math.abs(bal), 2, true)} {mainCurrency}
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={draft.direction}
                            onChange={(e) => updateDraft(acc.id, { direction: e.target.value as CariDevirDirection })}
                            className="border border-gray-300 rounded px-2 py-1 text-xs"
                          >
                            <option value="borc">Borç (devir)</option>
                            <option value="alacak">Alacak</option>
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={draft.amount}
                            onChange={(e) => updateDraft(acc.id, { amount: e.target.value, selected: true })}
                            placeholder="0"
                            className="w-full max-w-[140px] ml-auto block border border-gray-300 rounded px-2 py-1 text-sm text-right"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filteredRows.length === 0 && (
                <div className="py-12 text-center text-gray-400 flex flex-col items-center gap-2">
                  <FileText className="w-8 h-8 opacity-40" />
                  {tm('noRecordFound')}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
