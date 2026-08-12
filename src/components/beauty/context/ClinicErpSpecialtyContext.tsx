import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useFirmaDonem } from '../../../contexts/FirmaDonemContext';
import type { ClinicErpSpecialty } from '../../../types/beauty';
import { isClinicErpSpecialty } from '../../../types/beauty';

function storageKey(firmNr: string): string {
    const fn = String(firmNr || '001').trim().padStart(3, '0');
    return `retailex_clinic_erp_specialty_${fn}`;
}

function readStored(firmNr: string): ClinicErpSpecialty {
    try {
        const raw = localStorage.getItem(storageKey(firmNr));
        if (raw && isClinicErpSpecialty(raw)) return raw;
    } catch {
        /* ignore */
    }
    return 'beauty_default';
}

type ClinicErpSpecialtyContextValue = {
    firmNr: string;
    specialty: ClinicErpSpecialty;
    setSpecialty: (s: ClinicErpSpecialty) => void;
};

const ClinicErpSpecialtyContext = createContext<ClinicErpSpecialtyContextValue | null>(null);

export function ClinicErpSpecialtyProvider({ children }: { children: React.ReactNode }) {
    const { selectedFirm } = useFirmaDonem();
    const firmNr = useMemo(() => {
        const raw = selectedFirm?.firm_nr ?? selectedFirm?.id;
        const d = String(raw ?? '').replace(/\D/g, '');
        if (!d) return '001';
        return d.length >= 3 ? d : d.padStart(3, '0');
    }, [selectedFirm?.firm_nr, selectedFirm?.id]);

    const [specialty, setSpecialtyState] = useState<ClinicErpSpecialty>(() => readStored(firmNr));

    useEffect(() => {
        setSpecialtyState(readStored(firmNr));
    }, [firmNr]);

    const setSpecialty = useCallback(
        (s: ClinicErpSpecialty) => {
            try {
                localStorage.setItem(storageKey(firmNr), s);
            } catch {
                /* ignore */
            }
            setSpecialtyState(s);
        },
        [firmNr]
    );

    const value = useMemo(
        () => ({ firmNr, specialty, setSpecialty }),
        [firmNr, specialty, setSpecialty]
    );

    return (
        <ClinicErpSpecialtyContext.Provider value={value}>{children}</ClinicErpSpecialtyContext.Provider>
    );
}

export function useClinicErpSpecialty(): ClinicErpSpecialtyContextValue {
    const ctx = useContext(ClinicErpSpecialtyContext);
    if (!ctx) {
        throw new Error('useClinicErpSpecialty must be used within ClinicErpSpecialtyProvider');
    }
    return ctx;
}

/** ManagementModule içi gömülü Beauty (provider yok) için güvenli okuma */
export function useClinicErpSpecialtyOptional(): ClinicErpSpecialtyContextValue | null {
    return useContext(ClinicErpSpecialtyContext);
}
