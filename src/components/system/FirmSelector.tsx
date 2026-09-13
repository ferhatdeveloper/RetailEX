import { useState } from 'react';
import { Building2, ChevronDown, Calendar, Check } from 'lucide-react';
import { useFirmaDonem } from '../../contexts/FirmaDonemContext';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { formatIsoDateTr } from '../../utils/localCalendarDate';
import { cn } from '../ui/utils';

export type FirmSelectorTriggerVariant = 'topbar' | 'clinic';

interface FirmSelectorProps {
    /** clinic: açık arka planlı üst çubuk (Güzellik kabuğu); topbar: mavi ERP çubuğu */
    triggerVariant?: FirmSelectorTriggerVariant;
    /** Mobil üst çubuk: daha dar tetikleyici */
    compactMobile?: boolean;
}

export function FirmSelector({ triggerVariant = 'topbar', compactMobile = false }: FirmSelectorProps) {
    const [isOpen, setIsOpen] = useState(false);
    const {
        selectedFirm,
        selectedPeriod,
        firms,
        periods,
        selectFirm,
        selectPeriod,
        loading
    } = useFirmaDonem();

    return (
        <>
            <Button
                variant="ghost"
                size="sm"
                className={cn(
                    'flex items-center gap-2 rounded transition-colors',
                    !(triggerVariant === 'topbar' && compactMobile) && 'shrink-0',
                    triggerVariant === 'topbar' &&
                        'text-sm bg-white/10 hover:bg-white/20 text-white px-3 py-2',
                    triggerVariant === 'topbar' &&
                        compactMobile &&
                        'h-9 min-w-0 w-full max-w-full shrink gap-1 px-2 text-[11px] overflow-hidden',
                    triggerVariant === 'clinic' &&
                        'text-xs h-8 px-2 sm:px-2.5 border border-slate-200 bg-white hover:bg-violet-50 hover:border-violet-200 text-slate-700 font-semibold shadow-sm'
                )}
                onClick={() => setIsOpen(true)}
            >
                <Building2
                    className={cn(
                        compactMobile && triggerVariant === 'topbar' ? 'h-3.5 w-3.5 shrink-0' : 'h-4 w-4',
                        triggerVariant === 'clinic' && 'text-violet-700'
                    )}
                />
                <span className="hidden md:inline max-w-[140px] truncate">
                    {selectedFirm?.name || selectedFirm?.firm_nr || 'Firma Seç'}
                </span>
                <span className="min-w-0 truncate md:hidden">
                    {selectedFirm?.firm_nr || '---'}
                </span>
                <span className={triggerVariant === 'topbar' ? 'text-blue-200' : 'text-violet-300'}>•</span>
                <Calendar className={cn('h-3.5 w-3.5', triggerVariant === 'clinic' && 'text-violet-600')} />
                <span className="hidden sm:inline whitespace-nowrap">
                    {selectedPeriod?.nr ? `Dönem ${selectedPeriod.nr}` : 'Dönem Seç'}
                </span>
                <ChevronDown className={cn('opacity-50 shrink-0', compactMobile && triggerVariant === 'topbar' ? 'h-2.5 w-2.5' : 'h-3 w-3')} />
            </Button>

            <Dialog open={isOpen} onOpenChange={setIsOpen}>
                <DialogContent className="sm:max-w-sm gap-0 p-0 overflow-hidden">
                    <DialogHeader className="px-4 pt-3 pb-2 border-b border-slate-100 dark:border-slate-800 space-y-0.5">
                        <DialogTitle className="text-base">Firma ve Dönem</DialogTitle>
                        <DialogDescription className="text-xs">
                            Firma ve dönem seçin
                        </DialogDescription>
                    </DialogHeader>

                    <div className="px-3 py-2.5 space-y-3">
                        {/* Firma — kompakt liste */}
                        <div className="space-y-1">
                            <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                Firma
                            </label>
                            <div className="max-h-40 overflow-y-auto rounded-md border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
                                {loading ? (
                                    <div className="px-2.5 py-2 text-xs text-slate-500">Yükleniyor…</div>
                                ) : firms.length === 0 ? (
                                    <div className="px-2.5 py-2 text-xs text-slate-500">Firma yok</div>
                                ) : (
                                    firms.map((firm) => {
                                        const selected =
                                            selectedFirm?.id === firm.id ||
                                            (!!firm.firm_nr && selectedFirm?.firm_nr === firm.firm_nr);
                                        return (
                                            <button
                                                key={firm.id || firm.firm_nr}
                                                type="button"
                                                onClick={() => {
                                                    const fid = firm.id ?? firm.firm_nr;
                                                    if (fid != null && fid !== '') selectFirm(fid);
                                                }}
                                                className={cn(
                                                    'w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-sm transition-colors',
                                                    selected
                                                        ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-900 dark:text-blue-100'
                                                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/80 text-slate-800 dark:text-slate-100'
                                                )}
                                            >
                                                <span className="w-8 shrink-0 font-mono text-[11px] text-slate-500">
                                                    {firm.firm_nr}
                                                </span>
                                                <span className="min-w-0 flex-1 truncate font-medium">
                                                    {firm.name}
                                                </span>
                                                {selected && (
                                                    <Check className="h-3.5 w-3.5 shrink-0 text-blue-600" />
                                                )}
                                            </button>
                                        );
                                    })
                                )}
                            </div>
                        </div>

                        {/* Dönem — kompakt */}
                        <div className="space-y-1">
                            <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                Dönem
                            </label>
                            <div className="max-h-28 overflow-y-auto rounded-md border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
                                {loading ? (
                                    <div className="px-2.5 py-2 text-xs text-slate-500">Yükleniyor…</div>
                                ) : periods.length === 0 ? (
                                    <div className="px-2.5 py-2 text-xs text-slate-500">Dönem yok</div>
                                ) : (
                                    periods.map((period) => {
                                        const selected =
                                            selectedPeriod?.id === period.id ||
                                            (!!period.nr && selectedPeriod?.nr === period.nr);
                                        return (
                                            <button
                                                key={period.id || period.nr}
                                                type="button"
                                                onClick={() => selectPeriod(period.id || period.nr)}
                                                className={cn(
                                                    'w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-sm transition-colors',
                                                    selected
                                                        ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-900 dark:text-emerald-100'
                                                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/80 text-slate-800 dark:text-slate-100'
                                                )}
                                            >
                                                <span className="min-w-0 flex-1 truncate font-medium">
                                                    Dönem {period.nr}
                                                    <span className="ml-1.5 font-normal text-[11px] text-slate-500">
                                                        {formatIsoDateTr(period.beg_date)}–{formatIsoDateTr(period.end_date)}
                                                    </span>
                                                </span>
                                                {period.active && (
                                                    <span className="shrink-0 text-[10px] font-semibold text-emerald-600">
                                                        Aktif
                                                    </span>
                                                )}
                                                {selected && (
                                                    <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                                                )}
                                            </button>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/40">
                        <p className="min-w-0 truncate text-[11px] text-slate-500">
                            {selectedFirm && selectedPeriod
                                ? `${selectedFirm.firm_nr} · ${selectedFirm.name} · D${selectedPeriod.nr}`
                                : 'Seçim yapılmadı'}
                        </p>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-7 shrink-0 px-3 text-xs"
                            onClick={() => setIsOpen(false)}
                        >
                            Kapat
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
