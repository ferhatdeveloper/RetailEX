import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { PercentBodyModal, PercentBodyModalScrollBody } from '../../shared/PercentBodyModal';
import {
    buildClinicBoardShareText,
    clinicBoardWhatsAppShareUrl,
    type ClinicBoardShareSlot,
} from './clinicBoardModel';

type Props = {
    title: string;
    dayLabel: string;
    slots: ClinicBoardShareSlot[];
    heading: string;
    emptyLabel: string;
    copyLabel: string;
    copiedLabel: string;
    whatsAppLabel: string;
    closeLabel: string;
    onClose: () => void;
};

export function ClinicBoardShareDialog({
    title,
    dayLabel,
    slots,
    heading,
    emptyLabel,
    copyLabel,
    copiedLabel,
    whatsAppLabel,
    closeLabel,
    onClose,
}: Props) {
    const [picked, setPicked] = useState<Set<string>>(() => new Set(slots.map((slot) => slot.id)));
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        setPicked(new Set(slots.map((slot) => slot.id)));
        setCopied(false);
    }, [slots]);

    const chosen = useMemo(
        () => slots.filter((slot) => picked.has(slot.id)),
        [slots, picked],
    );
    const text = useMemo(
        () => buildClinicBoardShareText(dayLabel, chosen, heading),
        [dayLabel, chosen, heading],
    );
    const groups = useMemo(() => {
        const order: string[] = [];
        const map = new Map<string, ClinicBoardShareSlot[]>();
        for (const slot of slots) {
            if (!map.has(slot.staffId)) {
                map.set(slot.staffId, []);
                order.push(slot.staffId);
            }
            map.get(slot.staffId)!.push(slot);
        }
        return order.map((id) => ({ id, name: map.get(id)![0].staffName, slots: map.get(id)! }));
    }, [slots]);

    const toggle = (id: string) => {
        setCopied(false);
        setPicked((current) => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const copyText = async () => {
        if (!chosen.length) return;
        try {
            await navigator.clipboard.writeText(text);
        } catch {
            const area = document.createElement('textarea');
            area.value = text;
            document.body.appendChild(area);
            area.select();
            document.execCommand('copy');
            area.remove();
        }
        setCopied(true);
    };

    const openWhatsApp = () => {
        if (!chosen.length) return;
        window.open(clinicBoardWhatsAppShareUrl(text), '_blank', 'noopener,noreferrer');
    };

    return (
        <PercentBodyModal onClose={onClose} size="compact" ariaLabel={title}>
            <div className="flex shrink-0 items-center justify-between bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4 text-white">
                <h2 className="text-base font-bold">{title}</h2>
                <button
                    type="button"
                    onClick={onClose}
                    aria-label={closeLabel}
                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/15 hover:bg-white/25"
                >
                    <X size={16} aria-hidden />
                </button>
            </div>
            <div className="shrink-0 border-b border-slate-100 px-6 py-3 text-sm font-semibold text-slate-700">
                {dayLabel}
            </div>
            <PercentBodyModalScrollBody className="max-h-[min(50vh,28rem)] px-6 py-4">
                {slots.length === 0 ? (
                    <p className="text-sm text-slate-500">{emptyLabel}</p>
                ) : (
                    <div className="space-y-4">
                        {groups.map((group) => (
                            <section key={group.id}>
                                <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">{group.name}</h3>
                                <div className="flex flex-wrap gap-2">
                                    {group.slots.map((slot) => {
                                        const on = picked.has(slot.id);
                                        return (
                                            <button
                                                key={slot.id}
                                                type="button"
                                                aria-pressed={on}
                                                onClick={() => toggle(slot.id)}
                                                className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold tabular-nums ${
                                                    on
                                                        ? 'border-blue-600 bg-blue-600 text-white'
                                                        : 'border-slate-200 bg-white text-slate-500'
                                                }`}
                                            >
                                                {slot.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </section>
                        ))}
                    </div>
                )}
            </PercentBodyModalScrollBody>
            <div className="flex shrink-0 gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4">
                <button
                    type="button"
                    onClick={() => { void copyText(); }}
                    disabled={chosen.length === 0}
                    className="rounded-2xl border-2 border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                >
                    {copied ? copiedLabel : copyLabel}
                </button>
                <button
                    type="button"
                    onClick={openWhatsApp}
                    disabled={chosen.length === 0}
                    className="rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                    {whatsAppLabel}
                </button>
            </div>
        </PercentBodyModal>
    );
}
