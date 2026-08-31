/**
 * HR / Personel Yönetimi — Backoffice alanı
 *
 * Sekmeler:
 *   1) Personel Listesi → public.staff (migration 137)
 *   2) PDKS / Puantaj → StaffAttendanceReport
 *   3) Maaş & Bordro → özet (ileride)
 *   4) Performans → özet (ileride)
 *
 * VIVA SOLAR `personel` + EXFIN/PDKS uyumlu.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  UserCog, Users, Banknote, Briefcase, Plus, Pencil, Power, Search,
  RefreshCw, Calendar, ClipboardList, Award, Loader2, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Select } from 'antd';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useFirmaDonem } from '../../contexts/FirmaDonemContext';
import { staffDbApi, type StaffRow, type StaffUpsertInput } from '../../services/staffManagementService';
import { StaffAttendanceReport } from '../reports/StaffAttendanceReport';
import { PercentBodyModal, PercentBodyModalScrollBody } from '../shared/PercentBodyModal';

type TabKey = 'list' | 'attendance' | 'payroll' | 'performance';

interface TabDef {
  key: TabKey;
  labelTr: string;
  icon: React.ComponentType<{ className?: string }>;
}

const TABS: TabDef[] = [
  { key: 'list',       labelTr: 'Personel Listesi', icon: Users },
  { key: 'attendance', labelTr: 'PDKS / Puantaj',   icon: ClipboardList },
  { key: 'payroll',    labelTr: 'Maaş & Bordro',    icon: Banknote },
  { key: 'performance', labelTr: 'Performans',      icon: Award },
];

const EMPLOYMENT_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'full_time', label: 'Tam Zamanlı' },
  { value: 'part_time', label: 'Yarı Zamanlı' },
  { value: 'contract',  label: 'Sözleşmeli' },
  { value: 'intern',    label: 'Stajyer' },
];

export function HRModule() {
  const { tm } = useLanguage();
  const { darkMode } = useTheme();
  const { selectedFirm } = useFirmaDonem();
  const [tab, setTab] = useState<TabKey>('list');

  const panel  = darkMode ? 'bg-gray-800 border-gray-700 text-gray-100' : 'bg-white border-gray-200 text-gray-900';
  const muted  = darkMode ? 'text-gray-400' : 'text-gray-500';
  const header = darkMode ? 'border-gray-700' : 'border-gray-200';

  return (
    <div className="h-full flex flex-col">
      {/* Üst şerit: başlık + sekmeler */}
      <div className={`bg-gradient-to-r from-cyan-600 to-cyan-700 text-white ${header} border-b`}>
        <div className="px-4 py-2 flex items-center gap-2">
          <UserCog className="w-4 h-4" />
          <h2 className="text-sm font-semibold">İnsan Kaynakları — HR</h2>
          <span className="ml-2 text-[10px] opacity-80 hidden sm:inline">
            Firm {String(selectedFirm?.firm_nr ?? '001')}
          </span>
        </div>
        <nav className="px-2 pb-1 flex flex-wrap gap-1" role="tablist" aria-label="HR modülü sekmeleri">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.key)}
                className={[
                  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-t-md text-[11px] font-semibold uppercase tracking-wide transition',
                  active
                    ? 'bg-white text-cyan-700 shadow-sm'
                    : 'bg-white/10 hover:bg-white/20 text-white',
                ].join(' ')}
              >
                <Icon className="w-3.5 h-3.5" />
                {tm(`hrTab${t.key}`) || t.labelTr}
              </button>
            );
          })}
        </nav>
      </div>

      <div className={`flex-1 min-h-0 overflow-auto ${darkMode ? 'bg-gray-900' : 'bg-slate-50'}`}>
        {tab === 'list' && <PersonelTab />}
        {tab === 'attendance' && (
          <div className="p-3">
            <div className={`rounded-lg border p-1 ${panel}`}>
              <StaffAttendanceReport />
            </div>
          </div>
        )}
        {tab === 'payroll' && <PlaceholderTab icon={Banknote} title="Maaş & Bordro" subtitle="Aylık bordro kapanışı ve özet raporlar — bir sonraki sprint." />}
        {tab === 'performance' && <PlaceholderTab icon={Award} title="Performans Değerlendirme" subtitle="Prim / hedef / KPI takibi — bir sonraki sprint." />}
      </div>
    </div>
  );
}

/* ---------------------- PERSONEL LİSTESİ ---------------------- */

function PersonelTab() {
  const { tm } = useLanguage();
  const { darkMode } = useTheme();
  const { selectedFirm } = useFirmaDonem();

  const [rows, setRows] = useState<StaffRow[]>([]);
  const [departments, setDepartments] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState<string | undefined>(undefined);
  const [editing, setEditing] = useState<StaffRow | null>(null);
  const [creating, setCreating] = useState(false);

  const reload = async () => {
    setLoading(true);
    try {
      const [list, deps] = await Promise.all([
        staffDbApi.listStaff({
          onlyActive: false,
          department: departmentFilter,
          search: search.trim() || undefined,
        }),
        staffDbApi.listDepartments(),
      ]);
      setRows(list);
      setDepartments(deps);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFirm?.firm_nr, departmentFilter]);

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('tr-TR');
    if (!term) return rows;
    return rows.filter((r) => {
      const hay = `${r.fullName} ${r.code ?? ''} ${r.department ?? ''} ${r.position ?? ''}`.toLocaleLowerCase('tr-TR');
      return hay.includes(term);
    });
  }, [rows, search]);

  const totals = useMemo(() => {
    const active = rows.filter((r) => r.isActive);
    const monthly = active.reduce((s, r) => s + r.baseSalary, 0);
    const deptSet = new Set(active.map((r) => r.department ?? '').filter(Boolean));
    return {
      total: rows.length,
      active: active.length,
      monthly,
      departments: deptSet.size,
    };
  }, [rows]);

  const panel  = darkMode ? 'bg-gray-800 border-gray-700 text-gray-100' : 'bg-white border-gray-200 text-gray-900';
  const muted  = darkMode ? 'text-gray-400' : 'text-gray-500';
  const cell   = darkMode ? 'bg-gray-700/40 hover:bg-gray-700' : 'bg-white hover:bg-slate-50';

  return (
    <div className="p-3 space-y-3">
      {/* Üst metrikler */}
      <div className={`grid grid-cols-2 md:grid-cols-4 gap-2`}>
        <MetricCard dark={darkMode} icon={Users}     color="text-blue-600"    label="Toplam Personel" value={String(totals.total)} />
        <MetricCard dark={darkMode} icon={UserCog}  color="text-emerald-600" label="Aktif Personel"  value={String(totals.active)} />
        <MetricCard dark={darkMode} icon={Banknote} color="text-amber-600"   label="Aylık Brüt Bordro" value={totals.monthly.toLocaleString('tr-TR')} />
        <MetricCard dark={darkMode} icon={Briefcase} color="text-purple-600" label="Departman" value={String(totals.departments)} />
      </div>

      {/* Filtre / aksiyon bar */}
      <div className={`rounded-lg border p-3 flex flex-wrap items-end gap-2 ${panel}`}>
        <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
          <span className={`text-[10px] font-semibold uppercase tracking-wider ${muted}`}>Ara</span>
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void reload(); }}
              placeholder="Ad, kod, pozisyon…"
              className={`pl-7 pr-3 py-2 w-full text-xs rounded-md border ${darkMode ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-slate-200'}`}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <span className={`text-[10px] font-semibold uppercase tracking-wider ${muted}`}>Departman</span>
          <Select
            allowClear
            value={departmentFilter}
            onChange={(v) => setDepartmentFilter(v as string | undefined)}
            style={{ minWidth: 180 }}
            options={departments.map((d) => ({ value: d.name, label: d.name }))}
            placeholder="Tümü"
          />
        </div>
        <button
          type="button"
          onClick={() => void reload()}
          disabled={loading}
          className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-md border ${darkMode ? 'border-gray-600 hover:bg-gray-700' : 'border-slate-300 hover:bg-slate-100'}`}
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Yenile
        </button>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-md bg-cyan-600 text-white hover:bg-cyan-700"
        >
          <Plus className="w-3.5 h-3.5" />
          Yeni Personel
        </button>
      </div>

      {/* Tablo */}
      <div className={`overflow-auto rounded-lg border max-h-[60vh] ${panel}`}>
        <table className="w-full text-xs" style={{ minWidth: 980 }}>
          <thead className={`sticky top-0 ${darkMode ? 'bg-gray-900/80 text-gray-300' : 'bg-slate-50 text-slate-600'}`}>
            <tr>
              <Th>No</Th>
              <Th>Ad Soyad</Th>
              <Th>Kod</Th>
              <Th>Departman</Th>
              <Th>Pozisyon</Th>
              <Th>Telefon</Th>
              <Th align="right">Aylık Maaş</Th>
              <Th>İşe Başlama</Th>
              <Th>Durum</Th>
              <Th align="right">İşlem</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && !loading && (
              <tr>
                <td colSpan={10} className={`px-3 py-6 text-center ${muted}`}>
                  Henüz personel kaydı yok. "Yeni Personel" ile ekleyin.
                </td>
              </tr>
            )}
            {filtered.map((r, i) => (
              <tr key={r.id} className={`border-t ${cell} ${darkMode ? 'border-gray-700' : 'border-slate-100'}`}>
                <Td>{i + 1}</Td>
                <Td className="font-semibold">{r.fullName}</Td>
                <Td>{r.code ?? '—'}</Td>
                <Td>{r.department ?? '—'}</Td>
                <Td>{r.position ?? '—'}</Td>
                <Td>{r.phone ?? '—'}</Td>
                <Td align="right">{r.baseSalary.toLocaleString('tr-TR')}</Td>
                <Td>{r.hireDate ?? '—'}</Td>
                <Td>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${r.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                    {r.isActive ? 'Aktif' : 'Pasif'}
                  </span>
                </Td>
                <Td align="right">
                  <div className="inline-flex gap-1">
                    <button
                      type="button"
                      onClick={() => setEditing(r)}
                      className={`p-1.5 rounded ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-slate-100'}`}
                      title="Düzenle"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!confirm(`${r.fullName} pasifleştirilsin mi?`)) return;
                        const res = await staffDbApi.deleteStaff(r.id);
                        if (!res.ok) {
                          toast.error(res.error || 'Silinemedi');
                          return;
                        }
                        toast.success('Personel pasifleştirildi');
                        void reload();
                      }}
                      className={`p-1.5 rounded text-rose-600 ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-rose-50'}`}
                      title="Pasifleştir"
                    >
                      <Power className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(creating || editing) && (
        <StaffFormModal
          initial={editing ?? undefined}
          departments={departments}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            void reload();
          }}
        />
      )}
    </div>
  );
}

function MetricCard({
  dark, icon: Icon, color, label, value,
}: { dark: boolean; icon: React.ComponentType<{ className?: string }>; color: string; label: string; value: string }) {
  const bg = dark ? 'bg-gray-800 border-gray-700' : 'bg-white border-slate-200';
  const muted = dark ? 'text-gray-400' : 'text-slate-500';
  return (
    <div className={`rounded-lg border p-3 ${bg}`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`w-4 h-4 ${color}`} />
        <span className={`text-[10px] font-semibold uppercase tracking-wider ${muted}`}>{label}</span>
      </div>
      <div className="text-base font-bold">{value}</div>
    </div>
  );
}

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' | 'center' }) {
  return (
    <th className={`px-2 py-2 text-${align} text-[10px] font-semibold uppercase tracking-wider`}>
      {children}
    </th>
  );
}

function Td({ children, align = 'left', className = '' }: { children: React.ReactNode; align?: 'left' | 'right' | 'center'; className?: string }) {
  return <td className={`px-2 py-1.5 text-${align} text-[11px] ${className}`}>{children}</td>;
}

/* ---------------------- PERSONEL FORM ---------------------- */

function StaffFormModal({
  initial, departments, onClose, onSaved,
}: {
  initial?: StaffRow;
  departments: Array<{ id: string; code: string; name: string }>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { darkMode } = useTheme();
  const [form, setForm] = useState<StaffUpsertInput>({
    id: initial?.id,
    code: initial?.code ?? null,
    fullName: initial?.fullName ?? '',
    tcKimlik: initial?.tcKimlik ?? null,
    phone: initial?.phone ?? null,
    email: initial?.email ?? null,
    departmentId: initial?.departmentId ?? null,
    department: initial?.department ?? null,
    position: initial?.position ?? null,
    hireDate: initial?.hireDate ?? null,
    terminationDate: initial?.terminationDate ?? null,
    employmentType: initial?.employmentType ?? 'full_time',
    baseSalary: initial?.baseSalary ?? 0,
    hourlyRate: initial?.hourlyRate ?? 0,
    isActive: initial?.isActive ?? true,
    notes: initial?.notes ?? null,
  });
  const [saving, setSaving] = useState(false);

  const update = <K extends keyof StaffUpsertInput>(key: K, value: StaffUpsertInput[K]) =>
    setForm((p) => ({ ...p, [key]: value }));

  const submit = async () => {
    if (!form.fullName.trim()) {
      toast.error('Ad Soyad zorunlu');
      return;
    }
    setSaving(true);
    const res = await staffDbApi.upsertStaff(form);
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error || 'Kayıt başarısız');
      return;
    }
    toast.success(initial?.id ? 'Personel güncellendi' : 'Yeni personel eklendi');
    onSaved();
  };

  return (
    <PercentBodyModal onClose={onClose} size="wide" ariaLabel={initial?.id ? 'Personel Düzenle' : 'Yeni Personel'}>
      <div className={`px-6 py-4 border-b flex items-center justify-between ${darkMode ? 'bg-gray-900 border-gray-700' : 'bg-slate-50 border-slate-200'}`}>
        <div className="flex items-center gap-2">
          <UserCog className="w-4 h-4 text-cyan-600" />
          <h3 className="text-sm font-bold">{initial?.id ? 'Personel Düzenle' : 'Yeni Personel'}</h3>
        </div>
        <button onClick={onClose} className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-gray-700" aria-label="Kapat">
          <X className="w-4 h-4" />
        </button>
      </div>
      <PercentBodyModalScrollBody className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Ad Soyad *" required>
            <Input value={form.fullName ?? ''} onChange={(v) => update('fullName', v)} />
          </Field>
          <Field label="Personel Kodu">
            <Input value={form.code ?? ''} onChange={(v) => update('code', v || null)} />
          </Field>
          <Field label="TC Kimlik">
            <Input value={form.tcKimlik ?? ''} onChange={(v) => update('tcKimlik', v || null)} />
          </Field>
          <Field label="Telefon">
            <Input value={form.phone ?? ''} onChange={(v) => update('phone', v || null)} />
          </Field>
          <Field label="E-posta">
            <Input value={form.email ?? ''} onChange={(v) => update('email', v || null)} />
          </Field>
          <Field label="Departman">
            <Select
              showSearch
              value={form.department ?? undefined}
              onChange={(v) => update('department', v as string)}
              options={departments.map((d) => ({ value: d.name, label: d.name }))}
              placeholder="Seçin veya serbest yazın"
              style={{ width: '100%' }}
            />
          </Field>
          <Field label="Pozisyon">
            <Input value={form.position ?? ''} onChange={(v) => update('position', v || null)} />
          </Field>
          <Field label="Çalışma Tipi">
            <Select
              value={form.employmentType ?? 'full_time'}
              onChange={(v) => update('employmentType', v as string)}
              options={EMPLOYMENT_TYPE_OPTIONS}
              style={{ width: '100%' }}
            />
          </Field>
          <Field label="İşe Başlama">
            <Input type="date" value={form.hireDate ?? ''} onChange={(v) => update('hireDate', v || null)} />
          </Field>
          <Field label="Çıkış Tarihi">
            <Input type="date" value={form.terminationDate ?? ''} onChange={(v) => update('terminationDate', v || null)} />
          </Field>
          <Field label="Aylık Brüt Maaş">
            <Input type="number" value={String(form.baseSalary ?? 0)} onChange={(v) => update('baseSalary', Number(v) || 0)} />
          </Field>
          <Field label="Saat Ücreti">
            <Input type="number" value={String(form.hourlyRate ?? 0)} onChange={(v) => update('hourlyRate', Number(v) || 0)} />
          </Field>
          <Field label="Aktif">
            <Select
              value={form.isActive !== false ? 'active' : 'passive'}
              onChange={(v) => update('isActive', v === 'active')}
              options={[{ value: 'active', label: 'Aktif' }, { value: 'passive', label: 'Pasif' }]}
              style={{ width: '100%' }}
            />
          </Field>
          <Field label="Notlar" className="md:col-span-2">
            <textarea
              rows={3}
              value={form.notes ?? ''}
              onChange={(e) => update('notes', e.target.value || null)}
              className={`w-full text-xs rounded-md border px-3 py-2 ${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-slate-200'}`}
            />
          </Field>
        </div>
      </PercentBodyModalScrollBody>
      <div className={`px-6 py-4 border-t flex items-center justify-end gap-2 ${darkMode ? 'bg-gray-900 border-gray-700' : 'bg-slate-50 border-slate-200'}`}>
        <button
          type="button"
          onClick={onClose}
          className={`px-4 py-2 text-xs font-bold uppercase tracking-wide rounded-md border ${darkMode ? 'border-gray-600 hover:bg-gray-700' : 'border-slate-300 hover:bg-slate-100'}`}
        >
          İptal
        </button>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={saving}
          className="px-4 py-2 text-xs font-bold uppercase tracking-wide rounded-md bg-cyan-600 text-white hover:bg-cyan-700 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 inline animate-spin" /> : null}
          {initial?.id ? 'Güncelle' : 'Kaydet'}
        </button>
      </div>
    </PercentBodyModal>
  );
}

function Field({ label, children, required, className = '' }: { label: string; children: React.ReactNode; required?: boolean; className?: string }) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
        {label}{required && <span className="text-rose-500"> *</span>}
      </label>
      {children}
    </div>
  );
}

function Input({
  value, onChange, type = 'text', className = '',
}: { value: string; onChange: (v: string) => void; type?: string; className?: string }) {
  const { darkMode } = useTheme();
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full text-xs rounded-md border px-3 py-2 ${darkMode ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-slate-200'} ${className}`}
    />
  );
}

/* ---------------------- PLACEHOLDER ---------------------- */

function PlaceholderTab({
  icon: Icon, title, subtitle,
}: { icon: React.ComponentType<{ className?: string }>; title: string; subtitle: string }) {
  const { darkMode } = useTheme();
  return (
    <div className="p-6 flex flex-col items-center justify-center text-center min-h-[300px]">
      <div className={`p-4 rounded-full ${darkMode ? 'bg-gray-800' : 'bg-slate-100'} mb-3`}>
        <Icon className="w-8 h-8 text-cyan-600" />
      </div>
      <h3 className="text-lg font-bold mb-1">{title}</h3>
      <p className="text-sm text-slate-500 max-w-md">{subtitle}</p>
      <div className="mt-4 px-4 py-2 text-[11px] rounded bg-cyan-50 text-cyan-700 border border-cyan-200">
        Bu sekme bir sonraki sprint'te doldurulacak.
      </div>
    </div>
  );
}