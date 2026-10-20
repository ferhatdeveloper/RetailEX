import { useEffect, useState } from 'react';
import { Crown, ZoomIn, ZoomOut } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import {
    APP_ZOOM_EVENT,
    APP_ZOOM_MAX,
    APP_ZOOM_MIN,
    APP_ZOOM_STEP,
    publishAppZoomLevel,
    readAppZoomLevel,
} from '../../../utils/appZoomCompensation';
import { useClinicShellV2, writeClinicShellV2 } from '../clinicShellV2';

/** Dil ikonunun yanında: yakınlaştırma ve pembe V2 anahtarı. */
export function BeautyShellChromeButtons() {
    const { tm } = useLanguage();
    const v2 = useClinicShellV2();
    const [zoomLevel, setZoomLevel] = useState(readAppZoomLevel);

    useEffect(() => {
        const onZoom = (event: Event) => {
            const level = (event as CustomEvent<{ level?: number }>).detail?.level;
            if (typeof level === 'number') setZoomLevel(level);
        };
        window.addEventListener(APP_ZOOM_EVENT, onZoom);
        return () => window.removeEventListener(APP_ZOOM_EVENT, onZoom);
    }, []);

    const accent = v2 ? '#db2777' : '#7c3aed';

    return (
        <>
            <div
                className="flex items-center overflow-hidden rounded-md border bg-white"
                style={{ borderColor: '#e5e7eb', height: 32 }}
                role="group"
                aria-label={tm('uiZoom') || 'Yakınlaştırma'}
            >
                <button
                    type="button"
                    className="flex h-8 w-8 items-center justify-center text-slate-600 disabled:opacity-40"
                    disabled={zoomLevel <= APP_ZOOM_MIN}
                    title={tm('zoomOut') || 'Küçült'}
                    aria-label={tm('zoomOut') || 'Küçült'}
                    onClick={() => setZoomLevel(publishAppZoomLevel(zoomLevel - APP_ZOOM_STEP))}
                >
                    <ZoomOut size={14} aria-hidden />
                </button>
                <button
                    type="button"
                    className="h-8 min-w-10 px-1 text-[11px] font-bold text-slate-700"
                    title={tm('zoomReset') || 'Sıfırla (%100)'}
                    aria-label={tm('zoomReset') || 'Sıfırla'}
                    onClick={() => setZoomLevel(publishAppZoomLevel(100))}
                >
                    {zoomLevel}%
                </button>
                <button
                    type="button"
                    className="flex h-8 w-8 items-center justify-center text-slate-600 disabled:opacity-40"
                    disabled={zoomLevel >= APP_ZOOM_MAX}
                    title={tm('zoomIn') || 'Büyüt'}
                    aria-label={tm('zoomIn') || 'Büyüt'}
                    onClick={() => setZoomLevel(publishAppZoomLevel(zoomLevel + APP_ZOOM_STEP))}
                >
                    <ZoomIn size={14} aria-hidden />
                </button>
            </div>
            <button
                type="button"
                aria-pressed={v2}
                title={tm('bClinicV2Toggle')}
                aria-label={tm('bClinicV2Toggle')}
                onClick={() => writeClinicShellV2(!v2)}
                className="flex h-8 items-center gap-1 rounded-md border px-2 text-[11px] font-extrabold"
                style={{
                    borderColor: v2 ? accent : '#e5e7eb',
                    background: v2 ? accent : '#f9fafb',
                    color: v2 ? '#fff' : '#6b7280',
                }}
            >
                <Crown size={13} aria-hidden />
                V2
            </button>
        </>
    );
}
