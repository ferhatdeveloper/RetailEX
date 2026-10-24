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

/** V1 mor menünün ayar ekranı. V2 beyaz şerit ayrı kabuktur. `page` ana alanda tam sayfadır. */
export function ClinicMenuPalettePicker({ variant = 'banner' }: { variant?: 'banner' | 'rail' | 'page' }) {
    const { tm } = useLanguage();
    const current = useClinicMenuPalette();
    const font = useClinicMenuFont();
    const rail = variant === 'rail';
    const page = variant === 'page';
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
    const titleSize = page
        ? 'calc(15px * var(--clinic-font-scale, 1))'
        : rail
            ? '13px'
            : 'calc(13px * var(--clinic-font-scale, 1))';
    const hintSize = page
        ? 'calc(13px * var(--clinic-font-scale, 1))'
        : rail
            ? '11px'
            : 'calc(12px * var(--clinic-font-scale, 1))';
    const choiceGrid = page
        ? 'mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4'
        : rail
            ? 'mt-1 grid grid-cols-4 gap-1'
            : 'mt-1 grid grid-cols-2 gap-1';

    return (
        <section
            data-testid="clinic-menu-palette-picker"
            data-variant={variant}
            data-font-family={font.family}
            data-font-size={font.size}
            className={
                page
                    ? 'grid items-start gap-4 lg:grid-cols-2'
                    : rail
                        ? 'shrink-0'
                        : 'shrink-0 rounded-xl border border-slate-200 bg-white p-4'
            }
            style={page ? shellStyle : rail ? { ...shellStyle, padding: '10px 10px 8px' } : shellStyle}
        >
            <h2
                className={
                    page
                        ? 'font-semibold text-[#252f4a] lg:col-span-2'
                        : rail
                            ? 'font-semibold text-[#252f4a]'
                            : 'font-bold text-slate-800'
                }
                style={{ fontSize: titleSize, lineHeight: page ? '22px' : rail ? '16px' : undefined, margin: 0 }}
            >
                {tm('bClinicMenuPaletteTitle')}
            </h2>
            <p
                className={
                    page
                        ? 'max-w-3xl leading-6 text-[#4b5675] lg:col-span-2'
                        : rail
                            ? 'mt-0.5 leading-snug text-[#7e8299]'
                            : 'mt-1 leading-5 text-slate-500'
                }
                style={page
                    ? { fontSize: hintSize, margin: 0 }
                    : rail
                    ? {
                        fontSize: hintSize,
                        lineHeight: '14px',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        margin: 0,
                    }
                    : { fontSize: hintSize }}
            >
                {tm('bClinicMenuPaletteHint')}
            </p>
            <div
                data-testid="clinic-menu-palette-presets"
                className={
                    page
                        ? 'grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5 lg:col-span-2'
                        : rail
                            ? 'mt-2 grid grid-cols-5 gap-1'
                            : 'mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5'
                }
            >
                {palettes.map((palette) => {
                    const selected = palette.id === current.id;
                    const label = palette.customName ?? tm(palette.nameKey);
                    return (
                        <div key={palette.id} style={{ display: 'flex', alignItems: 'stretch', gap: 4, minWidth: 0 }}>
                            <button
                                type="button"
                                data-testid={`clinic-menu-palette-${palette.id}`}
                                aria-pressed={selected}
                                onClick={() => writeClinicMenuPalette(palette.id)}
                                className="overflow-hidden rounded-md text-left"
                                style={{
                                    flex: 1,
                                    minWidth: 0,
                                    display: 'flex',
                                    alignItems: 'stretch',
                                    gap: 0,
                                    flexDirection: 'column',
                                    border: selected ? `2px solid ${palette.accent}` : '1px solid #e2e8f0',
                                    background: '#fff',
                                    padding: 0,
                                    cursor: 'pointer',
                                }}
                            >
                                <span
                                    aria-hidden
                                    style={rail
                                        ? {
                                            display: 'block',
                                            width: '100%',
                                            height: 10,
                                            flexShrink: 0,
                                            background: palette.sidebar,
                                            boxShadow: `inset 0 -3px 0 ${palette.accent}`,
                                        }
                                        : {
                                            display: 'block',
                                            width: '100%',
                                            background: palette.sidebar,
                                            borderBottom: `1px solid ${palette.sidebarLine}`,
                                            padding: 8,
                                        }}
                                >
                                    {rail ? null : (
                                        <>
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
                                        </>
                                    )}
                                </span>
                                <span
                                    style={{
                                        display: 'block',
                                        minWidth: 0,
                                        flex: 1,
                                        padding: rail ? '3px 4px 4px' : '6px 8px 7px',
                                        fontSize: rail ? '10px' : hintSize,
                                        fontWeight: 700,
                                        lineHeight: rail ? '12px' : undefined,
                                        color: '#1e293b',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'normal',
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
                                        flexShrink: 0,
                                        alignSelf: 'center',
                                        border: '1px solid #fecdd3',
                                        borderRadius: 6,
                                        background: '#fff',
                                        color: '#be123c',
                                        fontSize: 11,
                                        fontWeight: 700,
                                        lineHeight: '14px',
                                        padding: '4px 6px',
                                        cursor: 'pointer',
                                    }}
                                >
                                    {tm('bClinicCustomPaletteRemove')}
                                </button>
                            ) : null}
                        </div>
                    );
                })}
            </div>

            <form
                data-testid="clinic-custom-palette-form"
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
                style={{
                    marginTop: page ? 0 : rail ? 8 : 12,
                    padding: page ? '16px 18px' : rail ? '6px 8px 8px' : '10px 12px',
                    border: page ? '1px solid #f1f1f4' : '1px solid #ddd6fe',
                    borderRadius: 8,
                    background: page ? '#fff' : '#faf7ff',
                }}
            >
                <h3 className="font-semibold text-[#252f4a]" style={{ fontSize: titleSize, lineHeight: '16px', margin: 0 }}>
                    {tm('bClinicCustomPaletteTitle')}
                </h3>
                <p
                    className="leading-snug text-[#7e8299]"
                    style={rail
                        ? { fontSize: '10px', lineHeight: '13px', margin: '2px 0 0', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }
                        : { fontSize: hintSize, marginTop: 4 }}
                >
                    {tm('bClinicCustomPaletteHint')}
                </p>
                <label className="mt-1.5 block font-semibold text-[#4b5675]" style={{ fontSize: hintSize }}>
                    {tm('bClinicCustomPaletteName')}
                    <input
                        data-testid="clinic-custom-palette-name"
                        value={draftName}
                        maxLength={40}
                        autoComplete="off"
                        onChange={(event) => setDraftName(event.target.value)}
                        className="mt-0.5 w-full rounded-md border border-slate-200 bg-white px-2 text-[#1e293b]"
                        style={{ fontSize: hintSize, height: page ? 36 : rail ? 26 : 32 }}
                    />
                </label>
                <div className={page ? 'mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3' : 'mt-1.5 grid grid-cols-3 gap-1'}>
                    <ColorField
                        compact={rail}
                        testId="clinic-custom-palette-background"
                        label={tm('bClinicCustomPaletteBackground')}
                        value={draftBackground}
                        onChange={setDraftBackground}
                    />
                    <ColorField
                        compact={rail}
                        testId="clinic-custom-palette-accent"
                        label={tm('bClinicCustomPaletteAccent')}
                        value={draftAccent}
                        onChange={setDraftAccent}
                    />
                    <ColorField
                        compact={rail}
                        testId="clinic-custom-palette-text"
                        label={tm('bClinicCustomPaletteText')}
                        value={draftText}
                        onChange={setDraftText}
                    />
                </div>
                {failure ? (
                    <p role="alert" data-testid="clinic-custom-palette-error" className="mt-1.5 text-rose-700" style={{ fontSize: hintSize }}>
                        {tm(FAILURE_KEY[failure])}
                    </p>
                ) : null}
                <button
                    type="submit"
                    data-testid="clinic-custom-palette-save"
                    className="mt-1.5 w-full rounded-md font-semibold"
                    style={{ background: current.accent, color: current.onAccent, fontSize: hintSize, padding: page ? '10px 16px' : rail ? '4px 8px' : '6px 8px', border: 0, cursor: 'pointer' }}
                >
                    {tm('bClinicCustomPaletteSave')}
                </button>
            </form>

            <div
                data-testid="clinic-font-settings"
                style={page
                    ? { marginTop: 0, padding: '16px 18px', border: '1px solid #f1f1f4', borderRadius: 8, background: '#fff' }
                    : { marginTop: rail ? 8 : 12 }}
            >
                <h3 className="font-semibold text-[#252f4a]" style={{ fontSize: titleSize, lineHeight: '16px', margin: 0 }}>
                    {tm('bClinicFontTitle')}
                </h3>
                <p className="mt-1.5 font-semibold text-[#4b5675]" style={{ fontSize: hintSize, marginBottom: 0 }}>
                    {tm('bClinicFontFamily')}
                </p>
                <div className={choiceGrid}>
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
                                    lineHeight: '14px',
                                    padding: page ? '8px 10px' : rail ? '3px 6px' : '6px 8px',
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
                <p className="mt-1.5 font-semibold text-[#4b5675]" style={{ fontSize: hintSize }}>
                    {tm('bClinicFontSize')}
                </p>
                <div className={choiceGrid}>
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
                                    fontSize: rail ? hintSize : clinicFontPx(12, size),
                                    fontWeight: 700,
                                    lineHeight: '14px',
                                    padding: page ? '8px 10px' : rail ? '3px 6px' : '6px 8px',
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
    compact = false,
}: {
    testId: string;
    label: string;
    value: string;
    onChange: (value: string) => void;
    compact?: boolean;
}) {
    return (
        <label className="font-semibold text-[#4b5675]" style={{ fontSize: compact ? 10 : 'calc(11px * var(--clinic-font-scale, 1))', lineHeight: compact ? '12px' : undefined }}>
            {label}
            <input
                data-testid={testId}
                type="color"
                value={value}
                aria-label={label}
                onChange={(event) => onChange(event.target.value)}
                className={compact
                    ? 'mt-0.5 block h-6 w-full cursor-pointer rounded-md border border-slate-200 bg-white p-0.5'
                    : 'mt-1 block h-8 w-full cursor-pointer rounded-md border border-slate-200 bg-white p-0.5'}
            />
        </label>
    );
}
