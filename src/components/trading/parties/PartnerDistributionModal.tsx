import React, { useEffect, useMemo, useState } from 'react';
import { useNestedT } from './useNestedT';
import {
  PercentBodyModal,
  PercentBodyModalScrollBody,
} from '../../shared/PercentBodyModal';
import { ChevronDown, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  computeDistributionBaseAmount,
  executeDistribution,
  getDistributionHistory,
  previewDistribution,
} from '../../../services/api/partnerDistribution';
import { getPartnerSettings } from '../../../services/api/partnerSettings';
import { partnerAPI } from '../../../services/api/partiesPartners';
import { fetchKasalar, type Kasa } from '../../../services/api/kasa';
import type {
  PartyPartner,
  PartnerDistribution,
  PartnerDistributionBase,
  PartnerDistributionMode,
  PartnerDistributionPreview,
  PartnerSettings,
} from '../../../core/types/models';

export interface PartnerDistributionModalProps {
  onClose: () => void;
  onSaved: () => void;
}

const BASE_OPTIONS: { value: PartnerDistributionBase; labelKey: string; descKey: string }[] = [
  { value: 'net_profit', labelKey: 'party.distribution.base.netProfit', descKey: 'party.distribution.base.netProfitDesc' },
  { value: 'cash_net', labelKey: 'party.distribution.base.cashNet', descKey: 'party.distribution.base.cashNetDesc' },
  { value: 'manual', labelKey: 'party.distribution.base.manual', descKey: 'party.distribution.base.manualDesc' },
];

const TRIGGER_OPTIONS: { value: PartnerDistributionMode; labelKey: string }[] = [
  { value: 'manual', labelKey: 'party.distribution.trigger.manual' },
  { value: 'daily', labelKey: 'party.distribution.trigger.daily' },
  { value: 'period', labelKey: 'party.distribution.trigger.period' },
];

export function PartnerDistributionModal({ onClose, onSaved }: PartnerDistributionModalProps) {
  const t = useNestedT();
  const [settings, setSettings] = useState<PartnerSettings | null>(null);
  const [partners, setPartners] = useState<PartyPartner[]>([]);
  const [registers, setRegisters] = useState<Kasa[]>([]);
  const [baseType, setBaseType] = useState<PartnerDistributionBase>('manual');
  const [triggerType, setTriggerType] = useState<PartnerDistributionMode>('manual');
  const [manualAmount, setManualAmount] = useState('');
  const [computedAmount, setComputedAmount] = useState<number | null>(null);
  const [registerId, setRegisterId] = useState('');
  const [notes, setNotes] = useState('');
  const [preview, setPreview] = useState<PartnerDistributionPreview | null>(null);
  const [history, setHistory] = useState<PartnerDistribution[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [s, p, r] = await Promise.all([
          getPartnerSettings(),
          partnerAPI.getActive(),
          fetchKasalar({ aktif: true }),
        ]);
        setSettings(s);
        setPartners(p);
        setRegisters(r);
        setBaseType(s.distribution_base);
        setTriggerType(s.distribution_mode);
        if (r.length) setRegisterId(r[0].id);
        const h = await getDistributionHistory({ limit: 20 });
        setHistory(h);
      } catch (err: any) {
        setError(err?.message || String(err));
      }
    })();
  }, []);

  const baseAmount = useMemo(() => {
    if (baseType === 'manual') {
      const v = parseFloat(manualAmount);
      return Number.isFinite(v) ? v : 0;
    }
    return computedAmount ?? 0;
  }, [baseType, manualAmount, computedAmount]);

  useEffect(() => {
    if (baseType === 'manual') return;
    let active = true;
    (async () => {
      try {
        const v = await computeDistributionBaseAmount(baseType);
        if (active) setComputedAmount(v);
      } catch {
        if (active) setComputedAmount(0);
      }
    })();
    return () => { active = false; };
  }, [baseType]);

  useEffect(() => {
    if (baseAmount <= 0) { setPreview(null); return; }
    let active = true;
    (async () => {
      try {
        const p = await previewDistribution({ baseType, baseAmount, partners });
        if (active) setPreview(p);
      } catch (err: any) {
        if (active) { setError(err?.message || String(err)); setPreview(null); }
      }
    })();
    return () => { active = false; };
  }, [baseAmount, baseType, partners]);

  const handleExecute = async () => {
    if (!preview) return;
    if (!registerId) { setError(t('party.distribution.registerRequired')); return; }
    if (preview.warnings.length) { setError(preview.warnings.join(' ')); return; }
    setLoading(true);
    setError(null);
    try {
      await executeDistribution({
        baseType,
        baseAmount,
        triggerType,
        registerId,
        notes: notes || undefined,
      });
      toast.success(t('party.distribution.executeSuccess'));
      onSaved();
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  const totalAllocated = useMemo(() => {
    if (!preview) return 0;
    return preview.partners.reduce((s, p) => s + p.amount, 0);
  }, [preview]);

  return (
    <PercentBodyModal onClose={onClose} size="wide" ariaLabel={t('party.distribution.title')}>
      <div className="flex flex-col min-h-0 max-h-full">
        <div className="bg-gradient-to-r from-purple-600 to-indigo-600 px-8 py-6 text-white shrink-0 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">{t('party.distribution.title')}</h2>
            <p className="text-purple-100 text-sm mt-1">{t('party.distribution.subtitle')}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <PercentBodyModalScrollBody className="p-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div className="relative">
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                {t('party.distribution.baseType')}
              </label>
              <select
                value={baseType}
                onChange={(e) => setBaseType(e.target.value as PartnerDistributionBase)}
                className="w-full px-4 py-3 pr-11 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-purple-500 focus:border-purple-400 outline-none text-slate-800 font-medium appearance-none bg-white"
              >
                {BASE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{t(o.labelKey)}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-[42px] -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
              <p className="text-xs text-slate-500 mt-1">{t(BASE_OPTIONS.find((o) => o.value === baseType)?.descKey || '')}</p>
            </div>

            <div className="relative">
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                {t('party.distribution.triggerType')}
              </label>
              <select
                value={triggerType}
                onChange={(e) => setTriggerType(e.target.value as PartnerDistributionMode)}
                className="w-full px-4 py-3 pr-11 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-purple-500 focus:border-purple-400 outline-none text-slate-800 font-medium appearance-none bg-white"
              >
                {TRIGGER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{t(o.labelKey)}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-[42px] -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
            </div>

            {baseType === 'manual' ? (
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  {t('party.distribution.manualAmount')}
                </label>
                <input
                  type="number"
                  value={manualAmount}
                  onChange={(e) => setManualAmount(e.target.value)}
                  step="0.01"
                  className="w-full px-4 py-3 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-purple-500 focus:border-purple-400 outline-none text-slate-800 font-medium"
                />
              </div>
            ) : (
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  {t('party.distribution.computedAmount')}
                </div>
                <div className="text-2xl font-bold text-slate-800 font-mono">
                  {computedAmount == null ? '—' : formatMoney(computedAmount)}
                </div>
              </div>
            )}

            <div className="relative">
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                {t('party.distribution.register')}
              </label>
              <select
                value={registerId}
                onChange={(e) => setRegisterId(e.target.value)}
                className="w-full px-4 py-3 pr-11 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-purple-500 focus:border-purple-400 outline-none text-slate-800 font-medium appearance-none bg-white"
              >
                <option value="">{t('party.distribution.chooseRegister')}</option>
                {registers.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.kasa_adi} ({r.kasa_kodu})
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-[42px] -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                {t('party.distribution.notes')}
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-4 py-3 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-purple-500 focus:border-purple-400 outline-none text-slate-800 font-medium"
              />
            </div>
          </div>

          {preview && (
            <div className="border border-slate-200 rounded-2xl overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                  {t('party.distribution.previewTitle')}
                </span>
                <span className="text-xs text-slate-500">
                  {t('party.distribution.totalPct')}: <strong>{Number(preview.totalPct).toFixed(2)}%</strong>
                </span>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider">
                  <tr>
                    <th className="text-left px-4 py-2">{t('party.distribution.partner')}</th>
                    <th className="text-right px-4 py-2">{t('party.distribution.sharePct')}</th>
                    <th className="text-right px-4 py-2">{t('party.distribution.amount')}</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.partners.map((p) => (
                    <tr key={p.partner.id} className="border-t border-slate-100">
                      <td className="px-4 py-2 font-medium">{p.partner.name}</td>
                      <td className="px-4 py-2 text-right font-mono">{Number(p.sharePct).toFixed(2)}%</td>
                      <td className="px-4 py-2 text-right font-mono font-bold">{formatMoney(p.amount)}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-slate-200 bg-slate-50 font-bold">
                    <td className="px-4 py-2 text-right">{t('party.distribution.total')}</td>
                    <td className="px-4 py-2 text-right font-mono">{Number(preview.totalPct).toFixed(2)}%</td>
                    <td className="px-4 py-2 text-right font-mono">{formatMoney(totalAllocated)}</td>
                  </tr>
                </tbody>
              </table>
              {preview.warnings.length > 0 && (
                <div className="p-3 bg-amber-50 border-t border-amber-200 text-amber-800 text-xs">
                  {preview.warnings.map((w, i) => <div key={i}>⚠️ {w}</div>)}
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="mt-4 p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-sm">
              {error}
            </div>
          )}

          {history.length > 0 && (
            <div className="mt-6">
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                {t('party.distribution.history')}
              </div>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {history.map((h) => (
                  <div key={h.id} className="p-3 rounded-2xl bg-slate-50 border border-slate-200 text-sm flex items-center justify-between">
                    <div>
                      <div className="font-medium">{h.distribution_date} • {h.base_type}</div>
                      <div className="text-xs text-slate-500">{h.trigger_type} • {h.items?.length || 0} ortak</div>
                    </div>
                    <div className="font-mono font-bold">{formatMoney(h.base_amount)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </PercentBodyModalScrollBody>

        <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex gap-4 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-2xl border-2 border-slate-200 text-slate-600 font-bold uppercase text-sm tracking-wider py-3 hover:bg-slate-100 active:scale-[0.98] transition"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={handleExecute}
            disabled={loading || !preview || preview.warnings.length > 0}
            className="flex-1 rounded-2xl bg-purple-600 text-white font-bold uppercase text-sm tracking-wider py-3 shadow-lg shadow-purple-200/50 hover:bg-purple-700 disabled:opacity-50 active:scale-[0.98] transition flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {t('party.distribution.execute')}
          </button>
        </div>
      </div>
    </PercentBodyModal>
  );
}

function formatMoney(n: number | string | null | undefined): string {
  const num = Number(n);
  if (!Number.isFinite(num)) return '—';
  return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 }).format(num);
}
