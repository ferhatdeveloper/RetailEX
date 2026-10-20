import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Edit2, User, UserCheck, UserX, X, Save, ToggleLeft, ToggleRight } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import { useBeautyStore } from '../store/useBeautyStore';
import { BeautySpecialist } from '../../../types/beauty';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useLanguage } from '../../../contexts/LanguageContext';
import { DevExDataGrid } from '../../shared/DevExDataGrid';
import { PercentBodyModal, PercentBodyModalScrollBody } from '../../shared/PercentBodyModal';
import '../ClinicStyles.css';

const SPECIALIST_COLORS = [
    '#9333ea', '#6366f1', '#ec4899', '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
];

const EMPTY_FORM: Partial<BeautySpecialist> = {
    name: '', phone: '', email: '', specialty: '',
    color: '#9333ea', commission_rate: 0, product_unit_commission: 0, is_active: true,
};

export function StaffManagement() {
    const { tm, language } = useLanguage();
    const { specialists, isLoading, loadSpecialists, createSpecialist, updateSpecialist, toggleSpecialist } = useBeautyStore();
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState<Partial<BeautySpecialist>>(EMPTY_FORM);
    const [isEdit, setIsEdit] = useState(false);
    const [saving, setSaving] = useState(false);

    const locale = language === 'ar' ? 'ar' : language === 'ku' ? 'ku' : language === 'en' ? 'en-US' : 'tr-TR';

    useEffect(() => { loadSpecialists(); }, []);

    const openCreate = () => { setEditing({ ...EMPTY_FORM }); setIsEdit(false); setShowModal(true); };
    const openEdit = useCallback((staff: BeautySpecialist) => { setEditing({ ...staff }); setIsEdit(true); setShowModal(true); }, []);

    const handleSave = async () => {
        if (!editing.name?.trim()) return;
        setSaving(true);
        try {
            if (isEdit && editing.id) await updateSpecialist(editing.id, editing);
            else await createSpecialist(editing);
            setShowModal(false);
        } finally { setSaving(false); }
    };

    const handleToggle = useCallback(async (staff: BeautySpecialist) => {
        await toggleSpecialist(staff.id, !staff.is_active);
    }, [toggleSpecialist]);

    const columns = useMemo<ColumnDef<BeautySpecialist, unknown>[]>(() => [
        {
            id: 'name',
            accessorKey: 'name',
            header: tm('bFullNameLabel'),
        },
        {
            id: 'specialty',
            accessorFn: (row) => row.specialty ?? '',
            header: tm('bSpecialtyLabel'),
        },
        {
            id: 'phone',
            accessorFn: (row) => row.phone ?? '',
            header: tm('bPhone'),
        },
        {
            id: 'email',
            accessorFn: (row) => row.email ?? '',
            header: tm('bEmail'),
        },
        {
            id: 'commission_rate',
            accessorFn: (row) => Number(row.commission_rate ?? 0),
            header: tm('bCommissionPercentShort'),
            cell: ({ getValue }) => `%${Number(getValue() ?? 0)}`,
        },
        {
            id: 'product_unit_commission',
            accessorFn: (row) => Number(row.product_unit_commission ?? 0),
            header: tm('bProductUnitCommissionLabel'),
            cell: ({ getValue }) => Number(getValue() ?? 0).toLocaleString(locale),
        },
        {
            id: 'is_active',
            accessorFn: (row) => (row.is_active ? tm('active') : tm('inactive')),
            header: tm('status'),
        },
        {
            id: 'actions',
            header: '',
            enableSorting: false,
            enableColumnFilter: false,
            cell: ({ row }) => (
                <div className="flex justify-end gap-1">
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            openEdit(row.original);
                        }}
                        className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-violet-50"
                        aria-label={tm('bEditStaffTitle')}
                    >
                        <Edit2 size={14} />
                    </button>
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            void handleToggle(row.original);
                        }}
                        className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-emerald-50"
                        title={row.original.is_active ? tm('bDeactivateStaff') : tm('bActivateStaff')}
                    >
                        {row.original.is_active ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                    </button>
                </div>
            ),
        },
    ], [tm, locale, openEdit, handleToggle]);

    return (
        <div className="flex h-full min-h-0 flex-col gap-4 bg-gray-50 p-4 sm:p-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{tm('bStaffMgmtTitle')}</h1>
                    <p className="text-sm text-gray-500 mt-1">
                        {isLoading
                            ? tm('bLoading')
                            : tm('bStaffRegisteredCount').replace('{n}', String(specialists.length))}
                    </p>
                </div>
                <Button
                    onClick={openCreate}
                    className="bg-purple-600 hover:bg-purple-700 text-white font-bold px-6 py-6 rounded-2xl shadow-lg shadow-purple-600/20 active:scale-95 transition-all flex items-center gap-2"
                >
                    <Plus size={20} />
                    <span className="uppercase">{tm('bAddNewStaff')}</span>
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 shrink-0">
                <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
                    <div className="w-12 h-12 bg-purple-50 rounded-2xl flex items-center justify-center text-purple-600 border border-purple-100">
                        <User size={22} />
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">{tm('bTotalTeam')}</p>
                        <p className="text-xl font-black text-gray-900">
                            {tm('bPeopleCount').replace('{n}', String(specialists.length))}
                        </p>
                    </div>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
                    <div className="w-12 h-12 bg-green-50 rounded-2xl flex items-center justify-center text-green-600 border border-green-100">
                        <UserCheck size={22} />
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">{tm('bActiveEmployees')}</p>
                        <p className="text-xl font-black text-gray-900">
                            {tm('bPeopleCount').replace('{n}', String(specialists.filter(s => s.is_active).length))}
                        </p>
                    </div>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
                    <div className="w-12 h-12 bg-orange-50 rounded-2xl flex items-center justify-center text-orange-500 border border-orange-100">
                        <UserX size={22} />
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">{tm('bInactiveEmployees')}</p>
                        <p className="text-xl font-black text-gray-900">
                            {tm('bPeopleCount').replace('{n}', String(specialists.filter(s => !s.is_active).length))}
                        </p>
                    </div>
                </div>
            </div>

            <div className="min-h-0 flex-1 bg-white border border-gray-200 rounded-xl overflow-hidden">
                <DevExDataGrid
                    data={specialists}
                    columns={columns}
                    pageSize={50}
                    enableFiltering
                    enablePagination
                    storageNamespace="beautyStaffList"
                    height="calc(100vh - 320px)"
                    onRefresh={() => loadSpecialists()}
                    refreshing={isLoading}
                    onRowDoubleClick={(row) => openEdit(row)}
                    getRowClassName={(row) => (row.is_active ? undefined : 'opacity-70')}
                />
            </div>

            {showModal && (
                <PercentBodyModal
                    onClose={() => setShowModal(false)}
                    size="form"
                    ariaLabel={isEdit ? tm('bEditStaffTitle') : tm('bNewStaffTitle')}
                >
                    <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4 text-white shrink-0 flex items-center justify-between">
                        <div>
                            <h2 className="text-lg font-black">{isEdit ? tm('bEditStaffTitle') : tm('bNewStaffTitle')}</h2>
                            <p className="text-white/80 text-xs mt-1">
                                {isEdit ? tm('bEditStaffHint') : tm('bNewStaffHint')}
                            </p>
                        </div>
                        <button type="button" onClick={() => setShowModal(false)} className="p-2 hover:bg-white/20 rounded-xl" aria-label={tm('cancel')}>
                            <X size={20} />
                        </button>
                    </div>
                    <PercentBodyModalScrollBody className="p-6 space-y-4">
                        <div>
                            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">{tm('bFullNameLabel')} <span className="text-red-500">*</span></label>
                            <Input value={editing.name ?? ''} onChange={e => setEditing(p => ({ ...p, name: e.target.value }))} placeholder="Zahra" className="border-slate-200 rounded-2xl focus:border-blue-400" />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">{tm('bPhone')}</label>
                                <Input value={editing.phone ?? ''} onChange={e => setEditing(p => ({ ...p, phone: e.target.value }))} placeholder="05xx xxx xx xx" className="border-slate-200 rounded-2xl focus:border-blue-400" />
                            </div>
                            <div>
                                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">{tm('bEmail')}</label>
                                <Input type="email" value={editing.email ?? ''} onChange={e => setEditing(p => ({ ...p, email: e.target.value }))} placeholder="name@clinic.com" className="border-slate-200 rounded-2xl focus:border-blue-400" />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">{tm('bSpecialtyLabel')}</label>
                                <Input value={editing.specialty ?? ''} onChange={e => setEditing(p => ({ ...p, specialty: e.target.value }))} placeholder="Laser" className="border-slate-200 rounded-2xl focus:border-blue-400" />
                            </div>
                            <div>
                                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">{tm('bCommissionPercentShort')}</label>
                                <Input type="number" min={0} max={100} value={editing.commission_rate ?? 0} onChange={e => setEditing(p => ({ ...p, commission_rate: Number(e.target.value) }))} className="border-slate-200 rounded-2xl focus:border-blue-400" />
                            </div>
                        </div>
                        <div>
                            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">{tm('bProductUnitCommissionLabel')}</label>
                            <Input
                                type="number"
                                min={0}
                                step="0.01"
                                value={editing.product_unit_commission ?? 0}
                                onChange={e => setEditing(p => ({ ...p, product_unit_commission: Number(e.target.value) }))}
                                placeholder="10000"
                                className="border-slate-200 rounded-2xl focus:border-blue-400"
                            />
                            <p className="text-[11px] text-slate-500 mt-1">
                                {tm('bProductUnitCommissionHint')}
                            </p>
                        </div>
                        <div>
                            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2 block">{tm('bColorLabel')}</label>
                            <div className="flex gap-2 flex-wrap">
                                {SPECIALIST_COLORS.map(color => (
                                    <button key={color} type="button" onClick={() => setEditing(p => ({ ...p, color }))} className={`w-8 h-8 rounded-full transition-all ${editing.color === color ? 'ring-2 ring-offset-2 ring-slate-400 scale-110' : 'opacity-70 hover:opacity-100'}`} style={{ backgroundColor: color }} />
                                ))}
                            </div>
                        </div>
                        {isEdit && (
                            <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-2xl border border-gray-100">
                                <input type="checkbox" checked={editing.is_active ?? true} onChange={e => setEditing(p => ({ ...p, is_active: e.target.checked }))} className="w-5 h-5 rounded text-blue-600" />
                                <span className="text-sm font-bold text-gray-900 uppercase">{tm('active')}</span>
                            </div>
                        )}
                    </PercentBodyModalScrollBody>
                    <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex gap-3 shrink-0">
                        <Button variant="outline" onClick={() => setShowModal(false)} className="flex-1 rounded-2xl border-slate-200 font-bold">{tm('cancel')}</Button>
                        <Button onClick={handleSave} disabled={!editing.name?.trim() || saving} className="flex-1 rounded-2xl text-white font-bold bg-blue-600 hover:bg-blue-700">
                            <Save size={16} className="mr-2" />{saving ? tm('bSaving') : tm('save')}
                        </Button>
                    </div>
                </PercentBodyModal>
            )}
        </div>
    );
}
