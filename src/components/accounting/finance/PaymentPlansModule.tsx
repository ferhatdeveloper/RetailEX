/**
 * Payment Plans Management Module - Ödeme Planları Yönetimi
 * 
 * Features:
 * - List and search payment plans
 * - Add/Edit payment plans with multiple installments
 * - Professional Flat UI with Tailwind CSS
 */

import { useState, useEffect } from 'react';
import {
    Calendar, Plus, Edit, Trash2, Search, X,
    ChevronRight, Layout, Info, Save, Clock, Percent, DollarSign, RefreshCw
} from 'lucide-react';
import { DevExDataGrid } from '../../shared/DevExDataGrid';
import { createColumnHelper } from '@tanstack/react-table';
import { paymentPlansAPI, PaymentPlan, PaymentPlanLine } from '../../../services/api/paymentPlans';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useTheme } from '../../../contexts/ThemeContext';

const columnHelper = createColumnHelper<PaymentPlan>();

export function PaymentPlansModule() {
    const { t } = useLanguage();
    const { darkMode } = useTheme();

    const [plans, setPlans] = useState<PaymentPlan[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editingPlan, setEditingPlan] = useState<PaymentPlan | null>(null);

    // Form State
    const [formData, setFormData] = useState<Partial<PaymentPlan>>({
        code: '',
        name: '',
        description: '',
        is_active: true,
        lines: []
    });

    const loadPlans = async () => {
        setLoading(true);
        try {
            const data = await paymentPlansAPI.getAll('001'); // Assume default firm for now
            setPlans(data);
        } catch (error) {
            console.error('Error loading plans:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadPlans();
    }, []);

    const handleCreateNew = () => {
        setEditingPlan(null);
        setFormData({
            code: '',
            name: '',
            description: '',
            is_active: true,
            lines: [{ line_no: 1, day_offset: 0, percent: 100, payment_type: 'cash' }]
        });
        setShowModal(true);
    };

    const handleEdit = async (plan: PaymentPlan) => {
        setLoading(true);
        const fullPlan = await paymentPlansAPI.getById(plan.id!);
        if (fullPlan) {
            setEditingPlan(fullPlan);
            setFormData(fullPlan);
            setShowModal(true);
        }
        setLoading(false);
    };

    const handleDelete = async (id: string) => {
        if (window.confirm('Bu ödeme planını silmek istediğinize emin misiniz?')) {
            const success = await paymentPlansAPI.delete(id);
            if (success) loadPlans();
        }
    };

    const handleSave = async () => {
        if (!formData.code || !formData.name) {
            alert('Lütfen kod ve isim alanlarını doldurunuz.');
            return;
        }

        const planToSave = {
            ...formData,
            firm_nr: '001',
        } as PaymentPlan;

        let result;
        if (editingPlan) {
            result = await paymentPlansAPI.update(editingPlan.id!, planToSave);
        } else {
            result = await paymentPlansAPI.create(planToSave);
        }

        if (result) {
            setShowModal(false);
            loadPlans();
        } else {
            alert('Kaydedilirken bir hata oluştu.');
        }
    };

    const addLine = () => {
        const lines = [...(formData.lines || [])];
        lines.push({
            line_no: lines.length + 1,
            day_offset: 0,
            percent: 0,
            payment_type: 'cash'
        });
        setFormData({ ...formData, lines });
    };

    const removeLine = (index: number) => {
        const lines = [...(formData.lines || [])];
        lines.splice(index, 1);
        // Reorder line numbers
        const reorderedLines = lines.map((l, i) => ({ ...l, line_no: i + 1 }));
        setFormData({ ...formData, lines: reorderedLines });
    };

    const updateLine = (index: number, field: keyof PaymentPlanLine, value: any) => {
        const lines = [...(formData.lines || [])];
        lines[index] = { ...lines[index], [field]: value };
        setFormData({ ...formData, lines });
    };

    const columns = [
        columnHelper.accessor('code', {
            header: 'Kod',
            cell: info => <span className="font-mono font-bold text-blue-600">{info.getValue()}</span>,
        }),
        columnHelper.accessor('name', {
            header: 'Plan Adı',
            cell: info => <span className="font-medium">{info.getValue()}</span>,
        }),
        columnHelper.accessor('description', {
            header: 'Açıklama',
            cell: info => <span className="text-gray-500 text-sm">{info.getValue() || '-'}</span>,
        }),
        columnHelper.accessor('is_active', {
            header: 'Durum',
            cell: info => (
                <span className={`px-2 py-1 rounded-full text-xs font-semibold ${info.getValue() ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}>
                    {info.getValue() ? 'Aktif' : 'Pasif'}
                </span>
            ),
        }),
        columnHelper.display({
            id: 'actions',
            header: 'İşlemler',
            cell: props => (
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => handleEdit(props.row.original)}
                        className="p-1.5 hover:bg-blue-50 text-blue-600 rounded-lg transition-colors"
                        title="Düzenle"
                    >
                        <Edit className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => handleDelete(props.row.original.id!)}
                        className="p-1.5 hover:bg-red-50 text-red-600 rounded-lg transition-colors"
                        title="Sil"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
            ),
        }),
    ];

    const filteredPlans = plans.filter(p =>
        p.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className={`space-y-6 ${darkMode ? 'text-gray-100' : 'text-gray-800'}`}>
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2 text-blue-600">
                        <Calendar className="w-8 h-8" />
                        Ödeme Planları
                    </h1>
                    <p className="text-sm opacity-60 mt-1">Vade ve taksit yapılandırmalarını yönetin</p>
                </div>
                <button
                    onClick={handleCreateNew}
                    className="px-4 py-2 bg-blue-600 text-white rounded-xl shadow-lg shadow-blue-500/20 hover:bg-blue-700 transition-all flex items-center justify-center gap-2 font-medium"
                >
                    <Plus className="w-5 h-5" />
                    Yeni Ödeme Planı
                </button>
            </div>

            {/* Stats/Quick Info (Optional) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className={`p-4 rounded-2xl border ${darkMode ? 'bg-gray-800/50 border-gray-700' : 'bg-white border-gray-100 shadow-sm'}`}>
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-100 text-blue-600 rounded-lg"><Layout className="w-5 h-5" /></div>
                        <div>
                            <div className="text-xs opacity-60">Toplam Plan</div>
                            <div className="text-xl font-bold">{plans.length}</div>
                        </div>
                    </div>
                </div>
                {/* More stats can be added here */}
            </div>

            {/* Main Grid Card */}
            <div className={`rounded-3xl border overflow-hidden ${darkMode ? 'bg-gray-800/40 border-gray-700' : 'bg-white border-gray-100 shadow-xl shadow-gray-200/50'}`}>
                <div className="p-4 border-b border-inherit bg-gray-50/50 dark:bg-gray-900/40 flex items-center justify-between gap-4">
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Kod veya isim ile ara..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className={`w-full pl-10 pr-4 py-2 rounded-xl border focus:ring-2 focus:ring-blue-500 transition-all outline-none ${darkMode ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-200'
                                }`}
                        />
                    </div>
                </div>

                <div className="overflow-x-auto relative">
                    {loading && (
                        <div className="absolute inset-0 bg-white/50 dark:bg-gray-900/50 backdrop-blur-[1px] flex items-center justify-center z-10 transition-all">
                            <RefreshCw className="w-8 h-8 text-blue-600 animate-spin" />
                        </div>
                    )}
                    <DevExDataGrid
                        data={filteredPlans}
                        columns={columns}
                    />
                </div>
            </div>

            {/* Modern Modal */}
            {showModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm" onClick={() => setShowModal(false)} />
                    <div className={`relative w-full max-w-3xl max-h-[90vh] overflow-hidden rounded-3xl shadow-2xl flex flex-col ${darkMode ? 'bg-gray-900 border border-gray-800' : 'bg-white'
                        }`}>
                        {/* Modal Header */}
                        <div className="p-6 border-b border-inherit flex items-center justify-between">
                            <div>
                                <h2 className="text-xl font-bold flex items-center gap-2">
                                    {editingPlan ? <Edit className="w-5 h-5 text-blue-600" /> : <Plus className="w-5 h-5 text-green-600" />}
                                    {editingPlan ? 'Ödeme Planını Düzenle' : 'Yeni Ödeme Planı'}
                                </h2>
                                <p className="text-xs opacity-60 mt-0.5">Plan detaylarını ve taksit yapılandırmasını giriniz</p>
                            </div>
                            <button onClick={() => setShowModal(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Modal Content */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-8">
                            {/* Basic Info Section */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold flex items-center gap-1.5 px-1">
                                        <Info className="w-3.5 h-3.5 text-blue-600" /> Kod
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.code}
                                        onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                                        className={`w-full px-4 py-3 rounded-2xl border focus:ring-2 focus:ring-blue-500 outline-none transition-all ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
                                            }`}
                                        placeholder="Örn: 30G, 2TAK"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold flex items-center gap-1.5 px-1">
                                        <Info className="w-3.5 h-3.5 text-blue-600" /> Plan Adı
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        className={`w-full px-4 py-3 rounded-2xl border focus:ring-2 focus:ring-blue-500 outline-none transition-all ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
                                            }`}
                                        placeholder="Örn: 30 Gün Vadeli"
                                    />
                                </div>
                                <div className="md:col-span-2 space-y-2">
                                    <label className="text-sm font-semibold flex items-center gap-1.5 px-1">
                                        <Info className="w-3.5 h-3.5 text-blue-600" /> Açıklama
                                    </label>
                                    <textarea
                                        value={formData.description}
                                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                        className={`w-full px-4 py-3 rounded-2xl border focus:ring-2 focus:ring-blue-500 outline-none transition-all ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
                                            }`}
                                        rows={2}
                                        placeholder="Bu ödeme planı hakkında notlar..."
                                    />
                                </div>
                            </div>

                            {/* Installments Section */}
                            <div className="space-y-4">
                                <div className="flex items-center justify-between px-1">
                                    <h3 className="font-bold flex items-center gap-2">
                                        <Clock className="w-5 h-5 text-blue-600" />
                                        Taksit Yapılandırması
                                    </h3>
                                    <button
                                        onClick={addLine}
                                        className="text-sm font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1"
                                    >
                                        <Plus className="w-4 h-4" /> Satır Ekle
                                    </button>
                                </div>

                                <div className="space-y-3">
                                    {formData.lines?.map((line, idx) => (
                                        <div
                                            key={idx}
                                            className={`p-4 rounded-2xl border flex flex-col md:flex-row items-start md:items-center gap-4 transition-all ${darkMode ? 'bg-gray-800/20 border-gray-700 hover:bg-gray-800/40' : 'bg-gray-50/50 border-gray-200 hover:bg-white hover:shadow-md'
                                                }`}
                                        >
                                            <div className="flex items-center gap-3 flex-1 w-full">
                                                <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-sm shrink-0">
                                                    {line.line_no}
                                                </div>
                                                <div className="flex-1">
                                                    <div className="text-[10px] uppercase font-bold opacity-40 mb-1">Vade (Gün)</div>
                                                    <div className="flex items-center gap-2">
                                                        <Clock className="w-4 h-4 opacity-40" />
                                                        <input
                                                            type="number"
                                                            value={line.day_offset}
                                                            onChange={(e) => updateLine(idx, 'day_offset', parseInt(e.target.value))}
                                                            className={`w-full bg-transparent border-none focus:ring-0 font-bold p-0 ${darkMode ? 'text-white' : 'text-gray-900'}`}
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex-1 w-full">
                                                <div className="text-[10px] uppercase font-bold opacity-40 mb-1">Yüzde (%)</div>
                                                <div className="flex items-center gap-2">
                                                    <Percent className="w-4 h-4 opacity-40" />
                                                    <input
                                                        type="number"
                                                        value={line.percent}
                                                        onChange={(e) => updateLine(idx, 'percent', parseFloat(e.target.value))}
                                                        className={`w-full bg-transparent border-none focus:ring-0 font-bold p-0 ${darkMode ? 'text-white' : 'text-gray-900'}`}
                                                    />
                                                </div>
                                            </div>

                                            <div className="flex-1 w-full border-l pl-4 dark:border-gray-700">
                                                <div className="text-[10px] uppercase font-bold opacity-40 mb-1">Ödeme Türü</div>
                                                <select
                                                    value={line.payment_type}
                                                    onChange={(e) => updateLine(idx, 'payment_type', e.target.value)}
                                                    className="w-full bg-transparent border-none focus:ring-0 font-bold p-0"
                                                >
                                                    <option value="cash">Nakit</option>
                                                    <option value="credit_card">Kredi Kartı</option>
                                                    <option value="transfer">Havale/EFT</option>
                                                </select>
                                            </div>

                                            <button
                                                onClick={() => removeLine(idx)}
                                                className="p-2 text-red-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all"
                                            >
                                                <Trash2 className="w-5 h-5" />
                                            </button>
                                        </div>
                                    ))}

                                    {(!formData.lines || formData.lines.length === 0) && (
                                        <div className="py-12 text-center border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-3xl">
                                            <Clock className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                                            <p className="text-gray-400 text-sm">Henüz bir ödeme satırı eklenmedi</p>
                                            <button onClick={addLine} className="mt-4 text-blue-600 font-bold text-sm hover:underline">İlk satırı ekle</button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <div className="p-6 border-t border-inherit bg-gray-50/50 dark:bg-gray-900/40 flex items-center justify-end gap-3">
                            <button
                                onClick={() => setShowModal(false)}
                                className="px-6 py-2.5 rounded-2xl font-bold hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
                            >
                                İptal
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={loading}
                                className="px-8 py-2.5 bg-blue-600 text-white rounded-2xl font-bold shadow-lg shadow-blue-500/20 hover:bg-blue-700 transition-all flex items-center gap-2 disabled:opacity-50"
                            >
                                {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                                {editingPlan ? 'Güncelle' : 'Kaydet'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
