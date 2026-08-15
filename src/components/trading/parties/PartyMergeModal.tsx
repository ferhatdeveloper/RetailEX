/**
 * PartyMergeModal — İki cari kartı birleştirme (kaynak → hedef).
 *
 * Adımlar:
 *  1) Kaynak seç (silinecek / arşivlenecek)
 *  2) Hedef seç (kalacak kart)
 *  3) Önizleme (etkilenen satır sayıları, uyarılar)
 *  4) Not (opsiyonel) + onay → execute
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useNestedT } from './useNestedT';
import { partyAPI, type Party } from '../../../services/api/parties';
import {
  executeMerge,
  previewMerge,
  type MergeExecuteOptions,
  type MergeExecuteResult,
  type MergePreview,
} from '../../../services/api/partyMerge';
import {
  PercentBodyModal,
  PercentBodyModalScrollBody,
} from '../../shared/PercentBodyModal';
import { toast } from 'sonner';
import {
  ArrowRight,
  Archive,
  CheckCircle2,
  Loader2,
  Search,
  XCircle,
  AlertTriangle,
} from 'lucide-react';
import type { PartyCardType } from '../../../core/types/models';

interface PartyMergeModalProps {
  /** Modal açılışta önceden seçili kaynak (örn. satır üstünden gelindiğinde) */
  initialSource?: Party | null;
  /** Modal açılışta önceden seçili hedef */
  initialTarget?: Party | null;
  onClose: () => void;
  onSaved: (result: MergeExecuteResult) => void;
}

export function PartyMergeModal({
  initialSource,
  initialTarget,
  onClose,
  onSaved,
}: PartyMergeModalProps) {
  const t = useNestedT();
  const [sourceId, setSourceId] = useState<string | null>(initialSource?.id ?? null);
  const [targetId, setTargetId] = useState<string | null>(initialTarget?.id ?? null);
  const [sourceSearch, setSourceSearch] = useState('');
  const [targetSearch, setTargetSearch] = useState('');
  const [sourceList, setSourceList] = useState<Party[]>([]);
  const [targetList, setTargetList] = useState<Party[]>([]);
  const [loadingSource, setLoadingSource] = useState(false);
  const [loadingTarget, setLoadingTarget] = useState(false);
  const [preview, setPreview] = useState<MergePreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [notes, setNotes] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [step, setStep] = useState<'select' | 'preview' | 'done'>('select');

  // Kart tipi filtresi: source ile aynı tipte olmalı (best practice)
  const sourceParty = useMemo(
    () => sourceList.find((p) => p.id === sourceId) ?? initialSource ?? null,
    [sourceList, sourceId, initialSource]
  );
  const targetParty = useMemo(
    () => targetList.find((p) => p.id === targetId) ?? initialTarget ?? null,
    [targetList, targetId, initialTarget]
  );

  const loadSource = async () => {
    setLoadingSource(true);
    try {
      const filter: any = {};
      if (targetParty?.card_type) filter.cardType = targetParty.card_type;
      if (sourceSearch) filter.search = sourceSearch;
      const list = await partyAPI.getAll(filter);
      setSourceList(
        initialSource && !list.some((p) => p.id === initialSource.id)
          ? [initialSource, ...list]
          : list
      );
    } catch (err: any) {
      toast.error(err?.message || String(err));
    } finally {
      setLoadingSource(false);
    }
  };

  const loadTarget = async () => {
    setLoadingTarget(true);
    try {
      const filter: any = { isActive: true };
      if (sourceParty?.card_type) filter.cardType = sourceParty.card_type;
      if (targetSearch) filter.search = targetSearch;
      const list = await partyAPI.getAll(filter);
      setTargetList(
        initialTarget && !list.some((p) => p.id === initialTarget.id)
          ? [initialTarget, ...list]
          : list
      );
    } catch (err: any) {
      toast.error(err?.message || String(err));
    } finally {
      setLoadingTarget(false);
    }
  };

  useEffect(() => {
    if (step !== 'select') return;
    if (sourceSearch || sourceList.length === 0) {
      void loadSource();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceSearch, targetParty?.card_type, step]);

  useEffect(() => {
    if (step !== 'select') return;
    if (targetSearch || targetList.length === 0) {
      void loadTarget();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetSearch, sourceParty?.card_type, step]);

  const canPreview = sourceId && targetId && sourceId !== targetId;

  const handlePreview = async () => {
    if (!canPreview) return;
    setLoadingPreview(true);
    try {
      const p = await previewMerge(sourceId!, targetId!);
      setPreview(p);
      setStep('preview');
      setConfirmed(false);
    } catch (err: any) {
      toast.error(err?.message || String(err));
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleExecute = async () => {
    if (!preview || !confirmed) return;
    setExecuting(true);
    try {
      const opts: MergeExecuteOptions = { notes };
      const result = await executeMerge(sourceId!, targetId!, opts);
      setStep('done');
      toast.success(
        t('party.merge.success') || `Birleştirme tamamlandı. ${result.archivedSourceCode} arşivlendi.`
      );
      onSaved(result);
    } catch (err: any) {
      toast.error(err?.message || String(err));
    } finally {
      setExecuting(false);
    }
  };

  return (
    <PercentBodyModal onClose={onClose} size="wide" ariaLabel={t('party.merge.title')}>
      <div className="px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-blue-50 to-indigo-50 flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-base font-black text-slate-800 uppercase tracking-tight">
            {t('party.merge.title') || 'Cari Birleştirme (Merge)'}
          </h2>
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
            {t('party.merge.subtitle') || 'İki cari kartı tek hedef altında topla. Audit trail korunur.'}
          </p>
        </div>
      </div>

      <PercentBodyModalScrollBody className="p-6">
        {step === 'select' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <p className="lg:col-span-2 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
              Kaynak ve hedef kartı listedeki <span className="font-bold">checkbox</span> ile işaretleyin.
              Kaynak arşivlenir; hareketler hedefte toplanır.
            </p>
            <PartyPicker
              label={t('party.merge.source') || 'Kaynak (Arşivlenecek)'}
              icon={<Archive className="w-4 h-4 text-rose-600" />}
              partyType="source"
              selectedId={sourceId}
              selected={sourceParty}
              items={sourceList}
              loading={loadingSource}
              search={sourceSearch}
              onSearch={setSourceSearch}
              onSelect={(p) => {
                setSourceId(p.id);
                // Hedef listeyi kaynak tipine göre filtrele
                if (targetParty && targetParty.card_type !== p.card_type) {
                  setTargetId(null);
                }
              }}
            />
            <PartyPicker
              label={t('party.merge.target') || 'Hedef (Kalacak)'}
              icon={<CheckCircle2 className="w-4 h-4 text-emerald-600" />}
              partyType="target"
              selectedId={targetId}
              selected={targetParty}
              items={targetList}
              loading={loadingTarget}
              search={targetSearch}
              onSearch={setTargetSearch}
              onSelect={(p) => setTargetId(p.id)}
            />
          </div>
        )}

        {step === 'preview' && preview && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 items-stretch">
              <PartyCard party={preview.sourceParty} accent="rose" />
              <PartyCard party={preview.targetParty} accent="emerald" />
            </div>

            <div className="rounded-2xl border-2 border-amber-200 bg-amber-50 p-4">
              <div className="flex items-center gap-2 mb-2">
                <ArrowRight className="w-4 h-4 text-amber-700" />
                <p className="text-xs font-black uppercase text-amber-900 tracking-wider">
                  {t('party.merge.summary') || 'Etkilenen satır sayıları (tüm dönemler dahil)'}
                </p>
              </div>
              <ul className="grid grid-cols-2 gap-2 text-xs">
                <CountLine label="cash_lines (party_id)" value={preview.counts.cashLinesPartyOnly} />
                <CountLine label="account_movements (cari)" value={preview.counts.accountMovements} />
                <CountLine label="party_ledger_movements" value={preview.counts.partyLedgerMovements} />
                <CountLine label="partner_distribution_items" value={preview.counts.partnerDistributionItems} />
                <CountLine label="sales (customer_id)" value={preview.counts.sales} />
              </ul>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 text-xs">
              <p className="font-black uppercase text-slate-600 mb-2 tracking-wider">
                {t('party.merge.balanceAfter') || 'Birleştirme sonrası hedef bakiye'}
              </p>
              <div className="flex items-center gap-2 font-mono">
                <span className="text-slate-500">
                  {Number(preview.sourceParty.balance ?? 0).toFixed(2)} (kaynak)
                </span>
                <span className="text-slate-400">+</span>
                <span className="text-slate-500">
                  {Number(preview.targetParty.balance ?? 0).toFixed(2)} (hedef)
                </span>
                <span className="text-slate-400">=</span>
                <span
                  className={`font-black ${
                    preview.projectedTargetBalance >= 0 ? 'text-emerald-700' : 'text-rose-700'
                  }`}
                >
                  {Number(preview.projectedTargetBalance).toFixed(2)}
                </span>
              </div>
              {!preview.sameCardType && (
                <p className="mt-2 text-amber-700 text-[11px]">
                  {t('party.merge.balanceHint') ||
                    'Farklı kart tipleri birleştirildi — bakiye yine de toplanır. İşaret yönü kart tipine göre ayrı ele alınır.'}
                </p>
              )}
            </div>

            {preview.warnings.length > 0 && (
              <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-700" />
                  <p className="text-xs font-black uppercase text-amber-900 tracking-wider">
                    {t('party.merge.warnings') || 'Uyarılar'}
                  </p>
                </div>
                <ul className="space-y-1 text-xs text-amber-800 list-disc pl-5">
                  {preview.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <label className="block text-[11px] font-black uppercase tracking-wider text-slate-600 mb-1">
                {t('party.merge.notesLabel') || 'Not (opsiyonel, audit için)'}
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder={t('party.merge.notesPlaceholder') || 'Örn: Mükerrer kayıt, telefon numarası farklı'}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <label className="flex items-start gap-2 rounded-xl bg-rose-50 border border-rose-200 p-3 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-0.5"
              />
              <span className="text-xs text-rose-900 font-medium">
                {t('party.merge.confirmText') ||
                  'Kaynak kartın arşivleneceğini, tüm satırların hedef karta yönlendirileceğini ve bakiyelerin toplanacağını anlıyorum. Bu işlem geri alınabilir (unmerge) — eski kart pasif ama verileri korunur.'}
              </span>
            </label>
          </div>
        )}

        {step === 'done' && preview && (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
            <CheckCircle2 className="w-12 h-12 text-emerald-600" />
            <p className="text-base font-black text-emerald-700 uppercase tracking-tight">
              {t('party.merge.doneTitle') || 'Birleştirme tamamlandı'}
            </p>
            <p className="text-xs text-slate-500 max-w-md">
              {t('party.merge.doneText') ||
                `${preview.sourceParty.code || preview.sourceParty.name} → ${preview.targetParty.code || preview.targetParty.name} altında birleştirildi.`}
            </p>
          </div>
        )}
      </PercentBodyModalScrollBody>

      <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex flex-wrap gap-2 justify-between shrink-0">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 rounded-xl bg-white border border-slate-300 text-slate-700 text-sm font-bold hover:bg-slate-50"
        >
          {step === 'done' ? t('common.close') || 'Kapat' : t('common.cancel') || 'İptal'}
        </button>
        {step === 'select' && (
          <button
            type="button"
            onClick={handlePreview}
            disabled={!canPreview || loadingPreview}
            className="px-5 py-2 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 disabled:opacity-50 disabled:pointer-events-none flex items-center gap-2"
          >
            {loadingPreview && <Loader2 className="w-4 h-4 animate-spin" />}
            {t('party.merge.preview') || 'Önizleme'}
          </button>
        )}
        {step === 'preview' && (
          <button
            type="button"
            onClick={handleExecute}
            disabled={!confirmed || executing}
            className="px-5 py-2 rounded-xl bg-rose-600 text-white text-sm font-bold hover:bg-rose-700 disabled:opacity-50 disabled:pointer-events-none flex items-center gap-2"
          >
            {executing && <Loader2 className="w-4 h-4 animate-spin" />}
            {t('party.merge.execute') || 'Birleştirmeyi Onayla'}
          </button>
        )}
      </div>
    </PercentBodyModal>
  );
}

function PartyPicker({
  label,
  icon,
  selectedId,
  selected,
  items,
  loading,
  search,
  onSearch,
  onSelect,
  partyType,
}: {
  label: string;
  icon: React.ReactNode;
  selectedId: string | null;
  selected: Party | null;
  items: Party[];
  loading: boolean;
  search: string;
  onSearch: (v: string) => void;
  onSelect: (p: Party) => void;
  partyType: 'source' | 'target';
}) {
  return (
    <div
      className={`rounded-2xl border-2 ${
        partyType === 'source' ? 'border-rose-200' : 'border-emerald-200'
      } bg-white overflow-hidden flex flex-col`}
    >
      <div
        className={`px-4 py-3 border-b ${
          partyType === 'source' ? 'bg-rose-50 border-rose-100' : 'bg-emerald-50 border-emerald-100'
        }`}
      >
        <div className="flex items-center gap-2 mb-2">
          {icon}
          <p className="text-xs font-black uppercase tracking-wider text-slate-700">{label}</p>
        </div>
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Kod veya ad ile ara"
            className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>
      <div className="flex-1 min-h-[16rem] max-h-[24rem] overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-slate-400 gap-2 text-xs">
            <Loader2 className="w-4 h-4 animate-spin" />
            Yükleniyor...
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2 text-xs">
            <XCircle className="w-6 h-6" />
            Sonuç yok
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((p) => {
              const isSelected = p.id === selectedId;
              return (
                <li key={p.id}>
                  <label
                    className={`w-full text-left px-3 py-2 flex items-center gap-2 cursor-pointer ${
                      isSelected
                        ? partyType === 'source'
                          ? 'bg-rose-100'
                          : 'bg-emerald-100'
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onSelect(p)}
                      className="w-4 h-4 shrink-0 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      aria-label={`${p.code || ''} ${p.name}`}
                    />
                    <span className="font-mono text-[10px] text-slate-500">{p.code || '—'}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-xs font-medium truncate">{p.name}</span>
                      <span className="block text-[10px] text-slate-400 font-mono truncate">
                        {shortUuid(p.id)}
                      </span>
                    </span>
                    <PartyTypeBadge type={p.card_type} />
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {selected && (
        <div
          className={`px-4 py-2 border-t text-xs ${
            partyType === 'source'
              ? 'bg-rose-50 border-rose-100 text-rose-900'
              : 'bg-emerald-50 border-emerald-100 text-emerald-900'
          }`}
        >
          <span className="font-bold">{selected.name}</span>{' '}
          <span className="font-mono text-[10px] opacity-70">({selected.code || '—'})</span>{' '}
          <span className="opacity-60">— Bakiye {Number(selected.balance ?? 0).toFixed(2)}</span>
        </div>
      )}
    </div>
  );
}

function PartyCard({ party, accent }: { party: Party; accent: 'rose' | 'emerald' }) {
  return (
    <div
      className={`rounded-2xl border-2 ${
        accent === 'rose' ? 'border-rose-200 bg-rose-50/50' : 'border-emerald-200 bg-emerald-50/50'
      } p-4`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">
            {accent === 'rose' ? 'KAYNAK (Arşivlenecek)' : 'HEDEF (Kalacak)'}
          </p>
          <p className="text-sm font-black text-slate-800 truncate">{party.name}</p>
          <p className="text-[11px] text-slate-500 font-mono mt-0.5">
            {party.code || '—'} · {shortUuid(party.id)}
          </p>
        </div>
        <PartyTypeBadge type={party.card_type} />
      </div>
      <div className="mt-3 flex items-center justify-between text-xs">
        <span className="text-slate-500">Mevcut bakiye</span>
        <span
          className={`font-black font-mono ${
            (party.balance ?? 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'
          }`}
        >
          {Number(party.balance ?? 0).toFixed(2)}
        </span>
      </div>
    </div>
  );
}

function CountLine({ label, value }: { label: string; value: number }) {
  return (
    <li className="flex items-center justify-between bg-white rounded-lg border border-amber-100 px-3 py-2">
      <span className="text-slate-600">{label}</span>
      <span className={`font-black font-mono ${value > 0 ? 'text-rose-700' : 'text-slate-400'}`}>
        {value}
      </span>
    </li>
  );
}

function PartyTypeBadge({ type }: { type: PartyCardType }) {
  const map: Record<PartyCardType, { label: string; cls: string }> = {
    customer: { label: 'Müşteri', cls: 'bg-blue-100 text-blue-700' },
    supplier: { label: 'Tedarikçi', cls: 'bg-amber-100 text-amber-700' },
    employee: { label: 'Personel', cls: 'bg-emerald-100 text-emerald-700' },
    partner: { label: 'Ortak', cls: 'bg-purple-100 text-purple-700' },
  };
  const m = map[type] ?? { label: String(type || '—'), cls: 'bg-slate-100 text-slate-700' };
  return (
    <span className={`shrink-0 px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${m.cls}`}>
      {m.label}
    </span>
  );
}

/** UUID kısa format: ilk 8 + son 4. Örn. `8a3f6c5e-…-c4b2` */
export function shortUuid(id: string | null | undefined): string {
  if (!id) return '—';
  const clean = id.replace(/-/g, '');
  if (clean.length < 12) return id.slice(0, 8);
  return `${clean.slice(0, 8)}…${clean.slice(-4)}`;
}
