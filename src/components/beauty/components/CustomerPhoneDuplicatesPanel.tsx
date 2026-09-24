import React, { useMemo, useState } from 'react';
import { AlertTriangle, ChevronRight, GitMerge, Phone, Search } from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '../../../contexts/LanguageContext';
import type { BeautyCustomer } from '../../../types/beauty';
import {
    executeCustomerMerge,
    previewCustomerMerge,
    type CustomerMergePreview,
} from '../../../services/api/customerMerge';
import {
    findDuplicatePhoneGroups,
    type DuplicatePhoneGroup,
} from '../../../utils/customerPhoneDuplicate';
import { PercentBodyModal, PercentBodyModalScrollBody } from '../../shared/PercentBodyModal';
import { confirm as confirmDialog } from '../../shared/ConfirmDialog';

type Props = {
    customers: BeautyCustomer[];
    onChanged: () => Promise<void> | void;
    onOpenCustomer?: (id: string) => void;
};

const PAGE_SIZE = 40;

export function CustomerPhoneDuplicatesPanel({ customers, onChanged, onOpenCustomer }: Props) {
    const { tm } = useLanguage();
    const groups = useMemo(() => findDuplicatePhoneGroups(customers), [customers]);
    const [reportOpen, setReportOpen] = useState(false);
    const [reportFilter, setReportFilter] = useState('');
    const [page, setPage] = useState(0);
    const [mergeGroup, setMergeGroup] = useState<DuplicatePhoneGroup<BeautyCustomer> | null>(null);
    const [keepId, setKeepId] = useState<string | null>(null);
    const [preview, setPreview] = useState<CustomerMergePreview | null>(null);
    const [mergeBusy, setMergeBusy] = useState(false);

    const filteredGroups = useMemo(() => {
        const q = reportFilter.trim().toLowerCase();
        if (!q) return groups;
        const digits = q.replace(/\D/g, '');
        return groups.filter(g => {
            if (g.displayPhone.toLowerCase().includes(q) || g.key.includes(digits)) return true;
            if (g.variants.some(v => v.toLowerCase().includes(q) || v.replace(/\D/g, '').includes(digits))) {
                return true;
            }
            return g.customers.some(
                c =>
                    (c.name ?? '').toLowerCase().includes(q) ||
                    (c.file_id ?? '').toLowerCase().includes(q) ||
                    (c.phone ?? '').toLowerCase().includes(q),
            );
        });
    }, [groups, reportFilter]);

    const pageCount = Math.max(1, Math.ceil(filteredGroups.length / PAGE_SIZE));
    const pageSafe = Math.min(page, pageCount - 1);
    const pageSlice = filteredGroups.slice(pageSafe * PAGE_SIZE, pageSafe * PAGE_SIZE + PAGE_SIZE);

    if (groups.length === 0) return null;

    const totalCards = groups.reduce((s, g) => s + g.customers.length, 0);

    const openReport = () => {
        setReportFilter('');
        setPage(0);
        setReportOpen(true);
    };

    const openMerge = (g: DuplicatePhoneGroup<BeautyCustomer>) => {
        setMergeGroup(g);
        setKeepId(g.customers[0]?.id ?? null);
        setPreview(null);
    };

    const loadPreview = async () => {
        if (!mergeGroup || !keepId) return;
        const sources = mergeGroup.customers.filter(c => c.id !== keepId);
        if (sources.length === 0) {
            toast.error(tm('bFileIdMergeNeedTwo'));
            return;
        }
        setMergeBusy(true);
        try {
            const p = await previewCustomerMerge(sources[0]!.id, keepId);
            setPreview(p);
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : String(e));
        } finally {
            setMergeBusy(false);
        }
    };

    const doMerge = async () => {
        if (!mergeGroup || !keepId) return;
        const sources = mergeGroup.customers.filter(c => c.id !== keepId);
        if (sources.length === 0) return;

        const ok = await confirmDialog({
            title: tm('bPhoneDupMergeConfirmTitle'),
            description: tm('bPhoneDupMergeConfirmMsg')
                .replace('{{count}}', String(sources.length))
                .replace(
                    '{{target}}',
                    mergeGroup.customers.find(c => c.id === keepId)?.name ?? '',
                ),
            confirmLabel: tm('bFileIdMergeDo'),
            cancelLabel: tm('cancel'),
            variant: 'danger',
        });
        if (!ok) return;

        setMergeBusy(true);
        try {
            for (const src of sources) {
                await executeCustomerMerge(src.id, keepId, {
                    notes: `phone duplicate merge ${mergeGroup.displayPhone}`,
                });
            }
            toast.success(tm('bFileIdMergeOk'));
            setMergeGroup(null);
            setPreview(null);
            setReportOpen(false);
            await onChanged();
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : String(e));
        } finally {
            setMergeBusy(false);
        }
    };

    return (
        <>
            <button
                type="button"
                onClick={openReport}
                className="mx-4 mt-3 w-[calc(100%-2rem)] rounded-xl border-2 border-sky-400 bg-sky-50 px-4 py-3 text-left shadow-sm hover:bg-sky-100 hover:border-sky-500 transition-colors shrink-0 cursor-pointer"
            >
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-start gap-2 min-w-0 flex-1">
                        <Phone className="w-5 h-5 text-sky-700 shrink-0 mt-0.5" />
                        <div className="min-w-0">
                            <p className="text-sm font-semibold text-sky-950">
                                {tm('bPhoneDupTitle')} ({groups.length})
                            </p>
                            <p className="text-xs text-sky-800 mt-0.5">
                                {tm('bPhoneDupHint')
                                    .replace('{{groups}}', String(groups.length))
                                    .replace('{{cards}}', String(totalCards))}
                            </p>
                            <p className="text-[11px] font-bold uppercase tracking-wide text-sky-700 mt-2">
                                {tm('bPhoneDupClickToOpen')}
                            </p>
                        </div>
                    </div>
                    <span className="inline-flex items-center gap-1 shrink-0 rounded-lg bg-sky-700 px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-white pointer-events-none">
                        {tm('bPhoneDupShowReport')}
                        <ChevronRight className="w-4 h-4" />
                    </span>
                </div>
            </button>

            {reportOpen && (
                <PercentBodyModal
                    onClose={() => setReportOpen(false)}
                    size="wide"
                    ariaLabel={tm('bPhoneDupTitle')}
                >
                    <div className="bg-gradient-to-r from-sky-600 to-indigo-600 px-6 py-4 text-white shrink-0">
                        <h3 className="text-lg font-bold">{tm('bPhoneDupReportTitle')}</h3>
                        <p className="text-sm text-sky-100 mt-1">{tm('bPhoneDupReportSub')}</p>
                    </div>
                    <div className="px-4 pt-3 pb-2 border-b border-sky-100 shrink-0">
                        <div className="relative">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                            <input
                                type="search"
                                value={reportFilter}
                                onChange={e => {
                                    setReportFilter(e.target.value);
                                    setPage(0);
                                }}
                                placeholder={tm('bPhoneDupFilterPh')}
                                className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-10 pr-3 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
                            />
                        </div>
                        <p className="text-[11px] text-gray-500 mt-1.5">
                            {filteredGroups.length} / {groups.length} {tm('bPhoneDupGroupsWord')}
                        </p>
                    </div>
                    <PercentBodyModalScrollBody className="p-4 space-y-3">
                        {pageSlice.length === 0 ? (
                            <p className="text-sm text-gray-500 text-center py-8">{tm('bNoCustomerResults')}</p>
                        ) : (
                            pageSlice.map(g => (
                                <div
                                    key={g.key}
                                    className="rounded-xl border border-sky-200 bg-white px-4 py-3"
                                >
                                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                                        <div>
                                            <p className="font-mono text-sm font-bold text-sky-900 tabular-nums">
                                                {g.displayPhone}
                                            </p>
                                            <p className="text-[11px] text-gray-500 mt-0.5">
                                                {tm('bPhoneDupNormalized')}: {g.key}
                                                {g.variants.length > 1
                                                    ? ` · ${tm('bPhoneDupVariants')}: ${g.variants.slice(0, 4).join(' | ')}${g.variants.length > 4 ? '…' : ''}`
                                                    : ''}
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => openMerge(g)}
                                            className="inline-flex items-center gap-1 rounded-lg bg-violet-600 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white hover:bg-violet-700"
                                        >
                                            <GitMerge className="w-3.5 h-3.5" />
                                            {tm('bFileIdMergeOpen')}
                                        </button>
                                    </div>
                                    <ul className="space-y-1.5">
                                        {g.customers.map(c => (
                                            <li
                                                key={c.id}
                                                className="flex flex-wrap items-center justify-between gap-2 text-sm border-t border-gray-100 pt-1.5 first:border-0 first:pt-0"
                                            >
                                                <button
                                                    type="button"
                                                    className="text-left min-w-0 hover:text-violet-700"
                                                    onClick={() => onOpenCustomer?.(c.id)}
                                                >
                                                    <span className="font-medium text-gray-900">{c.name}</span>
                                                    <span className="text-xs text-gray-500 ml-2">
                                                        {c.file_id
                                                            ? `${tm('custColFileNo')} ${c.file_id}`
                                                            : ''}
                                                        {c.file_id && (c.phone || c.phone2) ? ' · ' : ''}
                                                        {c.phone || c.phone2 || ''}
                                                    </span>
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ))
                        )}
                    </PercentBodyModalScrollBody>
                    <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex flex-wrap items-center justify-between gap-3 shrink-0">
                        <div className="flex items-center gap-2 text-xs text-gray-600">
                            <button
                                type="button"
                                disabled={pageSafe <= 0}
                                onClick={() => setPage(p => Math.max(0, p - 1))}
                                className="rounded border px-2 py-1 disabled:opacity-40"
                            >
                                ‹
                            </button>
                            <span>
                                {pageSafe + 1} / {pageCount}
                            </span>
                            <button
                                type="button"
                                disabled={pageSafe >= pageCount - 1}
                                onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))}
                                className="rounded border px-2 py-1 disabled:opacity-40"
                            >
                                ›
                            </button>
                        </div>
                        <button
                            type="button"
                            onClick={() => setReportOpen(false)}
                            className="rounded-2xl border-2 border-slate-200 px-4 py-2 text-sm font-bold uppercase tracking-wider text-slate-600 hover:bg-slate-100"
                        >
                            {tm('cancel')}
                        </button>
                    </div>
                </PercentBodyModal>
            )}

            {mergeGroup && (
                <PercentBodyModal
                    onClose={() => {
                        if (mergeBusy) return;
                        setMergeGroup(null);
                        setPreview(null);
                    }}
                    size="wide"
                    ariaLabel={tm('bFileIdMergeOpen')}
                >
                    <div className="bg-gradient-to-r from-violet-600 to-indigo-600 px-6 py-4 text-white shrink-0">
                        <h3 className="text-lg font-bold">
                            {tm('bFileIdMergeOpen')} — {mergeGroup.displayPhone}
                        </h3>
                        <p className="text-sm text-violet-100 mt-1">{tm('bFileIdMergePickKeep')}</p>
                    </div>
                    <PercentBodyModalScrollBody className="p-6 space-y-4">
                        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 flex gap-2">
                            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                            {tm('bPhoneDupMergeWarn')}
                        </div>
                        <div className="space-y-2">
                            {mergeGroup.customers.map(c => (
                                <label
                                    key={c.id}
                                    className={`flex items-start gap-3 rounded-xl border px-4 py-3 cursor-pointer ${
                                        keepId === c.id
                                            ? 'border-violet-500 bg-violet-50'
                                            : 'border-gray-200 hover:bg-gray-50'
                                    }`}
                                >
                                    <input
                                        type="radio"
                                        name="keepPhoneCustomer"
                                        checked={keepId === c.id}
                                        onChange={() => {
                                            setKeepId(c.id);
                                            setPreview(null);
                                        }}
                                        className="mt-1"
                                    />
                                    <div>
                                        <p className="font-semibold text-gray-900">{c.name}</p>
                                        <p className="text-xs text-gray-500">
                                            {c.file_id
                                                ? `${tm('custColFileNo')}: ${c.file_id}`
                                                : '—'}
                                            {' · '}
                                            {c.phone || c.phone2 || '—'}
                                        </p>
                                    </div>
                                </label>
                            ))}
                        </div>
                        {preview && (
                            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm space-y-1">
                                <p>
                                    <span className="font-semibold">{preview.source.name}</span>
                                    {' → '}
                                    <span className="font-semibold">{preview.target.name}</span>
                                    {mergeGroup.customers.length > 2
                                        ? ` (+${mergeGroup.customers.length - 2})`
                                        : ''}
                                </p>
                                <ul className="text-xs text-gray-600 grid grid-cols-2 gap-1">
                                    <li>
                                        {tm('bFileIdMergeCntAppt')}: {preview.counts.beautyAppointments}
                                    </li>
                                    <li>
                                        {tm('bFileIdMergeCntSales')}: {preview.counts.sales}
                                    </li>
                                </ul>
                                {preview.warnings.map((w, i) => (
                                    <p key={i} className="text-amber-800 text-xs">
                                        {w}
                                    </p>
                                ))}
                            </div>
                        )}
                    </PercentBodyModalScrollBody>
                    <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex flex-wrap gap-3 shrink-0 justify-end">
                        <button
                            type="button"
                            disabled={mergeBusy}
                            onClick={() => {
                                setMergeGroup(null);
                                setPreview(null);
                            }}
                            className="rounded-2xl border-2 border-slate-200 px-4 py-2 text-sm font-bold uppercase tracking-wider text-slate-600 hover:bg-slate-100"
                        >
                            {tm('cancel')}
                        </button>
                        {!preview ? (
                            <button
                                type="button"
                                disabled={mergeBusy || !keepId}
                                onClick={() => void loadPreview()}
                                className="rounded-2xl bg-violet-600 px-4 py-2 text-sm font-bold uppercase tracking-wider text-white hover:bg-violet-700 disabled:opacity-50"
                            >
                                {mergeBusy ? tm('bLoading') : tm('bFileIdMergePreview')}
                            </button>
                        ) : (
                            <button
                                type="button"
                                disabled={mergeBusy}
                                onClick={() => void doMerge()}
                                className="rounded-2xl bg-red-600 px-4 py-2 text-sm font-bold uppercase tracking-wider text-white hover:bg-red-700 disabled:opacity-50"
                            >
                                {mergeBusy ? tm('bSaving') : tm('bFileIdMergeDo')}
                            </button>
                        )}
                    </div>
                </PercentBodyModal>
            )}
        </>
    );
}
