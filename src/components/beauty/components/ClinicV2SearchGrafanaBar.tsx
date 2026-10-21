import { useMemo, useRef, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus, Search, X } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { DevExDataGrid } from '../../shared/DevExDataGrid';
import { PercentBodyModal, PercentBodyModalScrollBody } from '../../shared/PercentBodyModal';
import { GRAFANA_CATEGORY_LABELS, type GrafanaReadyReport } from '../../../utils/grafanaEmbed';
import {
    clinicGrafanaCards,
    clinicGrafanaCatalog,
    clinicGrafanaEmbedUrl,
    readClinicGrafanaPicks,
    writeClinicGrafanaPicks,
} from '../../../utils/clinicDashboardRich';
import { ClinicGrafanaCardFrame } from './ClinicGrafanaCardFrame';

const LINE = '#e6ebf2';
const BLUE = '#2563eb';

type PickRow = {
    id: string;
    name: string;
    folderUid: string;
};

function reportTitle(report: GrafanaReadyReport, english: boolean): string {
    return english ? report.titleEn : report.titleTr;
}

function folderOf(report: GrafanaReadyReport, english: boolean): string {
    const label = GRAFANA_CATEGORY_LABELS[report.category];
    if (!label) return String(report.category || '');
    return english ? label.en : label.tr;
}

export function ClinicV2SearchGrafanaBar({
    query,
    onQueryChange,
}: {
    query: string;
    onQueryChange: (value: string) => void;
}) {
    const { tm } = useLanguage();
    const english = String(tm('localeCode') || '').startsWith('en');
    const catalog = useMemo(() => clinicGrafanaCatalog(), []);
    const rows = useMemo<PickRow[]>(
        () =>
            catalog.map((report) => ({
                id: report.uid,
                name: reportTitle(report, english),
                folderUid: `${folderOf(report, english)} / ${report.uid}`,
            })),
        [catalog, english],
    );
    const columns = useMemo<ColumnDef<PickRow>[]>(
        () => [
            { id: 'name', accessorKey: 'name', header: tm('bClinicV2GrafanaColName') },
            { id: 'folderUid', accessorKey: 'folderUid', header: tm('bClinicV2GrafanaColFolder') },
        ],
        [tm],
    );
    const [picks, setPicks] = useState<string[]>(readClinicGrafanaPicks);
    const [open, setOpen] = useState(false);
    const [seed, setSeed] = useState<Record<string, boolean>>({});
    const [openTick, setOpenTick] = useState(0);
    const selectionRef = useRef<string[]>(picks);
    const cards = useMemo(() => clinicGrafanaCards(picks, catalog), [picks, catalog]);

    const openModal = () => {
        selectionRef.current = [...picks];
        setSeed(Object.fromEntries(picks.map((uid) => [uid, true])));
        setOpenTick((n) => n + 1);
        setOpen(true);
    };

    const saveModal = () => {
        const next = [...selectionRef.current];
        writeClinicGrafanaPicks(next);
        setPicks(next);
        setOpen(false);
    };

    const dropUid = (uid: string) => {
        const next = picks.filter((item) => item !== uid);
        writeClinicGrafanaPicks(next);
        setPicks(next);
    };

    return (
        <div className="flex flex-col gap-3">
            <section
                data-testid="clinic-v2-search-row"
                className="flex flex-wrap items-center gap-2 bg-white px-3 py-2"
                style={{ borderRadius: 16, border: `1px solid ${LINE}` }}
            >
                <span className="flex items-center gap-1 text-xs font-extrabold text-slate-600">
                    <Search size={14} aria-hidden />
                    {tm('bClinicV2SearchLabel')}
                </span>
                <input
                    type="search"
                    value={query}
                    onChange={(event) => onQueryChange(event.target.value)}
                    aria-label={tm('bClinicV2SearchLabel')}
                    placeholder={tm('bClinicV2SearchPlaceholder')}
                    className="min-w-[12rem] flex-1 rounded-lg border px-2 py-1.5 text-xs font-semibold outline-none"
                    style={{ borderColor: LINE }}
                />
            </section>

            <div data-testid="clinic-grafana-grid" className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {cards.map((report) => {
                    const title = reportTitle(report, english);
                    return (
                        <ClinicGrafanaCardFrame
                            key={report.uid}
                            uid={report.uid}
                            title={title}
                            onRemove={() => dropUid(report.uid)}
                        >
                            <iframe
                                title={title}
                                src={clinicGrafanaEmbedUrl(report, 'light')}
                                className="h-full w-full border-0"
                                allow="fullscreen"
                                referrerPolicy="no-referrer-when-downgrade"
                            />
                        </ClinicGrafanaCardFrame>
                    );
                })}
                <button
                    type="button"
                    data-testid="clinic-grafana-add"
                    onClick={openModal}
                    className="flex min-h-[11rem] w-full flex-col items-center justify-center gap-2 bg-white px-4 py-6 text-sm font-extrabold"
                    style={{ borderRadius: 12, border: '1px dashed #2563eb', color: BLUE, order: 1 }}
                >
                    <Plus size={28} aria-hidden />
                    <span>{tm('bClinicV2GrafanaAdd')}</span>
                </button>
            </div>

            {open ? (
                <PercentBodyModal onClose={() => setOpen(false)} size="wide" ariaLabel={tm('bClinicV2GrafanaButton')}>
                    <div className="flex shrink-0 items-center justify-between bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-4 text-white">
                        <h2 className="text-sm font-extrabold">{tm('bClinicV2GrafanaButton')}</h2>
                        <button type="button" onClick={() => setOpen(false)} className="rounded-md p-1" aria-label={tm('bClinicV2GrafanaCancel')}>
                            <X size={18} />
                        </button>
                    </div>
                    <PercentBodyModalScrollBody className="p-3">
                        <DevExDataGrid
                            key={openTick}
                            data={rows}
                            columns={columns}
                            enableSelection
                            selectedRowIds={seed}
                            onSelectionChange={(selected) => {
                                selectionRef.current = selected.map((row) => row.id);
                            }}
                            pageSize={50}
                            height={440}
                            enableExcelExport={false}
                            enablePrint={false}
                            enableRefresh={false}
                            autoFooterSums={false}
                            storageNamespace="clinicV2GrafanaPick"
                        />
                    </PercentBodyModalScrollBody>
                    <div className="flex shrink-0 justify-end gap-2 border-t border-slate-100 bg-slate-50/50 px-4 py-3">
                        <button
                            type="button"
                            onClick={() => setOpen(false)}
                            className="rounded-lg border px-3 py-1.5 text-xs font-bold"
                            style={{ borderColor: LINE }}
                        >
                            {tm('bClinicV2GrafanaCancel')}
                        </button>
                        <button
                            type="button"
                            data-testid="clinic-grafana-save"
                            onClick={saveModal}
                            className="rounded-lg px-3 py-1.5 text-xs font-extrabold text-white"
                            style={{ background: BLUE }}
                        >
                            {tm('bClinicV2GrafanaSave')}
                        </button>
                    </div>
                </PercentBodyModal>
            ) : null}
        </div>
    );
}
