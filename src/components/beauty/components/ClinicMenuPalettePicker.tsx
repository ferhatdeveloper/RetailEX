import { useLanguage } from '../../../contexts/LanguageContext';
import {
    CLINIC_MENU_PALETTES,
    useClinicMenuPalette,
    writeClinicMenuPalette,
} from '../clinicMenuPalette';

/** V1 mor menünün ayar ekranı. V2 beyaz şerit ayrı kabuktur. */
export function ClinicMenuPalettePicker() {
    const { tm } = useLanguage();
    const current = useClinicMenuPalette();

    return (
        <section
            data-testid="clinic-menu-palette-picker"
            className="shrink-0 rounded-xl border border-slate-200 bg-white p-4"
        >
            <h2 className="text-sm font-bold text-slate-800">{tm('bClinicMenuPaletteTitle')}</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">{tm('bClinicMenuPaletteHint')}</p>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                {CLINIC_MENU_PALETTES.map((palette) => {
                    const selected = palette.id === current.id;
                    return (
                        <button
                            key={palette.id}
                            type="button"
                            data-testid={`clinic-menu-palette-${palette.id}`}
                            aria-pressed={selected}
                            onClick={() => writeClinicMenuPalette(palette.id)}
                            className="overflow-hidden rounded-lg text-left"
                            style={{
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
                                    padding: '6px 8px 7px',
                                    fontSize: 12,
                                    fontWeight: 700,
                                    color: '#1e293b',
                                }}
                            >
                                {tm(palette.nameKey)}
                            </span>
                        </button>
                    );
                })}
            </div>
        </section>
    );
}
