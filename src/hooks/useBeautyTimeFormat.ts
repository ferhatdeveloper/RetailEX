import { useCallback, useEffect, useState } from 'react';
import {
    BEAUTY_TIME_FORMAT_EVENT,
    type BeautyTimeFormat,
    formatBeautyTime,
    getBeautyTimeFormat,
    setBeautyTimeFormat,
} from '../utils/beautyTimeFormat';

/** Güzellik randevu saati gösterim tercihi (24h / 12h AM-PM). */
export function useBeautyTimeFormat() {
    const [format, setFormatState] = useState<BeautyTimeFormat>(() => getBeautyTimeFormat());

    useEffect(() => {
        const sync = () => setFormatState(getBeautyTimeFormat());
        const onCustom = (e: Event) => {
            const detail = (e as CustomEvent<BeautyTimeFormat>).detail;
            if (detail === '12h' || detail === '24h') setFormatState(detail);
            else sync();
        };
        const onStorage = (e: StorageEvent) => {
            if (e.key === 'retailex.beauty.timeFormat') sync();
        };
        window.addEventListener(BEAUTY_TIME_FORMAT_EVENT, onCustom);
        window.addEventListener('storage', onStorage);
        return () => {
            window.removeEventListener(BEAUTY_TIME_FORMAT_EVENT, onCustom);
            window.removeEventListener('storage', onStorage);
        };
    }, []);

    const setFormat = useCallback((next: BeautyTimeFormat) => {
        setBeautyTimeFormat(next);
        setFormatState(next);
    }, []);

    const use12h = format === '12h';

    const formatTime = useCallback(
        (raw: string | null | undefined, fallback = '--:--') => formatBeautyTime(raw, format, fallback),
        [format],
    );

    return { format, setFormat, use12h, formatTime };
}
