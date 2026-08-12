import { useEffect, useState } from 'react';
import { RestaurantService } from '../services/restaurant';

export interface CallerIdOrderPreview {
    id: string;
    order_no?: string;
    table_number?: string | null;
    opened_at?: string;
    status?: string;
    total_amount?: number | string | null;
    items?: unknown[] | null;
}

/**
 * Caller ID ile eşleşen müşterinin restoran sipariş geçmişi (son N kayıt).
 */
export function useCallerIdRestaurantOrders(customerId: string | undefined | null, enabled: boolean) {
    const [orders, setOrders] = useState<CallerIdOrderPreview[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!enabled || !customerId) {
            setOrders([]);
            setError(null);
            setLoading(false);
            return;
        }
        let cancelled = false;
        setLoading(true);
        setError(null);
        RestaurantService.getOrderHistory({ customerId, limit: 12 })
            .then((rows) => {
                if (!cancelled) {
                    setOrders(Array.isArray(rows) ? (rows as CallerIdOrderPreview[]) : []);
                }
            })
            .catch((e: unknown) => {
                if (!cancelled) {
                    const msg = e && typeof e === 'object' && 'message' in e ? String((e as Error).message) : String(e);
                    setError(msg);
                    setOrders([]);
                }
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [customerId, enabled]);

    return { orders, loading, error };
}
