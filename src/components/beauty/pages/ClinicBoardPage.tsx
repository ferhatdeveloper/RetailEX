import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { ChevronLeft, ChevronRight, Share2 } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { DevExDataGrid } from '../../shared/DevExDataGrid';
import { beautyService } from '../../../services/beautyService';
import type { BeautyAppointment, BeautyCustomer, BeautyService, BeautySpecialist } from '../../../types/beauty';
import { beautyAppointmentDateKey, formatLocalYmd, getWeekRangeLocal } from '../../../utils/dateLocal';
import { beautyAptVisibleOnSchedule } from '../../../utils/beautyAppointmentVisibility';
import { formatMoneyInteger } from '../../../utils/formatMoney';
import { ShareOpenSlotsStudio } from '../share-slots/ShareOpenSlotsStudio';
import { ClinicBoardMenu } from './ClinicBoardMenu';
import { ClinicDayBoard } from './ClinicDayBoard';
import {
    clinicBoardSideOpen,
    clinicBoardWeekYmds,
    parseClinicBoardYmd,
    shiftClinicBoardYmd,
    type ClinicBoardSection,
} from './clinicBoardModel';

const SURVEY_KEY = 'retailex.clinicBoard.survey';
const CRM_KEY = 'retailex.clinicBoard.crm';

function readFlag(key: string): boolean {
    try {
        return localStorage.getItem(key) === '1';
    } catch {
        return false;
    }
}

function writeFlag(key: string, on: boolean): void {
    try {
        localStorage.setItem(key, on ? '1' : '0');
    } catch {
        /* gizli mod */
    }
}

async function settle<T>(task: Promise<T>, fallback: T): Promise<{ value: T; failed: boolean }> {
    try {
        const value = await task;
        return { value: Array.isArray(value) ? value : fallback, failed: false };
    } catch {
        return { value: fallback, failed: true };
    }
}

export function ClinicBoardPage({ onOpenShareSlots }: { onOpenShareSlots?: () => void }) {
    void onOpenShareSlots;
    const { tm } = useLanguage();
    const locale = tm('localeCode');
    const [section, setSection] = useState<ClinicBoardSection>('appointment');
    const [anchor, setAnchor] = useState(() => formatLocalYmd(new Date()));
    const [mode, setMode] = useState<'day' | 'week'>('day');
    const [staffFilter, setStaffFilter] = useState('');
    const [search, setSearch] = useState('');
    const [surveyOn, setSurveyOn] = useState(() => readFlag(SURVEY_KEY));
    const [crmOn, setCrmOn] = useState(() => readFlag(CRM_KEY));
    const [staff, setStaff] = useState<BeautySpecialist[]>([]);
    const [services, setServices] = useState<BeautyService[]>([]);
    const [customers, setCustomers] = useState<BeautyCustomer[]>([]);
    const [appointments, setAppointments] = useState<BeautyAppointment[]>([]);
    const [loadFailed, setLoadFailed] = useState(false);
    const [shareOpen, setShareOpen] = useState(false);

    const range = useMemo(() => {
        if (mode === 'week') return getWeekRangeLocal(parseClinicBoardYmd(anchor));
        return { start: anchor, end: anchor };
    }, [mode, anchor]);

    const loadCatalog = useCallback(async () => {
        const [specs, svcs, custs] = await Promise.all([
            settle(beautyService.getSpecialists(), [] as BeautySpecialist[]),
            settle(beautyService.getServices(), [] as BeautyService[]),
            settle(beautyService.getCustomers(), [] as BeautyCustomer[]),
        ]);
        setStaff(specs.value);
        setServices(svcs.value);
        setCustomers(custs.value);
        setLoadFailed(specs.failed || svcs.failed || custs.failed);
    }, []);

    useEffect(() => {
        void loadCatalog();
    }, [loadCatalog]);

    useEffect(() => {
        let cancel = false;
        beautyService
            .getAppointmentsInRange(range.start, range.end)
            .then((rows) => {
                if (!cancel) setAppointments(Array.isArray(rows) ? rows : []);
            })
            .catch(() => {
                if (!cancel) {
                    setAppointments([]);
                    setLoadFailed(true);
                }
            });
        return () => {
            cancel = true;
        };
    }, [range.start, range.end]);

    const boardAppointments = useMemo(() => {
        const query = search.trim().toLocaleLowerCase('tr-TR');
        if (!query) return appointments;
        return appointments.filter((apt) =>
            `${apt.customer_name ?? ''} ${apt.service_name ?? ''}`.toLocaleLowerCase('tr-TR').includes(query),
        );
    }, [appointments, search]);

    const dayAppointments = useMemo(
        () => appointments.filter((apt) => beautyAppointmentDateKey(apt) === anchor && beautyAptVisibleOnSchedule(apt)),
        [appointments, anchor],
    );
    const completedToday = dayAppointments.filter((apt) => String(apt.status ?? '').toLowerCase() === 'completed');
    const crmRows = useMemo(() => {
        const seen = new Set<string>();
        const rows: { id: string; name: string; phone: string }[] = [];
        for (const apt of dayAppointments) {
            const id = String(apt.customer_id || apt.client_id || apt.customer_name || apt.id);
            if (seen.has(id)) continue;
            seen.add(id);
            const card = customers.find((customer) => customer.id === (apt.customer_id || apt.client_id));
            const name = (apt.customer_name || card?.name || '').trim();
            if (!name) continue;
            rows.push({ id, name, phone: card?.phone || apt.customer_phone || '' });
        }
        return rows;
    }, [dayAppointments, customers]);

    const sideOpen = section === 'appointment' && clinicBoardSideOpen(surveyOn, crmOn);
    const weekDays = mode === 'week' ? clinicBoardWeekYmds(anchor) : [];
    const dateLabel = parseClinicBoardYmd(anchor).toLocaleDateString(locale, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        weekday: 'long',
    });
    const step = (dir: number) => setAnchor((current) => shiftClinicBoardYmd(current, dir * (mode === 'week' ? 7 : 1)));

    const activeStaff = staff.filter((person) => person.is_active !== false);
    const serviceRows = services.filter((service) => service.is_active !== false);
    const customerRows = customers.filter((customer) => customer.is_active !== false && !customer.merged_into_id);

    const customerColumns = useMemo<ColumnDef<BeautyCustomer>[]>(() => [
        { accessorKey: 'name', header: tm('bClinicBoardColName'), id: 'name' },
        { accessorKey: 'phone', header: tm('bClinicBoardColPhone'), id: 'phone' },
    ], [tm]);
    const staffColumns = useMemo<ColumnDef<BeautySpecialist>[]>(() => [
        { accessorKey: 'name', header: tm('bClinicBoardColName'), id: 'name' },
        { accessorKey: 'specialty', header: tm('bClinicBoardColSpecialty'), id: 'specialty' },
        { accessorKey: 'phone', header: tm('bClinicBoardColPhone'), id: 'phone' },
    ], [tm]);
    const serviceColumns = useMemo<ColumnDef<BeautyService>[]>(() => [
        { accessorKey: 'name', header: tm('bClinicBoardColName'), id: 'name' },
        { accessorKey: 'duration_min', header: tm('bClinicBoardColDuration'), id: 'duration_min' },
        {
            id: 'price',
            accessorKey: 'price',
            header: tm('bClinicBoardColPrice'),
            cell: ({ row }) => formatMoneyInteger(row.original.price, locale),
        },
    ], [tm, locale]);

    return (
        <div data-testid="clinic-board-page" className="flex h-full min-h-[560px] bg-[#f3f5f9] text-slate-800">
            <ClinicBoardMenu section={section} onChange={setSection} />
            <div className="flex min-w-0 flex-1 flex-col">
                <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[#e6eaf0] bg-white px-3 py-2">
                    <div className="flex items-center gap-1">
                        <button
                            type="button"
                            aria-label={tm('bClinicBoardPrev')}
                            onClick={() => step(-1)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#e6eaf0] text-slate-500 hover:bg-slate-50"
                        >
                            <ChevronLeft size={16} aria-hidden />
                        </button>
                        <div className="min-w-[180px] rounded-lg border border-[#e6eaf0] px-3 py-1.5 text-center text-sm font-semibold text-slate-800">
                            {dateLabel}
                        </div>
                        <button
                            type="button"
                            aria-label={tm('bClinicBoardNext')}
                            onClick={() => step(1)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#e6eaf0] text-slate-500 hover:bg-slate-50"
                        >
                            <ChevronRight size={16} aria-hidden />
                        </button>
                        <button
                            type="button"
                            onClick={() => setAnchor(formatLocalYmd(new Date()))}
                            className="h-8 rounded-lg border border-[#e6eaf0] px-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                        >
                            {tm('bClinicBoardToday')}
                        </button>
                    </div>
                    <select
                        aria-label={tm('bClinicBoardAllStaff')}
                        value={staffFilter}
                        onChange={(event) => setStaffFilter(event.target.value)}
                        className="h-8 rounded-lg border border-[#e6eaf0] bg-white px-2 text-xs font-semibold text-slate-700"
                    >
                        <option value="">{tm('bClinicBoardAllStaff')}</option>
                        {activeStaff.map((person) => (
                            <option key={person.id} value={person.id}>{person.name}</option>
                        ))}
                    </select>
                    {section === 'appointment' && (
                        <button
                            type="button"
                            data-testid="clinic-board-share-slots"
                            onClick={() => setShareOpen(true)}
                            className="flex h-8 items-center gap-1.5 rounded-lg border border-[#e6eaf0] px-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                        >
                            <Share2 size={14} aria-hidden />
                            {tm('bClinicBoardShareSlots')}
                        </button>
                    )}
                    <div className="ml-auto flex flex-wrap items-center gap-2">
                        <div className="flex rounded-lg bg-[#f3f5f9] p-0.5">
                            {(['day', 'week'] as const).map((value) => (
                                <button
                                    key={value}
                                    type="button"
                                    onClick={() => setMode(value)}
                                    className={`h-7 rounded-md px-3 text-xs font-semibold ${
                                        mode === value ? 'bg-[#e8f1ff] text-[#1d4ed8]' : 'text-slate-500'
                                    }`}
                                >
                                    {tm(value === 'day' ? 'bClinicBoardDay' : 'bClinicBoardWeek')}
                                </button>
                            ))}
                        </div>
                        <button
                            type="button"
                            aria-pressed={surveyOn}
                            onClick={() => {
                                const next = !surveyOn;
                                setSurveyOn(next);
                                writeFlag(SURVEY_KEY, next);
                            }}
                            className={`h-8 rounded-lg border px-2.5 text-xs font-semibold ${
                                surveyOn ? 'border-[#bfdbfe] bg-[#e8f1ff] text-[#1d4ed8]' : 'border-[#e6eaf0] text-slate-500'
                            }`}
                        >
                            {tm('bClinicBoardSurvey')}
                        </button>
                        <button
                            type="button"
                            aria-pressed={crmOn}
                            onClick={() => {
                                const next = !crmOn;
                                setCrmOn(next);
                                writeFlag(CRM_KEY, next);
                            }}
                            className={`h-8 rounded-lg border px-2.5 text-xs font-semibold ${
                                crmOn ? 'border-[#bfdbfe] bg-[#e8f1ff] text-[#1d4ed8]' : 'border-[#e6eaf0] text-slate-500'
                            }`}
                        >
                            {tm('bClinicBoardCrm')}
                        </button>
                    </div>
                    {section === 'appointment' && (
                        <input
                            type="search"
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder={tm('bClinicBoardSearch')}
                            className="h-8 w-full max-w-xs rounded-lg border border-[#e6eaf0] bg-[#f8fafc] px-3 text-xs outline-none focus:border-[#93c5fd] sm:w-56"
                        />
                    )}
                </header>
                {mode === 'week' && section === 'appointment' && (
                    <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-[#e6eaf0] bg-white px-3 py-2">
                        {weekDays.map((day) => {
                            const active = day === anchor;
                            const label = parseClinicBoardYmd(day).toLocaleDateString(locale, { weekday: 'short', day: 'numeric' });
                            return (
                                <button
                                    key={day}
                                    type="button"
                                    onClick={() => setAnchor(day)}
                                    className={`h-8 shrink-0 rounded-lg px-2.5 text-xs font-semibold ${
                                        active ? 'bg-[#e8f1ff] text-[#1d4ed8]' : 'text-slate-500 hover:bg-slate-50'
                                    }`}
                                >
                                    {label}
                                </button>
                            );
                        })}
                    </div>
                )}
                {loadFailed && (
                    <p className="shrink-0 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800">{tm('bClinicBoardLoadError')}</p>
                )}
                <div className="flex min-h-0 flex-1">
                    <div className="min-h-0 min-w-0 flex-1">
                        {section === 'appointment' && (
                            <ClinicDayBoard
                                dayYmd={anchor}
                                staff={staff}
                                appointments={boardAppointments}
                                staffFilterId={staffFilter}
                                unassignedLabel={tm('bClinicBoardUnassigned')}
                                appointmentWord={tm('bClinicBoardApptShort')}
                                emptySlotWord={tm('bClinicBoardEmptySlot')}
                                locale={locale}
                            />
                        )}
                        {section === 'customer' && (
                            <div className="h-full min-h-[480px] p-3">
                                <DevExDataGrid
                                    data={customerRows}
                                    columns={customerColumns}
                                    pageSize={50}
                                    enableFiltering
                                    enablePagination
                                    autoFooterSums={false}
                                    height="100%"
                                    storageNamespace="clinicBoardCustomers"
                                />
                            </div>
                        )}
                        {section === 'staff' && (
                            <div className="h-full min-h-[480px] p-3">
                                <DevExDataGrid
                                    data={activeStaff}
                                    columns={staffColumns}
                                    pageSize={50}
                                    enableFiltering
                                    enablePagination
                                    autoFooterSums={false}
                                    height="100%"
                                    storageNamespace="clinicBoardStaff"
                                    onRowClick={(row) => {
                                        setStaffFilter(row.id);
                                        setSection('appointment');
                                    }}
                                />
                            </div>
                        )}
                        {section === 'service' && (
                            <div className="h-full min-h-[480px] p-3">
                                <DevExDataGrid
                                    data={serviceRows}
                                    columns={serviceColumns}
                                    pageSize={50}
                                    enableFiltering
                                    enablePagination
                                    autoFooterSums={false}
                                    height="100%"
                                    storageNamespace="clinicBoardServices"
                                />
                            </div>
                        )}
                    </div>
                    {sideOpen && (
                        <aside
                            data-testid="clinic-board-side"
                            className="flex w-72 shrink-0 flex-col gap-3 overflow-y-auto border-l border-[#e6eaf0] bg-white p-3"
                        >
                            {surveyOn && (
                                <section>
                                    <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">{tm('bClinicBoardSurvey')}</h2>
                                    {completedToday.length === 0 ? (
                                        <p className="text-xs text-slate-400">{tm('bClinicBoardSurveyEmpty')}</p>
                                    ) : (
                                        <ul className="space-y-2">
                                            {completedToday.map((apt) => (
                                                <li key={apt.id} className="rounded-lg border border-[#e6eaf0] px-2 py-1.5 text-xs">
                                                    <p className="font-semibold text-slate-800">{apt.customer_name}</p>
                                                    <p className="text-slate-500">{apt.service_name}</p>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </section>
                            )}
                            {crmOn && (
                                <section>
                                    <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">{tm('bClinicBoardCrm')}</h2>
                                    {crmRows.length === 0 ? (
                                        <p className="text-xs text-slate-400">{tm('bClinicBoardCrmEmpty')}</p>
                                    ) : (
                                        <ul className="space-y-2">
                                            {crmRows.map((row) => (
                                                <li key={row.id} className="rounded-lg border border-[#e6eaf0] px-2 py-1.5 text-xs">
                                                    <p className="font-semibold text-slate-800">{row.name}</p>
                                                    {row.phone ? <p className="text-slate-500">{row.phone}</p> : null}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </section>
                            )}
                        </aside>
                    )}
                </div>
            </div>
            {shareOpen && section === 'appointment' && (
                <ShareOpenSlotsStudio
                    staff={staff}
                    anchorYmd={anchor}
                    onClose={() => setShareOpen(false)}
                />
            )}
        </div>
    );
}
