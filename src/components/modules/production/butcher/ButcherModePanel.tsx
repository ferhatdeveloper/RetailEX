/**
 * Kasap Modu Paneli — fire/maliyet analiz paneli
 * Hub içinde "Kasap" sekmesi aktifken üstte gösterilir.
 * Mevcut `butcherProductionService` + `previewButcherCost` korunur.
 */

import React, { useEffect, useState } from 'react';
import { AlertTriangle, Calculator, ChevronRight, Loader2, TrendingDown } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/utils';

import { unifiedProductionAPI } from '@/services/production/unifiedProductionAPI';
import type { ButcherOrder } from '@/services/production/types';

type Props = {
  refreshKey?: number;
};

type WasteRow = {
  animalType: string;
  recipeName: string;
  orderCount: number;
  inputKg: number;
  outputKg: number;
  wasteKg: number;
  avgWastePercent: number;
  totalInputCost: number;
};

export function ButcherModePanel({ refreshKey }: Props) {
  const [settings, setSettings] = useState<{
    defaultCostMethod: string;
    allowCompleteWithoutStock: boolean;
  } | null>(null);
  const [waste, setWaste] = useState<WasteRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [recent, setRecent] = useState<ButcherOrder[]>([]);

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      setLoading(true);
      try {
        const [s, wasteRows, orders] = await Promise.all([
          unifiedProductionAPI.butcher.getSettings(),
          unifiedProductionAPI.butcher.reportWasteAnalysis().catch(() => []),
          unifiedProductionAPI.butcher.getOrders(8),
        ]);
        if (!mounted) return;
        setSettings({
          defaultCostMethod: s.defaultCostMethod,
          allowCompleteWithoutStock: Boolean(s.allowCompleteWithoutStock),
        });
        setWaste(wasteRows as any);
        setRecent(orders);
      } catch (e) {
        console.error('[ButcherModePanel] load:', e);
        toast.error('Kasap paneli yüklenemedi');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    run();
    return () => {
      mounted = false;
    };
  }, [refreshKey]);

  const totalWasteKg = waste.reduce((s, w) => s + Number(w.wasteKg || 0), 0);
  const avgWaste =
    waste.length > 0
      ? waste.reduce((s, w) => s + Number(w.avgWastePercent || 0), 0) / waste.length
      : 0;

  return (
    <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-5">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-amber-100 rounded-lg shrink-0">
            <Calculator className="w-4 h-4 text-amber-700" />
          </div>
          <div>
            <h3 className="text-base font-bold text-amber-900">Kasap Modu</h3>
            <p className="text-[11px] text-amber-800/80 leading-relaxed mt-0.5">
              Hayvan türü, fire ve maliyet dağılımı için aktif ayarlar aşağıdadır.
              Tamamlanan fişlerdeki fire ve maliyetler otomatik hesaplanır.
            </p>
          </div>
        </div>
        {loading && (
          <div className="text-[11px] text-amber-700 flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" /> Yükleniyor
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Stat
          label="Maliyet Yöntemi"
          value={settings ? methodLabel(settings.defaultCostMethod) : '—'}
          icon={<Calculator className="w-4 h-4" />}
        />
        <Stat
          label="Yetersiz Stok İzni"
          value={settings?.allowCompleteWithoutStock ? 'AÇIK' : 'KAPALI'}
          accent={settings?.allowCompleteWithoutStock ? 'green' : 'slate'}
          icon={<AlertTriangle className="w-4 h-4" />}
        />
        <Stat
          label="Toplam Fire (kg)"
          value={totalWasteKg.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}
          icon={<TrendingDown className="w-4 h-4" />}
          accent="amber"
        />
        <Stat
          label="Ortalama Fire %"
          value={`%${avgWaste.toFixed(2)}`}
          icon={<TrendingDown className="w-4 h-4" />}
          accent="amber"
        />
      </div>

      {waste.length > 0 && (
        <div className="mt-4">
          <div className="text-[11px] font-bold text-amber-800 uppercase tracking-wider mb-2">
            Hayvan Türüne Göre Fire Özeti
          </div>
          <div className="bg-white border border-amber-100 rounded-xl overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-amber-50 text-amber-800 text-[10px] uppercase tracking-wider">
                <tr>
                  <th className="px-3 py-2">Hayvan</th>
                  <th className="px-3 py-2">Reçete</th>
                  <th className="px-3 py-2 text-right">Fiş</th>
                  <th className="px-3 py-2 text-right">Girdi (kg)</th>
                  <th className="px-3 py-2 text-right">Çıktı (kg)</th>
                  <th className="px-3 py-2 text-right">Fire %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-50">
                {waste.slice(0, 5).map((w, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2 font-semibold capitalize">{animalLabel(w.animalType)}</td>
                    <td className="px-3 py-2 text-slate-700">{w.recipeName}</td>
                    <td className="px-3 py-2 text-right">{w.orderCount}</td>
                    <td className="px-3 py-2 text-right">
                      {w.inputKg.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {w.outputKg.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-2 text-right font-bold text-amber-700">
                      %{Number(w.avgWastePercent).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {recent.length > 0 && (
        <div className="mt-4">
          <div className="text-[11px] font-bold text-amber-800 uppercase tracking-wider mb-2">
            Son Kasap Fişleri
          </div>
          <div className="space-y-1.5">
            {recent.slice(0, 4).map((o) => (
              <div
                key={o.id}
                className="bg-white border border-amber-100 rounded-lg px-3 py-2 flex justify-between items-center"
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono text-[11px] font-semibold text-slate-800">{o.orderNo}</span>
                  <span className="text-[11px] text-slate-500">
                    {o.inputProductName} · {o.inputQtyKg} kg
                  </span>
                </div>
                <div className="flex items-center gap-3 text-[10px]">
                  <span
                    className={cn(
                      'px-1.5 py-0.5 rounded font-bold uppercase',
                      o.status === 'completed'
                        ? 'bg-green-100 text-green-700'
                        : o.status === 'open'
                          ? 'bg-blue-100 text-blue-700'
                          : o.status === 'draft'
                            ? 'bg-slate-100 text-slate-600'
                            : 'bg-red-100 text-red-700',
                    )}
                  >
                    {o.status}
                  </span>
                  <span className="text-slate-400 font-mono">
                    {Number(o.outputQtyKg).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} kg çıktı
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  icon,
  accent = 'slate',
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  accent?: 'slate' | 'green' | 'amber';
}) {
  const accentClass =
    accent === 'green'
      ? 'text-green-700 bg-green-50 border-green-100'
      : accent === 'amber'
        ? 'text-amber-800 bg-amber-50 border-amber-100'
        : 'text-slate-700 bg-slate-50 border-slate-100';

  return (
    <div className="bg-white border border-amber-100 rounded-xl p-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{label}</span>
        <div className={cn('p-1 rounded-md border', accentClass)}>{icon}</div>
      </div>
      <div className={cn('text-base font-bold', accent === 'green' && 'text-green-800', accent === 'amber' && 'text-amber-900')}>
        {value}
      </div>
    </div>
  );
}

function methodLabel(m: string): string {
  if (m === 'by_weight') return 'Ağırlığa göre';
  if (m === 'by_sale_price') return 'Satış fiyatına göre';
  if (m === 'by_coefficient') return 'Katsayıya göre';
  if (m === 'manual') return 'Manuel';
  return m;
}

function animalLabel(a: string): string {
  if (a === 'cattle') return 'Sığır';
  if (a === 'sheep') return 'Koyun';
  if (a === 'goat') return 'Keçi';
  return 'Diğer';
}