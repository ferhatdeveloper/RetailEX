import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Beef, Plus, Trash2, Save, History, Layers, Scale, AlertTriangle, CheckCircle2, ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { useProductStore } from '@/store/useProductStore';
import { cn } from '@/components/ui/utils';
import { disassemblyAPI, type AnimalType, type DisassemblyOrder, type DisassemblyTemplate } from '@/services/api/disassemblyAPI';
import { DisassemblyService } from '@/services/disassemblyService';
import { previewDisassemblyCost, type DisassemblyOutputDraft } from '@/utils/disassemblyCost';

type OutputRow = DisassemblyOutputDraft & { key: string };

function fmtKg(n: number) {
    return `${n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 3 })} kg`;
}

function fmtMoney(n: number) {
    return n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function CarcassDisassemblyPanel() {
    const { products } = useProductStore();
    const [subTab, setSubTab] = useState<'new' | 'history' | 'templates'>('new');
    const [templates, setTemplates] = useState<DisassemblyTemplate[]>([]);
    const [orders, setOrders] = useState<DisassemblyOrder[]>([]);
    const [loading, setLoading] = useState(false);

    const loadMeta = useCallback(async () => {
        setLoading(true);
        try {
            const [t, o] = await Promise.all([
                disassemblyAPI.getTemplates(),
                disassemblyAPI.getOrders(30),
            ]);
            setTemplates(t);
            setOrders(o);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadMeta();
    }, [loadMeta]);

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
                {([
                    { id: 'new' as const, label: 'Yeni Parçalama', icon: Scale },
                    { id: 'history' as const, label: 'Geçmiş', icon: History },
                    { id: 'templates' as const, label: 'Parça Şablonları', icon: Layers },
                ]).map(({ id, label, icon: Icon }) => (
                    <button
                        key={id}
                        type="button"
                        onClick={() => setSubTab(id)}
                        className={cn(
                            'inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold border transition-colors',
                            subTab === id
                                ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                                : 'bg-white text-slate-600 border-slate-200 hover:border-amber-300',
                        )}
                    >
                        <Icon className="w-4 h-4" />
                        {label}
                    </button>
                ))}
                <Button variant="outline" size="sm" className="ml-auto h-9" onClick={() => void loadMeta()} disabled={loading}>
                    Yenile
                </Button>
            </div>

            {subTab === 'new' && (
                <NewDisassemblyForm
                    products={products}
                    templates={templates}
                    onCompleted={() => void loadMeta()}
                />
            )}
            {subTab === 'history' && <DisassemblyHistory orders={orders} />}
            {subTab === 'templates' && (
                <TemplateManager products={products} templates={templates} onSaved={() => void loadMeta()} />
            )}
        </div>
    );
}

function NewDisassemblyForm({
    products,
    templates,
    onCompleted,
}: {
    products: Array<{ id: string; name: string; code?: string; stock?: number; cost?: number; price?: number; unit?: string }>;
    templates: DisassemblyTemplate[];
    onCompleted: () => void;
}) {
    const [animalType, setAnimalType] = useState<AnimalType>('cattle');
    const [templateId, setTemplateId] = useState('');
    const [inputProductId, setInputProductId] = useState('');
    const [inputQtyKg, setInputQtyKg] = useState<number>(0);
    const [inputUnitCost, setInputUnitCost] = useState<number>(0);
    const [note, setNote] = useState('');
    const [outputs, setOutputs] = useState<OutputRow[]>([]);
    const [submitting, setSubmitting] = useState(false);

    const animalTemplates = useMemo(
        () => templates.filter((t) => t.animalType === animalType),
        [templates, animalType],
    );

    const selectedInput = products.find((p) => p.id === inputProductId);

    useEffect(() => {
        if (selectedInput) {
            const c = Number(selectedInput.cost) || Number(selectedInput.price) || 0;
            if (c > 0 && inputUnitCost === 0) setInputUnitCost(c);
        }
    }, [selectedInput, inputUnitCost]);

    const applyTemplate = (tid: string) => {
        setTemplateId(tid);
        const tpl = templates.find((t) => t.id === tid);
        if (!tpl) return;
        if (tpl.inputProductId) setInputProductId(tpl.inputProductId);
        setOutputs(
            tpl.outputs.map((o, i) => ({
                key: `tpl-${i}-${o.productId}`,
                productId: o.productId,
                productName: o.productName,
                outputKg: 0,
            })),
        );
    };

    const preview = useMemo(
        () => previewDisassemblyCost(inputQtyKg, inputUnitCost, outputs),
        [inputQtyKg, inputUnitCost, outputs],
    );

    const addOutputRow = () => {
        setOutputs((prev) => [...prev, { key: `row-${Date.now()}`, productId: '', outputKg: 0 }]);
    };

    const updateOutput = (key: string, patch: Partial<OutputRow>) => {
        setOutputs((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    };

    const removeOutput = (key: string) => {
        setOutputs((prev) => prev.filter((r) => r.key !== key));
    };

    const distributeByTemplateRatio = () => {
        const tpl = templates.find((t) => t.id === templateId);
        if (!tpl || inputQtyKg <= 0) {
            toast.error('Önce şablon ve karkas ağırlığı girin');
            return;
        }
        const ratios = tpl.outputs.map((o) => Number(o.standardRatioPercent) || 0);
        const ratioSum = ratios.reduce((s, r) => s + r, 0);
        if (ratioSum <= 0) {
            toast.error('Şablonda standart oran tanımlı değil');
            return;
        }
        setOutputs(
            tpl.outputs.map((o, i) => ({
                key: `ratio-${i}-${o.productId}`,
                productId: o.productId,
                productName: o.productName,
                outputKg: Math.round((inputQtyKg * (ratios[i] / ratioSum)) * 1000) / 1000,
            })),
        );
    };

    const handleSubmit = async () => {
        setSubmitting(true);
        try {
            const result = await DisassemblyService.complete({
                animalType,
                templateId: templateId || null,
                inputProductId,
                inputQtyKg,
                inputUnitCost,
                outputs,
                note: note.trim() || undefined,
            });
            if (result.ok) {
                toast.success('Parçalama tamamlandı — stoklar ve maliyetler güncellendi');
                setInputQtyKg(0);
                setOutputs([]);
                setNote('');
                onCompleted();
            } else {
                toast.error(result.error || 'İşlem başarısız');
            }
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
            {/* Sol: Girdi */}
            <div className="xl:col-span-4 space-y-4">
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                    <h3 className="text-sm font-black text-slate-800 flex items-center gap-2 mb-4">
                        <Beef className="w-4 h-4 text-amber-600" />
                        1. Karkas Girişi
                    </h3>

                    <div className="flex gap-2 mb-4">
                        {([
                            { id: 'cattle' as const, label: 'Dana' },
                            { id: 'sheep' as const, label: 'Koyun' },
                        ]).map(({ id, label }) => (
                            <button
                                key={id}
                                type="button"
                                onClick={() => { setAnimalType(id); setTemplateId(''); }}
                                className={cn(
                                    'flex-1 py-2 rounded-xl text-xs font-bold border',
                                    animalType === id
                                        ? 'bg-amber-50 border-amber-400 text-amber-800'
                                        : 'bg-slate-50 border-slate-200 text-slate-600',
                                )}
                            >
                                {label}
                            </button>
                        ))}
                    </div>

                    {animalTemplates.length > 0 && (
                        <label className="block mb-3">
                            <span className="text-[10px] font-bold text-slate-500 uppercase">Parça şablonu (isteğe bağlı)</span>
                            <select
                                className="mt-1 w-full h-10 rounded-xl border border-slate-200 px-3 text-sm"
                                value={templateId}
                                onChange={(e) => applyTemplate(e.target.value)}
                            >
                                <option value="">Şablon seçin…</option>
                                {animalTemplates.map((t) => (
                                    <option key={t.id} value={t.id}>{t.name}</option>
                                ))}
                            </select>
                        </label>
                    )}

                    <label className="block mb-3">
                        <span className="text-[10px] font-bold text-slate-500 uppercase">Karkas ürünü</span>
                        <select
                            className="mt-1 w-full h-10 rounded-xl border border-slate-200 px-3 text-sm"
                            value={inputProductId}
                            onChange={(e) => setInputProductId(e.target.value)}
                        >
                            <option value="">Seçin…</option>
                            {products.map((p) => (
                                <option key={p.id} value={p.id}>
                                    {p.name} — Stok: {p.stock ?? 0} {p.unit || 'kg'}
                                </option>
                            ))}
                        </select>
                    </label>

                    <div className="grid grid-cols-2 gap-3 mb-3">
                        <label className="block">
                            <span className="text-[10px] font-bold text-slate-500 uppercase">Brüt ağırlık (kg)</span>
                            <Input
                                type="number"
                                step="0.001"
                                min={0}
                                className="mt-1 h-11 text-lg font-bold tabular-nums"
                                value={inputQtyKg || ''}
                                onChange={(e) => setInputQtyKg(Number(e.target.value) || 0)}
                            />
                        </label>
                        <label className="block">
                            <span className="text-[10px] font-bold text-slate-500 uppercase">Birim maliyet / kg</span>
                            <Input
                                type="number"
                                step="0.01"
                                min={0}
                                className="mt-1 h-11 font-bold tabular-nums"
                                value={inputUnitCost || ''}
                                onChange={(e) => setInputUnitCost(Number(e.target.value) || 0)}
                            />
                        </label>
                    </div>

                    <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 text-xs space-y-1">
                        <div className="flex justify-between">
                            <span className="text-slate-500">Toplam karkas maliyeti</span>
                            <span className="font-black text-slate-900">{fmtMoney(preview.inputTotalCost)}</span>
                        </div>
                        {selectedInput && (
                            <div className="flex justify-between text-slate-400">
                                <span>Mevcut stok</span>
                                <span>{selectedInput.stock ?? 0} {selectedInput.unit || 'kg'}</span>
                            </div>
                        )}
                    </div>
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs text-amber-900 leading-relaxed">
                    <strong>Fire maliyeti:</strong> Karkastan çıkan fire kg, satılabilir parçaların birim maliyetine otomatik eklenir.
                    Tüm girdi maliyeti satılabilir kg oranında dağıtılır.
                </div>
            </div>

            {/* Orta: Çıktılar */}
            <div className="xl:col-span-5 bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col min-h-[420px]">
                <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-black text-slate-800">2. Parça Çıktıları</h3>
                    <div className="flex gap-2">
                        {templateId && (
                            <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={distributeByTemplateRatio}>
                                Orana göre dağıt
                            </Button>
                        )}
                        <Button type="button" size="sm" className="h-8 text-xs bg-amber-600 hover:bg-amber-700" onClick={addOutputRow}>
                            <Plus className="w-3.5 h-3.5 mr-1" /> Satır
                        </Button>
                    </div>
                </div>
                <div className="flex-1 overflow-auto">
                    <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-white border-b border-slate-100 text-[10px] uppercase text-slate-400 font-bold">
                            <tr>
                                <th className="px-3 py-2 text-left">Ürün / parça</th>
                                <th className="px-3 py-2 text-right w-28">Kg</th>
                                <th className="px-3 py-2 w-8" />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {outputs.map((row) => (
                                <tr key={row.key}>
                                    <td className="px-3 py-2">
                                        <select
                                            className="w-full h-9 rounded-lg border border-slate-200 px-2 text-xs"
                                            value={row.productId}
                                            onChange={(e) => {
                                                const p = products.find((x) => x.id === e.target.value);
                                                updateOutput(row.key, { productId: e.target.value, productName: p?.name });
                                            }}
                                        >
                                            <option value="">Parça seç…</option>
                                            {products.map((p) => (
                                                <option key={p.id} value={p.id}>{p.name}</option>
                                            ))}
                                        </select>
                                    </td>
                                    <td className="px-3 py-2">
                                        <Input
                                            type="number"
                                            step="0.001"
                                            min={0}
                                            className="h-9 text-right font-bold tabular-nums"
                                            value={row.outputKg || ''}
                                            onChange={(e) => updateOutput(row.key, { outputKg: Number(e.target.value) || 0 })}
                                        />
                                    </td>
                                    <td className="px-2 py-2">
                                        <button type="button" className="text-slate-300 hover:text-red-500" onClick={() => removeOutput(row.key)}>
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {outputs.length === 0 && (
                                <tr>
                                    <td colSpan={3} className="py-16 text-center text-slate-400 italic">
                                        Şablon seçin veya &quot;Satır&quot; ile parça ekleyin
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Sağ: Özet */}
            <div className="xl:col-span-3 space-y-4">
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
                    <h3 className="text-sm font-black text-slate-800">3. Özet &amp; Maliyet</h3>

                    <SummaryRow label="Satılabilir kg" value={fmtKg(preview.outputQtyKg)} />
                    <SummaryRow
                        label="Fire kg"
                        value={fmtKg(preview.wasteQtyKg)}
                        highlight={preview.wasteQtyKg > 0 ? 'orange' : undefined}
                    />
                    <SummaryRow
                        label="Fire maliyeti (parçalara yansıyan)"
                        value={fmtMoney(preview.wasteCostAllocated)}
                        highlight="orange"
                    />
                    <SummaryRow label="Satılabilir kg maliyeti" value={`${fmtMoney(preview.costPerKgSalable)} / kg`} bold />

                    {!preview.isBalanced && (
                        <div className="flex gap-2 items-start rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-700">
                            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                            Çıktı toplamı karkası {fmtKg(preview.overKg)} aşıyor. Kg değerlerini düzeltin.
                        </div>
                    )}

                    {preview.lines.length > 0 && (
                        <div className="border-t border-slate-100 pt-3 space-y-2 max-h-48 overflow-auto">
                            {preview.lines.map((line) => (
                                <div key={line.productId} className="flex justify-between gap-2 text-[11px]">
                                    <span className="text-slate-600 truncate">{line.productName || line.productId.slice(0, 8)}</span>
                                    <span className="font-bold text-slate-800 tabular-nums shrink-0">
                                        {fmtMoney(line.unitCost)}/kg
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}

                    <label className="block pt-2">
                        <span className="text-[10px] font-bold text-slate-500 uppercase">Not</span>
                        <Input className="mt-1 h-9 text-xs" value={note} onChange={(e) => setNote(e.target.value)} placeholder="İsteğe bağlı" />
                    </label>

                    <Button
                        className="w-full h-12 bg-green-600 hover:bg-green-700 font-bold rounded-xl"
                        disabled={submitting || !preview.isBalanced || preview.outputQtyKg <= 0 || !inputProductId}
                        onClick={() => void handleSubmit()}
                    >
                        <CheckCircle2 className="w-4 h-4 mr-2" />
                        {submitting ? 'Kaydediliyor…' : 'Parçalamayı Onayla'}
                    </Button>
                </div>
            </div>
        </div>
    );
}

function SummaryRow({
    label,
    value,
    bold,
    highlight,
}: {
    label: string;
    value: string;
    bold?: boolean;
    highlight?: 'orange';
}) {
    return (
        <div className="flex justify-between items-center text-xs gap-2">
            <span className="text-slate-500">{label}</span>
            <span className={cn(
                'tabular-nums',
                bold && 'font-black text-slate-900',
                highlight === 'orange' && 'font-bold text-orange-700',
                !bold && !highlight && 'font-semibold text-slate-800',
            )}>
                {value}
            </span>
        </div>
    );
}

function DisassemblyHistory({ orders }: { orders: DisassemblyOrder[] }) {
    const [expanded, setExpanded] = useState<string | null>(null);

    if (!orders.length) {
        return (
            <div className="py-20 text-center bg-white border border-dashed border-slate-300 rounded-2xl text-slate-400 text-sm">
                Henüz parçalama kaydı yok.
            </div>
        );
    }

    return (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <table className="w-full text-xs">
                <thead className="bg-slate-50 text-[10px] uppercase text-slate-500 font-bold">
                    <tr>
                        <th className="px-4 py-3 text-left">Fiş</th>
                        <th className="px-4 py-3 text-left">Karkas</th>
                        <th className="px-4 py-3 text-right">Girdi kg</th>
                        <th className="px-4 py-3 text-right">Fire kg</th>
                        <th className="px-4 py-3 text-right">Maliyet/kg</th>
                        <th className="px-4 py-3" />
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {orders.map((o) => (
                        <React.Fragment key={o.id}>
                            <tr className="hover:bg-slate-50/50">
                                <td className="px-4 py-3 font-mono font-bold">{o.orderNo}</td>
                                <td className="px-4 py-3">{o.inputProductName ?? '—'}</td>
                                <td className="px-4 py-3 text-right tabular-nums">{fmtKg(o.inputQtyKg)}</td>
                                <td className="px-4 py-3 text-right tabular-nums text-orange-700">{fmtKg(o.wasteQtyKg)}</td>
                                <td className="px-4 py-3 text-right tabular-nums font-bold">{fmtMoney(o.costPerKgSalable)}</td>
                                <td className="px-4 py-3 text-right">
                                    <button type="button" onClick={() => setExpanded(expanded === o.id ? null : o.id!)}>
                                        <ChevronDown className={cn('w-4 h-4 transition-transform', expanded === o.id && 'rotate-180')} />
                                    </button>
                                </td>
                            </tr>
                            {expanded === o.id && (
                                <tr className="bg-slate-50/80">
                                    <td colSpan={6} className="px-4 py-3">
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                            {o.outputs.map((line) => (
                                                <div key={line.productId} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                                                    <div className="font-semibold text-slate-800 truncate">{line.productName}</div>
                                                    <div className="text-slate-500 tabular-nums">{fmtKg(line.outputKg)} · {fmtMoney(line.unitCost)}/kg</div>
                                                </div>
                                            ))}
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </React.Fragment>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function TemplateManager({
    products,
    templates,
    onSaved,
}: {
    products: Array<{ id: string; name: string; code?: string }>;
    templates: DisassemblyTemplate[];
    onSaved: () => void;
}) {
    const [editing, setEditing] = useState<DisassemblyTemplate | null>(null);
    const [form, setForm] = useState<DisassemblyTemplate>({
        name: '',
        animalType: 'cattle',
        inputProductId: null,
        description: '',
        isActive: true,
        outputs: [],
    });

    const startNew = (animal: AnimalType) => {
        setEditing({ name: '', animalType: animal, isActive: true, outputs: [] });
        setForm({ name: '', animalType: animal, inputProductId: null, description: '', isActive: true, outputs: [] });
    };

    const startEdit = (t: DisassemblyTemplate) => {
        setEditing(t);
        setForm({ ...t, outputs: [...t.outputs] });
    };

    const save = async () => {
        if (!form.name.trim()) {
            toast.error('Şablon adı girin');
            return;
        }
        await disassemblyAPI.saveTemplate(form);
        toast.success('Şablon kaydedildi');
        setEditing(null);
        onSaved();
    };

    if (editing) {
        return (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
                <div className="flex justify-between items-center">
                    <h3 className="font-black text-slate-800">{form.id ? 'Şablon düzenle' : 'Yeni parça şablonu'}</h3>
                    <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>İptal</Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input placeholder="Şablon adı (örn. Dana karkas standart)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                    <select className="h-10 rounded-md border px-3" value={form.inputProductId ?? ''} onChange={(e) => setForm({ ...form, inputProductId: e.target.value || null })}>
                        <option value="">Varsayılan karkas ürünü…</option>
                        {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                </div>
                <div className="space-y-2">
                    {form.outputs.map((o, idx) => (
                        <div key={idx} className="flex gap-2 items-center">
                            <select className="flex-1 h-9 rounded-lg border px-2 text-xs" value={o.productId} onChange={(e) => {
                                const outputs = [...form.outputs];
                                outputs[idx] = { ...outputs[idx], productId: e.target.value, sortOrder: idx };
                                setForm({ ...form, outputs });
                            }}>
                                <option value="">Parça ürünü…</option>
                                {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                            <Input type="number" className="w-24 h-9 text-xs" placeholder="%" title="Standart oran %"
                                value={o.standardRatioPercent ?? ''}
                                onChange={(e) => {
                                    const outputs = [...form.outputs];
                                    outputs[idx] = { ...outputs[idx], standardRatioPercent: Number(e.target.value) || null };
                                    setForm({ ...form, outputs });
                                }}
                            />
                            <button type="button" onClick={() => setForm({ ...form, outputs: form.outputs.filter((_, i) => i !== idx) })}>
                                <Trash2 className="w-4 h-4 text-red-400" />
                            </button>
                        </div>
                    ))}
                    <Button variant="outline" size="sm" onClick={() => setForm({ ...form, outputs: [...form.outputs, { productId: '', sortOrder: form.outputs.length, standardRatioPercent: null }] })}>
                        <Plus className="w-4 h-4 mr-1" /> Parça ekle
                    </Button>
                </div>
                <Button className="bg-amber-600 hover:bg-amber-700" onClick={() => void save()}>
                    <Save className="w-4 h-4 mr-2" /> Kaydet
                </Button>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex gap-2">
                <Button variant="outline" onClick={() => startNew('cattle')}>+ Dana şablonu</Button>
                <Button variant="outline" onClick={() => startNew('sheep')}>+ Koyun şablonu</Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {templates.map((t) => (
                    <button
                        key={t.id}
                        type="button"
                        onClick={() => startEdit(t)}
                        className="text-left bg-white border border-slate-200 rounded-xl p-4 hover:border-amber-300 hover:shadow-sm transition-all"
                    >
                        <div className="text-xs font-black text-amber-700 uppercase">{t.animalType === 'cattle' ? 'Dana' : 'Koyun'}</div>
                        <div className="font-bold text-slate-900 mt-1">{t.name}</div>
                        <div className="text-xs text-slate-500 mt-2">{t.outputs.length} parça tanımlı</div>
                    </button>
                ))}
                {templates.length === 0 && (
                    <p className="col-span-full text-sm text-slate-400 italic py-8 text-center border border-dashed rounded-xl">
                        Henüz şablon yok. Dana veya koyun için standart parça listesi oluşturun.
                    </p>
                )}
            </div>
        </div>
    );
}
