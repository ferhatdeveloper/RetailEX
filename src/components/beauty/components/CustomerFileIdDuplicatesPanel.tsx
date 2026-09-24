import React, { useMemo, useState } from 'react';
import { AlertTriangle, GitMerge, Hash, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '../../../contexts/LanguageContext';
import type { BeautyCustomer } from '../../../types/beauty';
import {
    executeCustomerMerge,
    findDuplicateFileIdGroups,
    previewCustomerMerge,
    reassignUniqueFileId,
    type CustomerMergePreview,
    type DuplicateFileIdGroup,
} from '../../../services/api/customerMerge';
import { PercentBodyModal, PercentBodyModalScrollBody } from '../../shared/PercentBodyModal';
import { confirm as confirmDialog } from '../../shared/ConfirmDialog';

type Props = {
    customers: BeautyCustomer[];
    onChanged: () => Promise<void> | void;
};

export function CustomerFileIdDuplicatesPanel({ customers, onChanged }: Props) {
    const { tm } = useLanguage();
    const groups = useMemo(() => findDuplicateFileIdGroups(customers), [customers]);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [mergeGroup, setMergeGroup] = useState<DuplicateFileIdGroup | null>(null);
    const [keepId, setKeepId] = useState<string | null>(null);
    const [preview, setPreview] = useState<CustomerMergePreview | null>(null);
    const [mergeBusy, setMergeBusy] = useState(false);

    if (groups.length === 0) return null;

    const openMerge = (g: DuplicateFileIdGroup) => {
        setMergeGroup(g);
        setKeepId(g.customers[0]?.id ?? null);
        setPreview(null);
    };

    const loadPreview = async () => {
        if (!mergeGroup || !keepId) return;
        const source = mergeGroup.customers.find(c => c.id !== keepId);
        if (!source) {
            toast.error(tm('bFileIdMergeNeedTwo'));
            return;
        }
        setMergeBusy(true);
        try {
            const p = await previewCustomerMerge(source.id, keepId);
            setPreview(p);
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : String(e));
        } finally {
            setMergeBusy(false);
        }
    };

    const doMerge = async () => {
        if (!preview) return;
        const ok = await confirmDialog({
            title: tm('bFileIdMergeConfirmTitle'),
            description: tm('bFileIdMergeConfirmMsg')
                .replace('{{source}}', preview.source.name ?? '')
                .replace('{{target}}', preview.target.name ?? ''),
            confirmLabel: tm('bFileIdMergeDo'),
            cancelLabel: tm('cancel'),
            variant: 'danger',
        });
        if (!ok) return;
        setMergeBusy(true);
        try {
            await executeCustomerMerge(preview.source.id, preview.target.id, {
                notes: `file_id duplicate merge ${preview.source.file_id}`,
            });
            toast.success(tm('bFileIdMergeOk'));
            setMergeGroup(null);
            setPreview(null);
            await onChanged();
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : String(e));
        } finally {
            setMergeBusy(false);
        }
    };

    const doReassign = async (customerId: string) => {
        const ok = await confirmDialog({
            title: tm('bFileIdReassignTitle'),
            description: tm('bFileIdReassignMsg'),
            confirmLabel: tm('bFileIdReassignDo'),
            cancelLabel: tm('cancel'),
        });
        if (!ok) return;
        setBusyId(customerId);
        try {
            const r = await reassignUniqueFileId(customerId);
            toast.success(
                tm('bFileIdReassignOk')
                    .replace('{{old}}', r.oldFileId || '—')
                    .replace('{{new}}', r.newFileId),
            );
            await onChanged();
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : String(e));
        } finally {
            setBusyId(null);
        }
    };

    return (
        <>
            <div className="mx-4 mt-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 shrink-0">
                <div className="flex items-start gap-2 mb-2">
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                        <p className="text-sm font-semibold text-amber-900">
                            {tm('bFileIdDupTitle')} ({groups.length})
                        </p>
                        <p className="text-xs text-amber-800 mt-0.5">{tm('bFileIdDupHint')}</p>
                    </div>
                </div>
                <div className="space-y-3 max-h-56 overflow-y-auto">
                    {groups.map(g => (
                        <div
                            key={g.fileKey}
                            className="rounded-lg border border-amber-200 bg-white px-3 py-2"
                        >
                            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                                <span className="inline-flex items-center gap-1 text-sm font-bold text-violet-700 tabular-nums">
                                    <Hash className="w-3.5 h-3.5" />
                                    {tm('custColFileNo')}: {g.customers[0]?.file_id ?? g.fileNum}
                                    <span className="text-xs font-normal text-gray-500">
                                        ({g.customers.length})
                                    </span>
                                </span>
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
                                        className="flex flex-wrap items-center justify-between gap-2 text-sm"
                                    >
                                        <div className="min-w-0">
                                            <span className="font-medium text-gray-900">{c.name}</span>
                                            <span className="text-gray-500 text-xs ml-2">
                                                {c.phone || '—'}
                                            </span>
                                        </div>
                                        <button
                                            type="button"
                                            disabled={busyId === c.id}
                                            onClick={() => void doReassign(c.id)}
                                            className="inline-flex items-center gap-1 rounded border border-gray-200 px-2 py-0.5 text-[11px] font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                                        >
                                            {busyId === c.id ? (
                                                <Loader2 className="w-3 h-3 animate-spin" />
                                            ) : null}
                                            {tm('bFileIdReassignDo')}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
            </div>

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
                            {tm('bFileIdMergeOpen')} — {tm('custColFileNo')}{' '}
                            {mergeGroup.customers[0]?.file_id}
                        </h3>
                        <p className="text-sm text-violet-100 mt-1">{tm('bFileIdMergePickKeep')}</p>
                    </div>
                    <PercentBodyModalScrollBody className="p-6 space-y-4">
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
                                        name="keepCustomer"
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
                                            {c.phone || '—'} · {c.code || c.id.slice(0, 8)}
                                        </p>
                                    </div>
                                </label>
                            ))}
                        </div>

                        {preview && (
                            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm space-y-2">
                                <p>
                                    <span className="font-semibold">{preview.source.name}</span>
                                    {' → '}
                                    <span className="font-semibold">{preview.target.name}</span>
                                </p>
                                <ul className="text-xs text-gray-600 grid grid-cols-2 gap-1">
                                    <li>
                                        {tm('bFileIdMergeCntAppt')}: {preview.counts.beautyAppointments}
                                    </li>
                                    <li>
                                        {tm('bFileIdMergeCntBeauty')}:{' '}
                                        {preview.counts.beautyCustomerIdRows}
                                    </li>
                                    <li>
                                        {tm('bFileIdMergeCntSales')}: {preview.counts.sales}
                                    </li>
                                    <li>
                                        {tm('bFileIdMergeCntCash')}: {preview.counts.cashLines}
                                    </li>
                                </ul>
                                {preview.warnings.map((w, i) => (
                                    <p key={i} className="text-amber-800 text-xs flex gap-1">
                                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
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
