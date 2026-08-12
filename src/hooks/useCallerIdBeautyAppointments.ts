import { useEffect, useState } from 'react';
import type { BeautyAppointment } from '../types/beauty';
import { beautyService } from '../services/beautyService';

/**
 * Caller ID ile eşleşen müşterinin güzellik randevu geçmişi (son N kayıt).
 */
export function useCallerIdBeautyAppointments(customerId: string | undefined | null, enabled: boolean) {
    const [appointments, setAppointments] = useState<BeautyAppointment[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!enabled || !customerId) {
            setAppointments([]);
            setError(null);
            setLoading(false);
            return;
        }
        let cancelled = false;
        setLoading(true);
        setError(null);
        beautyService
            .getAppointmentsByCustomer(customerId)
            .then((rows) => {
                if (!cancelled) {
                    setAppointments(Array.isArray(rows) ? rows.slice(0, 12) : []);
                }
            })
            .catch((e: unknown) => {
                if (!cancelled) {
                    const msg = e && typeof e === 'object' && 'message' in e ? String((e as Error).message) : String(e);
                    setError(msg);
                    setAppointments([]);
                }
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [customerId, enabled]);

    return { appointments, loading, error };
}
