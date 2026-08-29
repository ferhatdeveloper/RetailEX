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
  Pencil,
  Trash2,
  X,
} from 'lucide-react';
import { PercentBodyModal, PercentBodyModalScrollBody } from '../../shared/PercentBodyModal';
import { toast } from 'sonner';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useFirmaDonem } from '../../../contexts/FirmaDonemContext';
import { supplierAPI } from '../../../services/api/suppliers';
import type { Supplier } from '../../../services/api/suppliers';
import {
  cancelCariDevirRecord,
  cariDevirLedgerEquivalent,
  createCariDevirBatch,
  devirAmountFromNet,
  devirDirectionFromNet,
  getCariDevirMapByAccount,
  listCariDevirRecords,
  updateCariDevirRecord,
  type CariDevirDirection,
  type CariDevirRecord,
} from '../../../services/api/cariOpeningBalance';
import { formatNumber } from '../../../utils/formatNumber';
import {
  formatDecimalForTrInput,
  formatNumberInput,
  parseDecimalStringForInput,
} from '../../../utils/numberFormatter';
import { getCurrencyDecimalPlaces } from '../../../utils/currency';
import { repairCariLedgerConsistency } from '../../../services/api/accountLedgerRepair';

/** Devir tutarı DB DECIMAL(15,2); IQD gösterimde 0 hane olsa da açılış küsuratı girilebilir. */
function cariDevirAmountDecimals(currency: string): number {
  return Math.max(2, getCurrencyDecimalPlaces(currency));
}

function formatCariDevirAmountInput(raw: string, currency: string): string {
  return formatNumberInput(raw, cariDevirAmountDecimals(currency));
}

function parseCariDevirAmount(raw: string): number {
  const n = parseDecimalStringForInput(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 100) / 100;
}

type RowDraft = {
  account: Supplier;
  amount: string;
  direction: CariDevirDirection;
  selected: boolean;
  existingDevirId?: string;
  /** Kullanıcının seçtiği para birimi (boşsa ledger'a düşer) */
  currency?: string;
  /** Kullanıcının girdiği kur (boşsa 1) */
  currencyRate?: string;
};

type EditForm = {
  id: string;
  accountName: string;
  amount: string;
  direction: CariDevirDirection;
  date: string;
  notes: string;
  currency: string;
  currencyRate: string;
};

function normalizeCurrencyCode(raw: unknown, fallback = 'IQD'): string {
  const s = String(raw ?? '').trim().toUpperCase().slice(0, 10);
  return s || fallback;
}

function parseCariDevirRate(raw: string): number {
  const n = parseDecimalStringForInput(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  // Kur için 6 ondalık yeterli (DECIMAL(15,6) ile uyumlu)
  return Math.round(n * 1e6) / 1e6;
}

function formatCariDevirRateInput(raw: string): string {
  const n = parseDecimalStringForInput(raw);
  if (!Number.isFinite(n) || n <= 0) return '';
  // TR ondalık: 6 hane göster, sondaki sıfırları kırp
  return formatDecimalForTrInput(n, 6).replace(/0+$/g, '').replace(/,$/, '');
}

export function CariDevirFisiModule() {
  const { tm } = useLanguage();
  const { selectedFirm } = useFirmaDonem();
  const mainCurrency = useMemo(
    () => String(selectedFirm?.ana_para_birimi || 'IQD').trim().toUpperCase().slice(0, 10) || 'IQD',
    [selectedFirm?.ana_para_birimi],
  );
  const amountDecimals = useMemo(() => cariDevirAmountDecimals(mainCurrency), [mainCurrency]);

  /** Cari devirde kullanıcının seçebileceği para birimi kodları (ledger + yaygın). */
  const availableCurrencies = useMemo(() => {
    const set = new Set<string>([mainCurrency, 'TRY', 'USD', 'EUR', 'GBP', 'IQD', 'IRR', 'AED']);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [mainCurrency]);

  const [activeTab, setActiveTab] = useState<'entry' | 'records'>('entry');
  const [accounts, setAccounts] = useState<Supplier[]>([]);
  const [records, setRecords] = useState<CariDevirRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [recordsSearch, setRecordsSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'customer' | 'supplier'>('all');
  const [devirDate, setDevirDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [batchNotes, setBatchNotes] = useState('Eski program cari devir bakiyesi');
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  const buildDraftsFromAccounts = useCallback(
    (rows: Supplier[], devirMap: Map<string, CariDevirRecord>, prev?: Record<string, RowDraft>) => {
      const next: Record<string, RowDraft> = { ...(prev || {}) };
      for (const acc of rows) {
        const existing = devirMap.get(acc.id);
        const prevRow = prev?.[acc.id];
        // Geçmişe kayıt: existing varsa INSERT anındaki currency/rate'i geri yükle.
        // Kullanıcı yeni değer yazmadıysa prev'i tercih et; aksi halde DB'deki değer.
        const existingCurrency = normalizeCurrencyCode(existing?.currency, mainCurrency);
        const existingRateNum = Number(existing?.currency_rate ?? 1);
        const existingRateStr =
          existing && Number.isFinite(existingRateNum) && existingRateNum > 0
            ? formatCariDevirRateInput(String(existingRateNum))
            : '';
        if (existing) {
          const amt = devirAmountFromNet(existing.net_amount);
          next[acc.id] = {
            account: acc,
            amount: prevRow?.selected
              ? prevRow.amount
              : amt > 0
                ? formatDecimalForTrInput(amt, amountDecimals)
                : '',
            direction: prevRow?.selected ? prevRow.direction : devirDirectionFromNet(existing.net_amount),
            selected: prevRow?.selected ?? false,
            existingDevirId: existing.id,
            currency: prevRow?.currency || existingCurrency,
            currencyRate: prevRow?.currencyRate || existingRateStr,
          };
        } else if (!next[acc.id]) {
          next[acc.id] = {
            account: acc,
            amount: prevRow?.amount || '',
            direction: prevRow?.direction || 'borc',
            selected: prevRow?.selected ?? false,
            currency: prevRow?.currency || mainCurrency,
            currencyRate: prevRow?.currencyRate || '',
          };
        } else {
          next[acc.id] = {
            ...next[acc.id],
            account: acc,
            currency: next[acc.id].currency || mainCurrency,
          };
        }
      }
      return next;
    },
    [amountDecimals, mainCurrency],
  );

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    try {
      await repairCariLedgerConsistency().catch(() => undefined);
      const [rows, devirMap] = await Promise.all([supplierAPI.getAll(), getCariDevirMapByAccount()]);
      setAccounts(rows);
      setDrafts((prev) => buildDraftsFromAccounts(rows, devirMap, prev));
    } catch (e: any) {
      toast.error(e?.message || tm('accountsLoadError'));
    } finally {
      setLoading(false);
    }
  }, [buildDraftsFromAccounts]);

  const loadRecords = useCallback(async () => {
    setRecordsLoading(true);
    try {
      const list = await listCariDevirRecords();
      setRecords(list);
    } catch (e: any) {
      toast.error(e?.message || tm('openingRecordsLoadError'));
    } finally {
      setRecordsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  useEffect(() => {
    if (activeTab === 'records') void loadRecords();
  }, [activeTab, loadRecords]);

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

  const filteredRecords = useMemo(() => {
    const q = recordsSearch.trim().toLocaleLowerCase('tr-TR');
    if (!q) return records;
    return records.filter(
      (r) =>
        (r.customer_name || '').toLocaleLowerCase('tr-TR').includes(q) ||
        (r.fiche_no || '').toLocaleLowerCase('tr-TR').includes(q),
    );
  }, [records, recordsSearch]);

  const selectedCount = useMemo(
    () =>
      filteredRows.filter((a) => drafts[a.id]?.selected && parseCariDevirAmount(drafts[a.id]?.amount || '') > 0)
        .length,
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
      .filter((d) => d.selected && parseCariDevirAmount(d.amount || '') > 0)
      .map((d) => {
        const cur = normalizeCurrencyCode(d.currency, mainCurrency);
        const rate = parseCariDevirRate(d.currencyRate || '');
        if (cur !== mainCurrency && (!rate || rate <= 0)) {
          // Yabancı döviz seçildi ama kur 0 — sonradan kontrol altında toplayacağız
          return {
            _invalid: true as const,
            accountName: d.account?.name || '',
          };
        }
        return {
          accountId: d.account.id,
          cardType: (d.account.cardType === 'supplier' ? 'supplier' : 'customer') as 'customer' | 'supplier',
          accountCode: d.account.code,
          accountName: d.account.name,
          amount: parseCariDevirAmount(d.amount),
          direction: d.direction,
          existingDevirId: d.existingDevirId,
          currency: cur,
          currencyRate: rate > 0 ? rate : undefined,
        };
      });

    const invalid = lines.filter((l): l is { _invalid: true; accountName: string } => '_invalid' in l);
    if (invalid.length > 0) {
      toast.error(tm('openingRateRequired'));
      return;
    }
    const validLines = lines.filter((l): l is Exclude<typeof lines[number], { _invalid: true }> => !('_invalid' in l));

    if (validLines.length === 0) {
      toast.error(tm('minOneCariRequired'));
      return;
    }

    setSaving(true);
    try {
      const result = await createCariDevirBatch({
        date: devirDate,
        batchNotes,
        replaceExisting,
        ledgerCurrency: mainCurrency,
        lines: validLines,
      });
      if (result.errors.length > 0) {
        toast.error(`${result.errors.length} ${tm('rowsSaveFailed')}`, {
          description: result.errors[0]?.message,
        });
      }
      const parts: string[] = [];
      if (result.created > 0) parts.push(`${result.created} ${tm('batchCreatedCount')}`);
      if (result.updated > 0) parts.push(`${result.updated} ${tm('batchUpdatedCount')}`);
      if (result.replaced > 0) parts.push(`${result.replaced} ${tm('batchReplacedCount')}`);
      if (parts.length > 0) {
        toast.success(`${tm('openingBatchResultPrefix')}: ${parts.join(', ')}`);
        await loadAccounts();
        setDrafts((prev) => {
          const next = { ...prev };
          for (const id of Object.keys(next)) {
            if (next[id].selected) {
              next[id] = { ...next[id], selected: false };
            }
          }
          return next;
        });
      }
    } catch (e: any) {
      toast.error(e?.message || tm('openingSaveError'));
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (rec: CariDevirRecord) => {
    const amt = devirAmountFromNet(rec.net_amount);
    const cur = normalizeCurrencyCode(rec.currency, mainCurrency);
    const rateNum = Number(rec.currency_rate ?? 1);
    const rateStr =
      cur !== mainCurrency && Number.isFinite(rateNum) && rateNum > 0
        ? formatCariDevirRateInput(String(rateNum))
        : '';
    setEditForm({
      id: rec.id,
      accountName: rec.customer_name,
      amount: amt > 0 ? formatDecimalForTrInput(amt, cariDevirAmountDecimals(cur)) : '',
      direction: devirDirectionFromNet(rec.net_amount),
      date: rec.date ? rec.date.slice(0, 10) : new Date().toISOString().slice(0, 10),
      notes: rec.notes || '',
      currency: cur,
      currencyRate: rateStr,
    });
  };

  const handleEditSave = async () => {
    if (!editForm) return;
    const amount = parseCariDevirAmount(editForm.amount);
    if (amount <= 0) {
      toast.error(tm('validAmountRequired'));
      return;
    }
    const cur = normalizeCurrencyCode(editForm.currency, mainCurrency);
    const rateNum = cur === mainCurrency ? 0 : parseCariDevirRate(editForm.currencyRate);
    if (cur !== mainCurrency && (!rateNum || rateNum <= 0)) {
      toast.error(tm('openingRateRequired'));
      return;
    }
    setEditSaving(true);
    try {
      await updateCariDevirRecord(editForm.id, {
        amount,
        direction: editForm.direction,
        date: editForm.date,
        notes: editForm.notes || undefined,
        currency: cur,
        currencyRate: rateNum > 0 ? rateNum : undefined,
        ledgerCurrency: mainCurrency,
      });
      toast.success(tm('openingUpdated'));
      setEditForm(null);
      await Promise.all([loadRecords(), loadAccounts()]);
    } catch (e: any) {
      toast.error(e?.message || tm('updateFailed'));
    } finally {
      setEditSaving(false);
    }
  };

  const handleDelete = async (rec: CariDevirRecord) => {
    if (!confirm(`${rec.customer_name} ${tm('cancelOpeningConfirmCari')}`)) return;
    try {
      await cancelCariDevirRecord(rec.id);
      toast.success(tm('openingCancelled'));
      await Promise.all([loadRecords(), loadAccounts()]);
    } catch (e: any) {
      toast.error(e?.message || tm('cancelFailed'));
    }
  };

  return (
    <div className="h-full min-h-0 flex flex-col bg-gray-50">
      <div className="bg-gradient-to-r from-indigo-700 to-blue-700 text-white px-4 py-3 flex-shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5" />
            <div>
              <h1 className="text-base font-bold">{tm('cariOpeningTitle')}</h1>
              <p className="text-[11px] text-blue-100">
                {tm('cariOpeningSubtitle')}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => (activeTab === 'entry' ? void loadAccounts() : void loadRecords())}
              className="flex items-center gap-1 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-xs rounded-lg"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading || recordsLoading ? 'animate-spin' : ''}`} />
              {tm('refreshData')}
            </button>
            {activeTab === 'entry' && (
              <button
                type="button"
                disabled={saving || selectedCount === 0}
                onClick={() => void handleSave()}
                className="flex items-center gap-1 px-4 py-1.5 bg-white text-indigo-800 hover:bg-blue-50 text-xs font-bold rounded-lg disabled:opacity-40"
              >
                <Save className="w-3.5 h-3.5" />
                {tm('saveOpeningBalance')} ({selectedCount})
              </button>
            )}
          </div>
        </div>
        <div className="flex gap-1 mt-3">
          {(
            [
              { key: 'entry' as const, label: tm('tabEntryEdit') },
              { key: 'records' as const, label: tm('tabRegisteredRecords') },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase ${
                activeTab === tab.key ? 'bg-white text-indigo-800' : 'bg-white/15 text-white hover:bg-white/25'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto p-4 space-y-4">
        {activeTab === 'entry' ? (
          <>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-2 text-sm text-amber-900">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">{tm('howToUse')}</p>
                <ul className="mt-1 list-disc list-inside text-xs space-y-0.5 opacity-90">
                  <li>{tm('openingHelpDebtCari')}</li>
                  <li>{tm('openingHelpCreditCari')}</li>
                  <li>{tm('openingHelpPrefill')}</li>
                  <li>{tm('openingHelpReplaceMode')}</li>
                </ul>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">{tm('openingBalanceDate')}</label>
                <input
                  type="date"
                  value={devirDate}
                  onChange={(e) => setDevirDate(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">{tm('description')}</label>
                <input
                  type="text"
                  value={batchNotes}
                  onChange={(e) => setBatchNotes(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder={tm('openingBatchNotesPlaceholder')}
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700 md:col-span-3">
                <input
                  type="checkbox"
                  checked={replaceExisting}
                  onChange={(e) => setReplaceExisting(e.target.checked)}
                  className="rounded"
                />
                {tm('replaceExistingCari')}
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
                        <th className="px-3 py-2 text-left">{tm('code')}</th>
                        <th className="px-3 py-2 text-left">{tm('accountTitleLabel')}</th>
                        <th className="px-3 py-2 text-left">{tm('type')}</th>
                        <th className="px-3 py-2 text-right">{tm('currentBalance')}</th>
                        <th className="px-3 py-2 text-left">{tm('direction')}</th>
                        <th className="px-3 py-2 text-left">{tm('openingCurrency')}</th>
                        <th className="px-3 py-2 text-right">{tm('openingCurrencyRate')}</th>
                        <th className="px-3 py-2 text-right">{tm('openingAmount')}</th>
                        <th className="px-3 py-2 text-right">{tm('openingSystemEquivalent')}</th>
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
                            <td className="px-3 py-2 font-medium text-gray-900">
                              {acc.name}
                              {draft.existingDevirId && (
                                <span className="ml-2 text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700">
                                  {tm('registeredBadge')}
                                </span>
                              )}
                            </td>
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
                                onChange={(e) => updateDraft(acc.id, { direction: e.target.value as CariDevirDirection, selected: true })}
                                className="border border-gray-300 rounded px-2 py-1 text-xs"
                              >
                                <option value="borc">{tm('directionDebt')}</option>
                                <option value="alacak">{tm('directionCredit')}</option>
                              </select>
                            </td>
                            <td className="px-3 py-2">
                              <select
                                value={normalizeCurrencyCode(draft.currency, mainCurrency)}
                                onChange={(e) =>
                                  updateDraft(acc.id, {
                                    currency: e.target.value,
                                    selected: true,
                                  })
                                }
                                className="border border-gray-300 rounded px-2 py-1 text-xs"
                                title={tm('openingCurrency')}
                              >
                                {availableCurrencies.map((code) => (
                                  <option key={code} value={code}>
                                    {code}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="px-3 py-2">
                              {normalizeCurrencyCode(draft.currency, mainCurrency) === mainCurrency ? (
                                <span className="text-xs text-gray-400">—</span>
                              ) : (
                                <div className="flex items-center justify-end gap-1">
                                  <span className="text-[10px] text-gray-500 whitespace-nowrap">1 {normalizeCurrencyCode(draft.currency, mainCurrency)} =</span>
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    autoComplete="off"
                                    value={draft.currencyRate || ''}
                                    onChange={(e) =>
                                      updateDraft(acc.id, {
                                        currencyRate: formatDecimalForTrInput(
                                          parseDecimalStringForInput(e.target.value) || 0,
                                          6,
                                        ),
                                        selected: true,
                                      })
                                    }
                                    onBlur={() => {
                                      const n = parseCariDevirRate(draft.currencyRate || '');
                                      updateDraft(acc.id, {
                                        currencyRate: n > 0 ? formatCariDevirRateInput(String(n)) : '',
                                      });
                                    }}
                                    placeholder="1,00"
                                    className="w-20 border border-orange-300 rounded px-2 py-1 text-xs text-right font-medium"
                                    title={tm('openingCurrencyRate')}
                                  />
                                  <span className="text-[10px] text-gray-500">{mainCurrency}</span>
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="text"
                                inputMode="decimal"
                                autoComplete="off"
                                value={draft.amount}
                                onChange={(e) =>
                                  updateDraft(acc.id, {
                                    amount: formatCariDevirAmountInput(
                                      e.target.value,
                                      normalizeCurrencyCode(draft.currency, mainCurrency),
                                    ),
                                    selected: true,
                                  })
                                }
                                onBlur={() => {
                                  const n = parseCariDevirAmount(draft.amount);
                                  const cur = normalizeCurrencyCode(draft.currency, mainCurrency);
                                  updateDraft(acc.id, {
                                    amount:
                                      n > 0
                                        ? formatDecimalForTrInput(n, cariDevirAmountDecimals(cur))
                                        : draft.amount,
                                  });
                                }}
                                placeholder={amountDecimals > 0 ? '0,00' : '0'}
                                className="w-full max-w-[140px] ml-auto block border border-gray-300 rounded px-2 py-1 text-sm text-right"
                              />
                            </td>
                            <td className="px-3 py-2 text-right text-xs font-medium text-indigo-700">
                              {(() => {
                                const cur = normalizeCurrencyCode(draft.currency, mainCurrency);
                                const rateNum = parseCariDevirRate(draft.currencyRate || '');
                                const eq = cariDevirLedgerEquivalent(
                                  parseCariDevirAmount(draft.amount),
                                  cur,
                                  rateNum,
                                  mainCurrency,
                                );
                                if (!eq) return <span className="text-gray-400">—</span>;
                                return (
                                  <span className="font-mono tabular-nums">
                                    {formatNumber(eq, cariDevirAmountDecimals(mainCurrency), true)}{' '}
                                    <span className="text-[10px] text-gray-500">{mainCurrency}</span>
                                  </span>
                                );
                              })()}
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
          </>
        ) : (
          <>
            <div className="bg-white border border-gray-200 rounded-lg p-3 flex gap-2 items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={recordsSearch}
                  onChange={(e) => setRecordsSearch(e.target.value)}
                  placeholder={tm('searchCariOrSlip')}
                  className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              {recordsLoading ? (
                <div className="py-16 flex items-center justify-center text-gray-500 gap-2">
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  {tm('loadingData')}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200 text-[10px] uppercase text-gray-500">
                      <tr>
                        <th className="px-3 py-2 text-left">{tm('slipNo')}</th>
                        <th className="px-3 py-2 text-left">{tm('date')}</th>
                        <th className="px-3 py-2 text-left">{tm('currentAccountTitle')}</th>
                        <th className="px-3 py-2 text-left">{tm('direction')}</th>
                        <th className="px-3 py-2 text-left">{tm('openingCurrency')}</th>
                        <th className="px-3 py-2 text-right">{tm('openingCurrencyRate')}</th>
                        <th className="px-3 py-2 text-right">{tm('amountLabel')}</th>
                        <th className="px-3 py-2 text-right w-24">{tm('operation')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRecords.map((rec) => {
                        const dir = devirDirectionFromNet(rec.net_amount);
                        const amt = devirAmountFromNet(rec.net_amount);
                        const recCurrency = normalizeCurrencyCode(rec.currency, mainCurrency);
                        const recRate = Number(rec.currency_rate ?? 1);
                        return (
                          <tr key={rec.id} className="border-b border-gray-100 hover:bg-gray-50/80">
                            <td className="px-3 py-2 font-mono text-xs">{rec.fiche_no}</td>
                            <td className="px-3 py-2">{rec.date ? rec.date.slice(0, 10) : '—'}</td>
                            <td className="px-3 py-2 font-medium">{rec.customer_name}</td>
                            <td className="px-3 py-2">
                              <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${
                                dir === 'borc' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
                              }`}>
                                {dir === 'borc' ? tm('directionDebtShort') : tm('directionCreditShort')}
                              </span>
                            </td>
                            <td className="px-3 py-2 font-mono text-xs">
                              {recCurrency}
                              {recCurrency !== mainCurrency && (
                                <span className="ml-1 text-[9px] uppercase font-black px-1 py-0.5 rounded bg-amber-100 text-amber-700">
                                  {tm('openingHistoricalBadge')}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-xs">
                              {recCurrency === mainCurrency ? (
                                <span className="text-gray-400">1,00</span>
                              ) : (
                                <span title={`1 ${recCurrency} = ${recRate} ${mainCurrency}`}>
                                  {formatNumber(recRate, 4, true)}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right font-bold">
                              {formatNumber(amt, cariDevirAmountDecimals(recCurrency), true)} {recCurrency}
                              {recCurrency !== mainCurrency && (
                                <div className="text-[10px] text-indigo-700 mt-0.5">
                                  = {formatNumber(amt * (Number.isFinite(recRate) ? recRate : 1), cariDevirAmountDecimals(mainCurrency), true)} {mainCurrency}
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <div className="flex justify-end gap-1">
                                <button
                                  type="button"
                                  onClick={() => openEdit(rec)}
                                  className="p-1.5 rounded hover:bg-indigo-50 text-indigo-600"
                                  title={tm('edit')}
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleDelete(rec)}
                                  className="p-1.5 rounded hover:bg-red-50 text-red-600"
                                  title={tm('cancelAction')}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {filteredRecords.length === 0 && (
                    <div className="py-12 text-center text-gray-400 flex flex-col items-center gap-2">
                      <FileText className="w-8 h-8 opacity-40" />
                      {tm('noRegisteredOpeningCari')}
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {editForm && (
        <PercentBodyModal onClose={() => setEditForm(null)} size="compact" ariaLabel={tm('editOpeningSlip')}>
          <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-gradient-to-r from-indigo-600 to-blue-600 px-4 py-3 text-white">
            <h3 className="flex items-center gap-2 text-base font-semibold">
              <Pencil className="w-4 h-4" />
              {tm('editOpeningSlip')}
            </h3>
            <button
              type="button"
              onClick={() => setEditForm(null)}
              className="rounded p-1 text-white/80 transition hover:bg-white/10 hover:text-white"
              aria-label="close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <PercentBodyModalScrollBody className="p-5 space-y-3">
            <p className="text-sm text-gray-700 font-medium">{editForm.accountName}</p>
            <p className="text-xs text-slate-500">
              {tm('openingLedgerCurrencyNote').replace('{currency}', mainCurrency)}
            </p>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">{tm('date')}</label>
              <input
                type="date"
                value={editForm.date}
                onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">{tm('direction')}</label>
              <select
                value={editForm.direction}
                onChange={(e) => setEditForm({ ...editForm, direction: e.target.value as CariDevirDirection })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="borc">{tm('directionDebtShort')}</option>
                <option value="alacak">{tm('directionCreditShort')}</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">{tm('openingCurrency')}</label>
                <select
                  value={editForm.currency}
                  onChange={(e) => setEditForm({ ...editForm, currency: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                >
                  {availableCurrencies.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                  {tm('openingCurrencyRate')}
                </label>
                {editForm.currency === mainCurrency ? (
                  <div className="w-full border border-gray-200 bg-gray-50 text-gray-400 rounded-lg px-3 py-2 text-sm text-right">
                    1,00
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-gray-500 whitespace-nowrap">1 {editForm.currency} =</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      value={editForm.currencyRate}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          currencyRate: formatDecimalForTrInput(
                            parseDecimalStringForInput(e.target.value) || 0,
                            6,
                          ),
                        })
                      }
                      onBlur={() => {
                        const n = parseCariDevirRate(editForm.currencyRate);
                        setEditForm({
                          ...editForm,
                          currencyRate: n > 0 ? formatCariDevirRateInput(String(n)) : '',
                        });
                      }}
                      placeholder="1,00"
                      className="w-full border border-orange-300 rounded-lg px-3 py-2 text-sm text-right font-medium"
                    />
                  </div>
                )}
                {editForm.currency !== mainCurrency && editForm.currencyRate && (
                  <p className="mt-1 text-[10px] text-amber-700">
                    {tm('openingHistoricalBadge')} · {tm('openingRateHint')
                      .replace('{currency}', editForm.currency)
                      .replace('{rate}', editForm.currencyRate)
                      .replace('{ledger}', mainCurrency)}
                  </p>
                )}
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">{tm('amountLabel')}</label>
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={editForm.amount}
                onChange={(e) =>
                  setEditForm({
                    ...editForm,
                    amount: formatCariDevirAmountInput(e.target.value, editForm.currency),
                  })
                }
                onBlur={() => {
                  const n = parseCariDevirAmount(editForm.amount);
                  if (n > 0) {
                    setEditForm({
                      ...editForm,
                      amount: formatDecimalForTrInput(n, cariDevirAmountDecimals(editForm.currency)),
                    });
                  }
                }}
                placeholder={cariDevirAmountDecimals(editForm.currency) > 0 ? '0,00' : '0'}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-right"
              />
            </div>
            {(() => {
              const amt = parseCariDevirAmount(editForm.amount);
              const cur = normalizeCurrencyCode(editForm.currency, mainCurrency);
              const rate = parseCariDevirRate(editForm.currencyRate);
              const eq = cariDevirLedgerEquivalent(amt, cur, rate, mainCurrency);
              if (!eq) return null;
              return (
                <div className="rounded-lg border border-indigo-100 bg-indigo-50/60 px-3 py-2 text-xs text-indigo-900">
                  <span className="font-bold">{tm('openingSystemEquivalent')}:</span>{' '}
                  <span className="font-mono tabular-nums">
                    {formatNumber(eq, cariDevirAmountDecimals(mainCurrency), true)} {mainCurrency}
                  </span>
                </div>
              );
            })()}
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">{tm('description')}</label>
              <input
                type="text"
                value={editForm.notes}
                onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </PercentBodyModalScrollBody>
          <div className="flex shrink-0 justify-end gap-2 border-t border-slate-100 bg-slate-50 px-4 py-3">
            <button
              type="button"
              onClick={() => setEditForm(null)}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-bold uppercase tracking-wider text-slate-600 hover:bg-slate-100 active:scale-[0.98]"
            >
              {tm('giveUp')}
            </button>
            <button
              type="button"
              disabled={editSaving}
              onClick={() => void handleEditSave()}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold uppercase tracking-wider text-white shadow-lg shadow-blue-200/50 hover:bg-blue-700 disabled:opacity-50 active:scale-[0.98]"
            >
              {editSaving ? tm('saving') : tm('save')}
            </button>
          </div>
        </PercentBodyModal>
      )}
    </div>
  );
}
