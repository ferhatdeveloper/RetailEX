import { useEffect, useMemo, useState } from 'react';
import { useLanguage } from '../../../contexts/LanguageContext';
import {
    CLINIC_FONT_EVENT,
    CLINIC_FONT_FAMILY_IDS,
    CLINIC_FONT_FAMILY_NAME_KEY,
    CLINIC_FONT_SIZE_IDS,
    CLINIC_FONT_SIZE_NAME_KEY,
    CLINIC_FONT_STACK,
    CLINIC_MENU_PALETTE_EVENT,
    type ClinicCustomPaletteFailure,
    clinicFontPx,
    listClinicMenuPalettes,
    removeClinicCustomPalette,
    saveClinicCustomPalette,
    useClinicMenuFont,
    useClinicMenuPalette,
    writeClinicFont,
    writeClinicMenuPalette,
} from '../clinicMenuPalette';

const FAILURE_KEY: Record<ClinicCustomPaletteFailure, string> = {
    name: 'bClinicCustomPaletteNeedName',
    color: 'bClinicCustomPaletteBadColor',
    contrast: 'bClinicCustomPaletteContrast',
    accent: 'bClinicCustomPaletteAccentContrast',
    limit: 'bClinicCustomPaletteLimit',
    store: 'bClinicCustomPaletteStore',
};

/** V1 mor menünün ayar ekranı. V2 beyaz şerit ayrı kabuktur. */
export function ClinicMenuPalettePicker({ variant = 'banner' }: { variant?: 'banner' | 'rail' }) {
    const { tm } = useLanguage();
    const current = useClinicMenuPalette();
    const font = useClinicMenuFont();
    const rail = variant === 'rail';
    const [paletteTick, setPaletteTick] = useState(0);
    const [draftName, setDraftName] = useState('');
    const [draftBackground, setDraftBackground] = useState('#102033');
    const [draftAccent, setDraftAccent] = useState('#9f1239');
    const [draftText, setDraftText] = useState('#f8fafc');
    const [failure, setFailure] = useState<ClinicCustomPaletteFailure | null>(null);
    const palettes = useMemo(() => listClinicMenuPalettes(), [paletteTick]);

    useEffect(() => {
        const sync = () => setPaletteTick((tick) => tick + 1);
        window.addEventListener(CLINIC_MENU_PALETTE_EVENT, sync);
        window.addEventListener(CLINIC_FONT_EVENT, sync);
        window.addEventListener('storage', sync);
        return () => {
            window.removeEventListener(CLINIC_MENU_PALETTE_EVENT, sync);
            window.removeEventListener(CLINIC_FONT_EVENT, sync);
            window.removeEventListener('storage', sync);
        };
    }, []);

    const shellStyle = {
        fontFamily: font.stack,
        ['--clinic-font-scale' as string]: String(font.scale),
    };
    const titleSize = 'calc(13px * var(--clinic-font-scale, 1))';
    const hintSize = 'calc(12px * var(--clinic-font-scale, 1))';

    return (
        <section
            data-testid="clinic-menu-palette-picker"
            data-font-family={font.family}
            data-font-size={font.size}
            className={rail ? 'shrink-0' : 'shrink-0 rounded-xl border border-slate-200 bg-white p-4'}
            style={rail ? { ...shellStyle, padding: '16px 16px 4px' } : shellStyle}
        >
            <h2
                className={rail ? 'font-semibold text-[#252f4a]' : 'font-bold text-slate-800'}
                style={{ fontSize: titleSize }}
            >
                {tm('bClinicMenuPaletteTitle')}
            </h2>
            <p
                className={rail ? 'mt-1 leading-snug text-[#7e8299]' : 'mt-1 leading-5 text-slate-500'}
                style={{ fontSize: hintSize }}
            >
                {tm('bClinicMenuPaletteHint')}
            </p>
            <div className={rail ? 'mt-3 grid grid-cols-2 gap-1.5' : 'mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5'}>
                {palettes.map((palette) => {
                    const selected = palette.id === current.id;
                    const label = palette.customName ?? tm(palette.nameKey);
                    return (
                        <div key={palette.id} style={{ position: 'relative', minWidth: 0 }}>
                            <button
                                type="button"
                                data-testid={`clinic-menu-palette-${palette.id}`}
                                aria-pressed={selected}
                                onClick={() => writeClinicMenuPalette(palette.id)}
                                className="overflow-hidden rounded-lg text-left"
                                style={{
                                    width: '100%',
                                    border: selected ? `2px solid ${palette.accent}` : '1px solid #e2e8f0',
                                    background: '#fff',
                                    padding: 0,
                                    cursor: 'pointer',
                                }}
                            >
                                <span
                                    aria-hidden
                                    style={{
                                        display: 'block',
                                        background: palette.sidebar,
                                        borderBottom: `1px solid ${palette.sidebarLine}`,
                                        padding: 8,
                                    }}
                                >
                                    <span
                                        style={{
                                            display: 'block',
                                            height: 14,
                                            borderRadius: 4,
                                            background: palette.accent,
                                            borderLeft: `3px solid ${palette.accentEdge}`,
                                        }}
                                    />
                                    <span
                                        style={{
                                            display: 'block',
                                            height: 8,
                                            marginTop: 4,
                                            borderRadius: 4,
                                            background: palette.item,
                                            opacity: 0.85,
                                        }}
                                    />
                                </span>
                                <span
                                    style={{
                                        display: 'block',
                                        padding: palette.customName ? '6px 22px 7px 8px' : '6px 8px 7px',
                                        fontSize: hintSize,
                                        fontWeight: 700,
                                        color: '#1e293b',
                                    }}
                                >
                                    {label}
                                </span>
                            </button>
                            {palette.customName ? (
                                <button
                                    type="button"
                                    data-testid={`clinic-custom-palette-remove-${palette.id}`}
                                    aria-label={tm('bClinicCustomPaletteRemove')}
                                    onClick={() => removeClinicCustomPalette(palette.id)}
                                    style={{
                                        position: 'absolute',
                                        top: 4,
                                        right: 4,
                                        width: 18,
                                        height: 18,
                                        borderRadius: 9,
                                        border: '0',
                                        background: 'rgba(15,23,42,0.55)',
                                        color: '#fff',
                                        fontSize: 12,
                                        lineHeight: '18px',
                                        cursor: 'pointer',
                                    }}
                                >
                                    ×
                                </button>
                            ) : null}
                        </div>
                    );
                })}
            </div>

            <form
                data-testid="clinic-custom-palette-form"
                className="mt-3"
                onSubmit={(event) => {
                    event.preventDefault();
                    const result = saveClinicCustomPalette({
                        name: draftName,
                        background: draftBackground,
                        accent: draftAccent,
                        text: draftText,
                    });
                    if (!result.ok) {
                        setFailure(result.reason);
                        return;
                    }
                    setFailure(null);
                    setDraftName('');
                }}
            >
                <h3 className="font-semibold text-[#252f4a]" style={{ fontSize: titleSize }}>
                    {tm('bClinicCustomPaletteTitle')}
                </h3>
                <p className="mt-1 leading-snug text-[#7e8299]" style={{ fontSize: hintSize }}>
                    {tm('bClinicCustomPaletteHint')}
                </p>
                <label className="mt-2 block font-semibold text-[#4b5675]" style={{ fontSize: hintSize }}>
                    {tm('bClinicCustomPaletteName')}
                    <input
                        data-testid="clinic-custom-palette-name"
                        value={draftName}
                        maxLength={40}
                        autoComplete="off"
                        onChange={(event) => setDraftName(event.target.value)}
                        className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1 text-[#1e293b]"
                        style={{ fontSize: hintSize }}
                    />
                </label>
                <div className="mt-2 grid grid-cols-3 gap-1.5">
                    <ColorField
                        testId="clinic-custom-palette-background"
                        label={tm('bClinicCustomPaletteBackground')}
                        value={draftBackground}
                        onChange={setDraftBackground}
                    />
                    <ColorField
                        testId="clinic-custom-palette-accent"
                        label={tm('bClinicCustomPaletteAccent')}
                        value={draftAccent}
                        onChange={setDraftAccent}
                    />
                    <ColorField
                        testId="clinic-custom-palette-text"
                        label={tm('bClinicCustomPaletteText')}
                        value={draftText}
                        onChange={setDraftText}
                    />
                </div>
                {failure ? (
                    <p role="alert" data-testid="clinic-custom-palette-error" className="mt-2 text-rose-700" style={{ fontSize: hintSize }}>
                        {tm(FAILURE_KEY[failure])}
                    </p>
                ) : null}
                <button
                    type="submit"
                    data-testid="clinic-custom-palette-save"
                    className="mt-2 w-full rounded-md font-semibold text-white"
                    style={{ background: current.accent, color: current.onAccent, fontSize: hintSize, padding: '6px 8px', border: 0, cursor: 'pointer' }}
                >
                    {tm('bClinicCustomPaletteSave')}
                </button>
            </form>

            <div data-testid="clinic-font-settings" className="mt-3 pb-2">
                <h3 className="font-semibold text-[#252f4a]" style={{ fontSize: titleSize }}>
                    {tm('bClinicFontTitle')}
                </h3>
                <p className="mt-2 font-semibold text-[#4b5675]" style={{ fontSize: hintSize }}>
                    {tm('bClinicFontFamily')}
                </p>
                <div className="mt-1 grid grid-cols-2 gap-1.5">
                    {CLINIC_FONT_FAMILY_IDS.map((family) => {
                        const selected = font.family === family;
                        return (
                            <button
                                key={family}
                                type="button"
                                data-testid={`clinic-font-family-${family}`}
                                aria-pressed={selected}
                                onClick={() => writeClinicFont({ family })}
                                className="rounded-md text-left"
                                style={{
                                    fontFamily: CLINIC_FONT_STACK[family],
                                    fontSize: hintSize,
                                    fontWeight: 700,
                                    padding: '6px 8px',
                                    border: selected ? `2px solid ${current.accent}` : '1px solid #e2e8f0',
                                    background: '#fff',
                                    color: '#1e293b',
                                    cursor: 'pointer',
                                }}
                            >
                                {tm(CLINIC_FONT_FAMILY_NAME_KEY[family])}
                            </button>
                        );
                    })}
                </div>
                <p className="mt-2 font-semibold text-[#4b5675]" style={{ fontSize: hintSize }}>
                    {tm('bClinicFontSize')}
                </p>
                <div className="mt-1 grid grid-cols-2 gap-1.5">
                    {CLINIC_FONT_SIZE_IDS.map((size) => {
                        const selected = font.size === size;
                        return (
                            <button
                                key={size}
                                type="button"
                                data-testid={`clinic-font-size-${size}`}
                                aria-pressed={selected}
                                onClick={() => writeClinicFont({ size })}
                                className="rounded-md"
                                style={{
                                    fontSize: clinicFontPx(12, size),
                                    fontWeight: 700,
                                    padding: '6px 8px',
                                    border: selected ? `2px solid ${current.accent}` : '1px solid #e2e8f0',
                                    background: '#fff',
                                    color: '#1e293b',
                                    cursor: 'pointer',
                                }}
                            >
                                {tm(CLINIC_FONT_SIZE_NAME_KEY[size])}
                            </button>
                        );
                    })}
                </div>
            </div>
        </section>
    );
}

function ColorField({
    testId,
    label,
    value,
    onChange,
}: {
    testId: string;
    label: string;
    value: string;
    onChange: (value: string) => void;
}) {
    return (
        <label className="font-semibold text-[#4b5675]" style={{ fontSize: 'calc(11px * var(--clinic-font-scale, 1))' }}>
            {label}
            <input
                data-testid={testId}
                type="color"
                value={value}
                aria-label={label}
                onChange={(event) => onChange(event.target.value)}
                className="mt-1 block h-8 w-full cursor-pointer rounded-md border border-slate-200 bg-white p-0.5"
            />
        </label>
    );
}
