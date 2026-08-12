import { useEffect, useMemo, useState } from 'react';
import { Search, UserRound, X, Loader2 } from 'lucide-react';
import { PercentBodyModal, PercentBodyModalScrollBody } from '../../shared/PercentBodyModal';
import { useBeautyStore } from '../store/useBeautyStore';
import { useLanguage } from '../../../contexts/LanguageContext';
import type { BeautyCustomer } from '../../../types/beauty';

export type AppointmentChangeCustomerModalProps = {
    open: boolean;
    onClose: () => void;
    appointmentId: string;
    currentCustomerId?: string | null;
    currentCustomerName?: string | null;
    onChanged: (newCustomer: BeautyCustomer) => void;
};

function customerMatches(c: BeautyCustomer, term: string): boolean {
    const t = term.trim();
    if (!t) return true;
    const lower = t.toLocaleLowerCase('tr-TR');
    const fields = [
        c.name,
        c.code,
        c.phone,
        c.phone2,
        c.email,
    ];
    return fields.some((f) => (f ?? '').toString().toLocaleLowerCase('tr-TR').includes(lower));
}

export function AppointmentChangeCustomerModal({
    open,
    onClose,
    appointmentId,
    currentCustomerId,
    currentCustomerName,
    onChanged,
}: AppointmentChangeCustomerModalProps) {
    const { tm } = useLanguage();
    const { customers, isLoading, loadCustomers } = useBeautyStore();
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [note, setNote] = useState('');
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (open && customers.length === 0 && !isLoading) {
            void loadCustomers();
        }
    }, [open, customers.length, isLoading, loadCustomers]);

    useEffect(() => {
        if (!open) {
            setSearchTerm('');
            setSelectedId(null);
            setNote('');
            setSubmitting(false);
        }
    }, [open]);

    const filtered = useMemo(() => {
        const term = searchTerm.trim();
        if (!term) return customers;
        return customers.filter((c) => customerMatches(c, term));
    }, [customers, searchTerm]);

    const selected = useMemo(
        () => customers.find((c) => c.id === selectedId) ?? null,
        [customers, selectedId],
    );

    if (!open) return null;

    const handleSubmit = async () => {
        if (!selected || submitting) return;
        if (selected.id === currentCustomerId) {
            onClose();
            return;
        }
        setSubmitting(true);
        try {
            const { beautyService } = await import('../../../services/beautyService');
            await beautyService.changeAppointmentCustomer(appointmentId, selected.id, currentCustomerId ?? null, {
                note: note.trim() || null,
            });
            onChanged(selected);
            onClose();
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            // eslint-disable-next-line no-alert
            alert(`${tm('changeAppointmentCustomerFailed')}: ${msg}`);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <PercentBodyModal
            onClose={onClose}
            size="list"
            ariaLabel={tm('changeAppointmentCustomerTitle')}
        >
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-5 text-white shrink-0 flex items-start justify-between gap-4">
                <div className="min-w-0">
                    <h3 className="text-base font-bold flex items-center gap-2">
                        <UserRound className="w-5 h-5" />
                        {tm('changeAppointmentCustomerTitle')}
                    </h3>
                    <p className="mt-1 text-[12px] text-blue-100/90 leading-relaxed">
                        {tm('changeAppointmentCustomerHint')}
                    </p>
                    {currentCustomerName ? (
                        <p className="mt-1 text-[11px] text-blue-100/80">
                            Mevcut müşteri: <span className="font-semibold">{currentCustomerName}</span>
                        </p>
                    ) : null}
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    className="text-white/80 hover:text-white p-1 rounded shrink-0"
                    aria-label="Kapat"
                >
                    <X className="w-5 h-5" />
                </button>
            </div>

            <div className="p-4 border-b border-gray-200 shrink-0">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        autoFocus
                        placeholder={tm('changeAppointmentCustomerSearchPlaceholder')}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-500"
                    />
                </div>
            </div>

            <PercentBodyModalScrollBody className="p-3">
                {isLoading && customers.length === 0 ? (
                    <div className="flex items-center justify-center gap-2 py-12 text-gray-500 text-sm">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Yükleniyor...
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="py-12 text-center text-gray-500 text-sm">
                        Sonuç bulunamadı.
                    </div>
                ) : (
                    <ul className="space-y-1">
                        {filtered.map((c) => {
                            const isCurrent = c.id === currentCustomerId;
                            const isSelected = c.id === selectedId;
                            return (
                                <li key={c.id}>
                                    <button
                                        type="button"
                                        onClick={() => setSelectedId(c.id)}
                                        disabled={isCurrent}
                                        className={`w-full text-left px-3 py-2.5 rounded-lg border flex items-center gap-3 transition-colors
                                            ${isCurrent ? 'opacity-50 cursor-not-allowed border-gray-100 bg-gray-50' : ''}
                                            ${isSelected && !isCurrent
                                                ? 'border-blue-500 bg-blue-50'
                                                : 'border-gray-200 hover:border-blue-400 hover:bg-blue-50/40'}
                                        `}
                                    >
                                        <UserRound className={`w-4 h-4 shrink-0 ${isSelected ? 'text-blue-600' : 'text-gray-400'}`} />
                                        <div className="min-w-0 flex-1">
                                            <div className="font-semibold text-gray-900 truncate">
                                                {c.name || '—'}
                                                {isCurrent ? (
                                                    <span className="ml-2 text-[10px] uppercase tracking-wider text-gray-500">(mevcut)</span>
                                                ) : null}
                                            </div>
                                            <div className="text-[11px] text-gray-500 truncate">
                                                {c.code ? `Kod: ${c.code}` : ''}
                                                {c.phone ? ` · ${c.phone}` : ''}
                                            </div>
                                        </div>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </PercentBodyModalScrollBody>

            <div className="p-4 border-t border-gray-100 bg-gray-50/60 shrink-0 space-y-3">
                <div>
                    <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                        {tm('changeAppointmentCustomerNotePlaceholder')}
                    </label>
                    <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        rows={2}
                        maxLength={500}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-300"
                    />
                </div>
                <div className="flex items-center justify-end gap-2">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={submitting}
                        className="px-4 py-2 rounded-lg border-2 border-gray-200 text-gray-600 font-bold uppercase text-xs tracking-wider hover:bg-gray-100 disabled:opacity-50"
                    >
                        {tm('cancel')}
                    </button>
                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={!selected || submitting}
                        className="px-4 py-2 rounded-lg bg-blue-600 text-white font-bold uppercase text-xs tracking-wider shadow-lg shadow-blue-200/50 hover:bg-blue-700 disabled:opacity-50 inline-flex items-center gap-2"
                    >
                        {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        {tm('save')}
                    </button>
                </div>
            </div>
        </PercentBodyModal>
    );
}
