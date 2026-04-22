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
}

export function FirmSelector({ triggerVariant = 'topbar' }: FirmSelectorProps) {
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
                    'flex items-center gap-2 rounded transition-colors shrink-0',
                    triggerVariant === 'topbar' &&
                        'text-sm bg-white/10 hover:bg-white/20 text-white px-3 py-2',
                    triggerVariant === 'clinic' &&
                        'text-xs h-8 px-2 sm:px-2.5 border border-slate-200 bg-white hover:bg-violet-50 hover:border-violet-200 text-slate-700 font-semibold shadow-sm'
                )}
                onClick={() => setIsOpen(true)}
            >
                <Building2 className={cn('h-4 w-4', triggerVariant === 'clinic' && 'text-violet-700')} />
                <span className="hidden md:inline max-w-[140px] truncate">
                    {selectedFirm?.name || selectedFirm?.firm_nr || 'Firma Seç'}
                </span>
                <span className="md:hidden">
                    {selectedFirm?.firm_nr || '---'}
                </span>
                <span className={triggerVariant === 'topbar' ? 'text-blue-200' : 'text-violet-300'}>•</span>
                <Calendar className={cn('h-3.5 w-3.5', triggerVariant === 'clinic' && 'text-violet-600')} />
                <span className="hidden sm:inline whitespace-nowrap">
                    {selectedPeriod?.nr ? `Dönem ${selectedPeriod.nr}` : 'Dönem Seç'}
                </span>
                <ChevronDown className="h-3 w-3 opacity-50" />
            </Button>

            <Dialog open={isOpen} onOpenChange={setIsOpen}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Firma ve Dönem Seçimi</DialogTitle>
                        <DialogDescription>
                            Çalışmak istediğiniz firmayı ve dönemi seçin
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-6 py-4">
                        {/* Firma Seçimi */}
                        <div className="space-y-3">
                            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                Firma
                            </label>
                            <div className="space-y-2 max-h-48 overflow-y-auto border rounded-lg p-2">
                                {loading ? (
                                    <div className="text-center py-4 text-sm text-gray-500">
                                        Yükleniyor...
                                    </div>
                                ) : firms.length === 0 ? (
                                    <div className="text-center py-4 text-sm text-gray-500">
                                        Firma bulunamadı
                                    </div>
                                ) : (
                                    firms.map((firm) => (
                                        <button
                                            key={firm.id || firm.firm_nr}
                                            onClick={() => selectFirm(firm.id || firm.firm_nr)}
                                            className={`w-full flex items-center justify-between p-3 rounded-lg transition-colors ${(selectedFirm?.id === firm.id || (firm.firm_nr && selectedFirm?.firm_nr === firm.firm_nr))
                                                ? 'bg-blue-100 dark:bg-blue-900 border-2 border-blue-500'
                                                : 'bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 border-2 border-transparent'
                                                }`}
                                        >
                                            <div className="text-left">
                                                <p className="font-medium text-gray-900 dark:text-gray-100">
                                                    {firm.name}
                                                </p>
                                                <p className="text-sm text-gray-600 dark:text-gray-400">
                                                    Kod: {firm.firm_nr}
                                                </p>
                                            </div>
                                            {(selectedFirm?.id === firm.id || (firm.firm_nr && selectedFirm?.firm_nr === firm.firm_nr)) && (
                                                <Check className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                                            )}
                                        </button>
                                    ))
                                )}
                            </div>
                        </div>

                        {/* Dönem Seçimi */}
                        <div className="space-y-3">
                            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                Dönem
                            </label>
                            <div className="space-y-2 max-h-48 overflow-y-auto border rounded-lg p-2">
                                {loading ? (
                                    <div className="text-center py-4 text-sm text-gray-500">
                                        Yükleniyor...
                                    </div>
                                ) : periods.length === 0 ? (
                                    <div className="text-center py-4 text-sm text-gray-500">
                                        Dönem bulunamadı
                                    </div>
                                ) : (
                                    periods.map((period) => (
                                        <button
                                            key={period.id || period.nr}
                                            onClick={() => selectPeriod(period.id || period.nr)}
                                            className={`w-full flex items-center justify-between p-3 rounded-lg transition-colors ${(selectedPeriod?.id === period.id || (period.nr && selectedPeriod?.nr === period.nr))
                                                ? 'bg-green-100 dark:bg-green-900 border-2 border-green-500'
                                                : 'bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 border-2 border-transparent'
                                                }`}
                                        >
                                            <div className="text-left">
                                                <p className="font-medium text-gray-900 dark:text-gray-100">
                                                    Dönem {period.nr}
                                                </p>
                                                <p className="text-sm text-gray-600 dark:text-gray-400">
                                                    {formatIsoDateTr(period.beg_date)} - {formatIsoDateTr(period.end_date)}
                                                </p>
                                                {period.active && (
                                                    <span className="inline-block mt-1 px-2 py-0.5 bg-green-100 dark:bg-green-800 text-green-700 dark:text-green-200 text-xs rounded">
                                                        ✓ Aktif
                                                    </span>
                                                )}
                                            </div>
                                            {(selectedPeriod?.id === period.id || (period.nr && selectedPeriod?.nr === period.nr)) && (
                                                <Check className="h-5 w-5 text-green-600 dark:text-green-400" />
                                            )}
                                        </button>
                                    ))
                                )}
                            </div>
                        </div>

                        {/* Seçili Bilgiler */}
                        {selectedFirm && selectedPeriod && (
                            <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
                                <p className="font-medium text-blue-900 dark:text-blue-100 mb-2">
                                    ✓ Seçili Konfigürasyon
                                </p>
                                <div className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
                                    <p><strong>Firma:</strong> {selectedFirm.name} ({selectedFirm.firm_nr})</p>
                                    <p><strong>Dönem:</strong> {selectedPeriod.nr} ({formatIsoDateTr(selectedPeriod.beg_date)} - {formatIsoDateTr(selectedPeriod.end_date)})</p>
                                    <p><strong>Durum:</strong> {selectedPeriod.active ? '✅ Açık' : '❌ Kapalı'}</p>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setIsOpen(false)}>
                            Kapat
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}



