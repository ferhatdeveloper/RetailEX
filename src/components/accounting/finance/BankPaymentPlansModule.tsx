/**
 * Bank Payment Plans Management Module
 * Handles POS installment plans, commission rates, and delay days.
 */

import { useState, useEffect } from 'react';
import {
    Calendar, Plus, Edit, Trash2, Search, X,
    ChevronRight, Building2, CreditCard, Info, Save, Clock, Percent, RefreshCw
} from 'lucide-react';
import { DevExDataGrid } from '../../shared/DevExDataGrid';
import { createColumnHelper } from '@tanstack/react-table';
import { bankPaymentPlansAPI, BankPaymentPlan, BankPaymentPlanLine } from '../../../services/api/bankPaymentPlans';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useTheme } from '../../../contexts/ThemeContext';
import { toast } from 'sonner';

const columnHelper = createColumnHelper<BankPaymentPlan>();

export function BankPaymentPlansModule() {
    const { t } = useLanguage();
    const { darkMode } = useTheme();
    const [plans, setPlans] = useState<BankPaymentPlan[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editingPlan, setEditingPlan] = useState<BankPaymentPlan | null>(null);
    const [formData, setFormData] = useState<Partial<BankPaymentPlan>>({
        code: '',
        name: '',
        bank_name: '',
        card_brand: 'Visa',
        is_active: true,
        lines: []
    });

    useEffect(() => {
        loadPlans();
    }, []);

    const loadPlans = async () => {
        setLoading(true);
        try {
            const data = await bankPaymentPlansAPI.getAll();
            setPlans(data);
        } catch (error) {
            toast.error('Ödeme planları yüklenirken hata oluştu');
        } finally {
            setLoading(false);
        }
    };

    const handleEdit = async (plan: BankPaymentPlan) => {
        const fullPlan = await bankPaymentPlansAPI.getById(plan.id);
        if (fullPlan) {
            setEditingPlan(fullPlan);
            setFormData(fullPlan);
            setShowModal(true);
        }
    };

    const handleDelete = async (id: string) => {
        if (confirm('Bu ödeme planını silmek istediğinize emin misiniz?')) {
            const success = await bankPaymentPlansAPI.delete(id);
            if (success) {
                toast.success('Ödeme planı silindi');
                loadPlans();
            } else {
                toast.error('Silme işlemi başarısız');
            }
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (editingPlan) {
                await bankPaymentPlansAPI.update(editingPlan.id, formData);
                toast.success('Ödeme planı güncellendi');
            } else {
                await bankPaymentPlansAPI.create(formData);
                toast.success('Ödeme planı oluşturuldu');
            }
            setShowModal(false);
            loadPlans();
        } catch (error) {
            toast.error('İşlem sırasında hata oluştu');
        }
    };

    const addLine = () => {
        const newLine: BankPaymentPlanLine = {
            installment_count: (formData.lines?.length || 0) + 1,
            commission_rate: 0,
            delay_days: 0
        };
        setFormData({
            ...formData,
            lines: [...(formData.lines || []), newLine]
        });
    };

    const removeLine = (index: number) => {
        const newLines = [...(formData.lines || [])];
        newLines.splice(index, 1);
        setFormData({ ...formData, lines: newLines });
    };

    const updateLine = (index: number, field: keyof BankPaymentPlanLine, value: any) => {
        const newLines = [...(formData.lines || [])];
        newLines[index] = { ...newLines[index], [field]: value };
        setFormData({ ...formData, lines: newLines });
    };

    const columns = [
        columnHelper.accessor('code', {
            header: 'Plan Kodu',
            cell: info => <span className="font-medium text-blue-600 dark:text-blue-400">{info.getValue()}</span>,
        }),
        columnHelper.accessor('name', {
            header: 'Plan Adı',
        }),
        columnHelper.accessor('bank_name', {
            header: 'Banka',
            cell: info => (
                <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-gray-400" />
                    <span>{info.getValue()}</span>
                </div>
            )
        }),
        columnHelper.accessor('card_brand', {
            header: 'Kart Markası',
            cell: info => (
                <div className="flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-gray-400" />
                    <span>{info.getValue()}</span>
                </div>
            )
        }),
        columnHelper.display({
            id: 'actions',
            header: 'İşlemler',
            cell: props => (
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => handleEdit(props.row.original)}
                        className="p-1 hover:bg-blue-100 dark:hover:bg-blue-900/30 text-blue-600 rounded transition-colors"
                        title="Düzenle"
                    >
                        <Edit className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => handleDelete(props.row.original.id)}
                        className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 rounded transition-colors"
                        title="Sil"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
            ),
        }),
    ];

    const filteredPlans = plans.filter(plan =>
        plan.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        plan.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        plan.bank_name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900 overflow-hidden">
            {/* Header */}
            <div className="bg-white dark:bg-gray-800 border-b dark:border-gray-700 px-6 py-4">
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded-xl">
                            <CreditCard className="w-6 h-6" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Banka Ödeme Planları</h1>
                            <p className="text-sm text-gray-500 dark:text-gray-400">POS taksit ve komisyon oranları yönetimi</p>
                        </div>
                    </div>
                    <button
                        onClick={() => {
                            setEditingPlan(null);
                            setFormData({ code: '', name: '', bank_name: '', card_brand: 'Visa', is_active: true, lines: [] });
                            setShowModal(true);
                        }}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-all shadow-lg shadow-blue-500/20 active:scale-95"
                    >
                        <Plus className="w-5 h-5" />
                        Yeni Ödeme Planı
                    </button>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-hidden p-6">
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border dark:border-gray-700 h-full flex flex-col overflow-hidden">
                    {/* Toolbar */}
                    <div className="p-4 border-b dark:border-gray-700 flex items-center justify-between gap-4 bg-gray-50/50 dark:bg-gray-800/50">
                        <div className="relative flex-1 max-w-md">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                            <input
                                type="text"
                                placeholder="Plan kodu, adı veya banka ara..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 transition-all outline-none"
                            />
                        </div>
                        <button
                            onClick={loadPlans}
                            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors text-gray-500"
                            title="Yenile"
                        >
                            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                        </button>
                    </div>

                    {/* Grid */}
                    <div className="flex-1 overflow-x-auto relative">
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
            </div>

            {/* Add/Edit Modal */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowModal(false)} />
                    <div className="relative bg-white dark:bg-gray-800 rounded-3xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col border dark:border-gray-700">
                        {/* Modal Header */}
                        <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-8 py-6 text-white flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-white/20 rounded-xl backdrop-blur-md">
                                    <CreditCard className="w-6 h-6" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold">{editingPlan ? 'Planı Düzenle' : 'Yeni Ödeme Planı'}</h2>
                                    <p className="text-sm text-blue-100/80">POS taksit yapılandırması</p>
                                </div>
                            </div>
                            <button onClick={() => setShowModal(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="flex-1 overflow-hidden flex flex-col">
                            <div className="flex-1 overflow-y-auto p-8 space-y-6">
                                {/* Basic Info */}
                                <div className="grid grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 ml-1">Plan Kodu</label>
                                        <input
                                            required
                                            value={formData.code}
                                            onChange={e => setFormData({ ...formData, code: e.target.value })}
                                            className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border dark:border-gray-700 rounded-2xl focus:ring-2 focus:ring-blue-500 transition-all outline-none font-medium"
                                            placeholder="Örn: YK-POS"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 ml-1">Plan Adı</label>
                                        <input
                                            required
                                            value={formData.name}
                                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                                            className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border dark:border-gray-700 rounded-2xl focus:ring-2 focus:ring-blue-500 transition-all outline-none font-medium"
                                            placeholder="Örn: Yapı Kredi World"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 ml-1">Banka Adı</label>
                                        <input
                                            required
                                            value={formData.bank_name}
                                            onChange={e => setFormData({ ...formData, bank_name: e.target.value })}
                                            className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border dark:border-gray-700 rounded-2xl focus:ring-2 focus:ring-blue-500 transition-all outline-none font-medium"
                                            placeholder="Örn: Yapı Kredi"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 ml-1">Kart Markası</label>
                                        <select
                                            value={formData.card_brand}
                                            onChange={e => setFormData({ ...formData, card_brand: e.target.value })}
                                            className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border dark:border-gray-700 rounded-2xl focus:ring-2 focus:ring-blue-500 transition-all outline-none font-medium"
                                        >
                                            <option value="Visa">Visa</option>
                                            <option value="Mastercard">Mastercard</option>
                                            <option value="Troy">Troy</option>
                                            <option value="Amex">Amex</option>
                                            <option value="Diners">Diners</option>
                                        </select>
                                    </div>
                                </div>

                                {/* Installment Lines */}
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between border-b dark:border-gray-700 pb-2">
                                        <div className="flex items-center gap-2">
                                            <Clock className="w-5 h-5 text-blue-600" />
                                            <h3 className="font-bold text-gray-900 dark:text-white text-lg">Taksit ve Komisyon Detayları</h3>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={addLine}
                                            className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors font-semibold text-sm"
                                        >
                                            <Plus className="w-4 h-4" />
                                            Taksit Ekle
                                        </button>
                                    </div>

                                    {formData.lines && formData.lines.length > 0 ? (
                                        <div className="space-y-3">
                                            {formData.lines.map((line, index) => (
                                                <div key={index} className="flex flex-wrap items-end gap-4 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-2xl border dark:border-gray-700 relative group animate-in slide-in-from-left-2 transition-all">
                                                    <div className="flex-1 min-w-[100px] space-y-1">
                                                        <label className="text-[10px] uppercase tracking-wider font-bold text-gray-500 dark:text-gray-400 ml-1">Taksit Sayısı</label>
                                                        <input
                                                            type="number"
                                                            min="1"
                                                            max="12"
                                                            value={line.installment_count}
                                                            onChange={e => updateLine(index, 'installment_count', parseInt(e.target.value))}
                                                            className="w-full px-3 py-2 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl focus:ring-1 focus:ring-blue-500 outline-none transition-all text-sm font-semibold"
                                                        />
                                                    </div>
                                                    <div className="flex-1 min-w-[130px] space-y-1">
                                                        <label className="text-[10px] uppercase tracking-wider font-bold text-gray-500 dark:text-gray-400 ml-1">Komisyon Oranı (%)</label>
                                                        <div className="relative">
                                                            <input
                                                                type="number"
                                                                step="0.01"
                                                                value={line.commission_rate}
                                                                onChange={e => updateLine(index, 'commission_rate', parseFloat(e.target.value))}
                                                                className="w-full pl-3 pr-8 py-2 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl focus:ring-1 focus:ring-blue-500 outline-none transition-all text-sm font-semibold"
                                                            />
                                                            <Percent className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                                        </div>
                                                    </div>
                                                    <div className="flex-1 min-w-[130px] space-y-1">
                                                        <label className="text-[10px] uppercase tracking-wider font-bold text-gray-500 dark:text-gray-400 ml-1">Valör Gün</label>
                                                        <input
                                                            type="number"
                                                            value={line.delay_days}
                                                            onChange={e => updateLine(index, 'delay_days', parseInt(e.target.value))}
                                                            className="w-full px-3 py-2 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl focus:ring-1 focus:ring-blue-500 outline-none transition-all text-sm font-semibold"
                                                        />
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => removeLine(index)}
                                                        className="p-2.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-xl transition-colors mb-0.5"
                                                    >
                                                        <Trash2 className="w-5 h-5" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="text-center py-12 bg-gray-50 dark:bg-gray-900/50 rounded-3xl border-2 border-dashed dark:border-gray-700">
                                            <Info className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                                            <p className="text-gray-500 dark:text-gray-400 font-medium italic">Henüz taksit detayı eklenmemiş.</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Modal Footer */}
                            <div className="p-8 bg-gray-50 dark:bg-gray-800/50 border-t dark:border-gray-700 flex items-center justify-end gap-4">
                                <button
                                    type="button"
                                    onClick={() => setShowModal(false)}
                                    className="px-6 py-3 text-gray-600 dark:text-gray-400 font-bold hover:bg-gray-200 dark:hover:bg-gray-700 rounded-2xl transition-colors"
                                >
                                    Vazgeç
                                </button>
                                <button
                                    type="submit"
                                    className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl transition-all shadow-lg shadow-blue-500/20 active:scale-95 flex items-center gap-2"
                                >
                                    <Save className="w-5 h-5" />
                                    {editingPlan ? 'Güncelle' : 'Kaydet'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
