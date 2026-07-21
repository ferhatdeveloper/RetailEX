import { useEffect, useMemo, useState } from 'react';
import { Check, Database, FileText, Loader2, Printer, Save, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { useFirmaDonem } from '../../contexts/FirmaDonemContext';
import {
  PRINT_DESIGN_SCOPES,
  type PrintDesignBinding,
  type PrintDesignKind,
  type PrintDesignOption,
  type PrintDesignScope,
} from '../../core/types/printDesignBindings';
import {
  getBindings,
  listDesignCenterTemplates,
  listFastReportDesigns,
  saveBindings,
} from '../../services/printDesignBindingService';

type EditableBinding = Pick<PrintDesignBinding, 'scope' | 'designKind' | 'designId' | 'designName' | 'isActive'>;

const KIND_LABELS: Record<PrintDesignKind, string> = {
  fastreport_frx: 'FastReport .frx',
  design_center: 'Dizayn Merkezi',
  builtin: 'Yerleşik',
};

const KIND_BADGE: Record<PrintDesignKind, string> = {
  fastreport_frx: 'bg-amber-50 text-amber-700 border-amber-200',
  design_center: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  builtin: 'bg-slate-50 text-slate-600 border-slate-200',
};

function optionValue(kind: PrintDesignKind, id: string | null): string {
  return `${kind}::${id ?? ''}`;
}

function parseOptionValue(value: string): { kind: PrintDesignKind; id: string | null } {
  const [kindRaw, ...rest] = value.split('::');
  const kind = (kindRaw === 'fastreport_frx' || kindRaw === 'design_center' || kindRaw === 'builtin'
    ? kindRaw
    : 'builtin') as PrintDesignKind;
  const id = rest.join('::') || null;
  return { kind, id };
}

function emptyBinding(scope: PrintDesignScope): EditableBinding {
  return {
    scope,
    designKind: 'builtin',
    designId: null,
    designName: KIND_LABELS.builtin,
    isActive: true,
  };
}

export function PrintOptionsSettings() {
  const { selectedFirm } = useFirmaDonem();
  const firmNr = String(selectedFirm?.firm_nr || '001').trim().padStart(3, '0');
  const [rowsByScope, setRowsByScope] = useState<Record<string, EditableBinding>>({});
  const [fastReportOptions, setFastReportOptions] = useState<PrintDesignOption[]>([]);
  const [designCenterOptions, setDesignCenterOptions] = useState<PrintDesignOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingScope, setSavingScope] = useState<PrintDesignScope | null>(null);

  const groupedScopes = useMemo(() => {
    return PRINT_DESIGN_SCOPES.reduce<Record<string, typeof PRINT_DESIGN_SCOPES>>((acc, item) => {
      if (!acc[item.group]) acc[item.group] = [];
      acc[item.group].push(item);
      return acc;
    }, {});
  }, []);

  const allOptions = useMemo<PrintDesignOption[]>(() => {
    return [
      { id: '', name: 'Yerleşik yazdırma davranışı', designKind: 'builtin', sourceLabel: 'Mevcut RetailEX çıktısı' },
      ...fastReportOptions,
      ...designCenterOptions,
    ];
  }, [designCenterOptions, fastReportOptions]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [bindings, frx, designCenter] = await Promise.all([
          getBindings(firmNr),
          listFastReportDesigns(firmNr),
          listDesignCenterTemplates(),
        ]);
        if (cancelled) return;
        const next: Record<string, EditableBinding> = {};
        for (const scopeInfo of PRINT_DESIGN_SCOPES) next[scopeInfo.scope] = emptyBinding(scopeInfo.scope);
        for (const binding of bindings) {
          next[binding.scope] = {
            scope: binding.scope,
            designKind: binding.designKind,
            designId: binding.designId,
            designName: binding.designName,
            isActive: binding.isActive,
          };
        }
        setRowsByScope(next);
        setFastReportOptions(frx);
        setDesignCenterOptions(designCenter);
      } catch (error) {
        console.error('[PrintOptionsSettings] load failed:', error);
        toast.error('Yazdırma seçenekleri yüklenemedi. Migration 110 uygulanmış olmalı.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [firmNr]);

  const updateScopeSelection = (scope: PrintDesignScope, value: string) => {
    const parsed = parseOptionValue(value);
    const option = allOptions.find((item) => item.designKind === parsed.kind && item.id === (parsed.id ?? ''));
    setRowsByScope((prev) => ({
      ...prev,
      [scope]: {
        scope,
        designKind: parsed.kind,
        designId: parsed.kind === 'builtin' ? null : parsed.id,
        designName: option?.name ?? null,
        isActive: true,
      },
    }));
  };

  const saveScope = async (scope: PrintDesignScope) => {
    const row = rowsByScope[scope] ?? emptyBinding(scope);
    setSavingScope(scope);
    try {
      await saveBindings(firmNr, [row]);
      toast.success('Yazdırma eşleştirmesi kaydedildi.');
    } catch (error) {
      console.error('[PrintOptionsSettings] save failed:', error);
      toast.error('Yazdırma eşleştirmesi kaydedilemedi.');
    } finally {
      setSavingScope(null);
    }
  };

  return (
    <div className="min-h-full bg-slate-50 p-4 sm:p-6">
      <div className="mx-auto max-w-6xl space-y-5">
        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-blue-50 p-3 text-blue-600">
                  <Printer className="h-6 w-6" aria-hidden />
                </div>
                <div>
                  <h1 className="text-2xl font-black tracking-tight text-slate-900">Yazdırma Seçenekleri</h1>
                  <p className="mt-1 text-sm font-semibold text-slate-500">
                    Firma {firmNr} için hangi belgede hangi dizaynın kullanılacağını seçin.
                  </p>
                </div>
              </div>
              <p className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm leading-relaxed text-blue-900">
                FastReport WinForms tasarımcı: <span className="font-black">tools/FastReportDesigner</span> — .frx
                DB'ye kaydedilir; burada hangi belgede kullanılacağı seçilir.
              </p>
            </div>
            <div className="grid gap-2 text-sm text-slate-600 sm:grid-cols-2 lg:w-[28rem]">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <div className="mb-1 flex items-center gap-2 font-black text-slate-800">
                  <Wand2 className="h-4 w-4 text-indigo-500" aria-hidden />
                  Dizayn Merkezi
                </div>
                Fatura & Etiket Tasarımcısı sekmesinden JSON tasarımları düzenleyin.
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <div className="mb-1 flex items-center gap-2 font-black text-slate-800">
                  <Database className="h-4 w-4 text-amber-500" aria-hidden />
                  FastReport
                </div>
                `.frx` kayıtları `report_templates` içinde `fastreport_frx` tipiyle listelenir.
              </div>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center rounded-[28px] border border-slate-200 bg-white p-12 text-slate-500">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden />
            Yazdırma seçenekleri yükleniyor...
          </div>
        ) : (
          Object.entries(groupedScopes).map(([group, scopes]) => (
            <section key={group} className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-5 py-4">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-slate-500" aria-hidden />
                  <h2 className="text-lg font-black text-slate-900">{group}</h2>
                </div>
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-500">
                  {scopes.length} belge türü
                </span>
              </div>
              <div className="divide-y divide-slate-100">
                {scopes.map(({ scope, label }) => {
                  const row = rowsByScope[scope] ?? emptyBinding(scope);
                  const selected = optionValue(row.designKind, row.designId);
                  const saving = savingScope === scope;
                  return (
                    <div key={scope} className="grid gap-3 px-5 py-4 lg:grid-cols-[13rem_1fr_9rem_7rem] lg:items-center">
                      <div>
                        <div className="font-black text-slate-900">{label}</div>
                        <div className="text-xs font-semibold text-slate-400">{scope}</div>
                      </div>
                      <select
                        value={selected}
                        onChange={(event) => updateScopeSelection(scope, event.target.value)}
                        className="min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      >
                        {allOptions.map((option) => (
                          <option key={`${option.designKind}:${option.id}`} value={optionValue(option.designKind, option.id)}>
                            {KIND_LABELS[option.designKind]} — {option.name}
                          </option>
                        ))}
                      </select>
                      <span className={`inline-flex w-fit items-center rounded-full border px-3 py-1 text-xs font-black ${KIND_BADGE[row.designKind]}`}>
                        {KIND_LABELS[row.designKind]}
                      </span>
                      <button
                        type="button"
                        onClick={() => void saveScope(scope)}
                        disabled={saving}
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-2 text-sm font-black text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        Kaydet
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          ))
        )}

        <div className="flex items-start gap-3 rounded-[24px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <Check className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          Binding seçilmezse veya "Yerleşik" bırakılırsa mevcut RetailEX yazdırma akışı kullanılmaya devam eder.
        </div>
      </div>
    </div>
  );
}
