import React, { useEffect, useMemo, useState } from 'react';
import { Repeat, MessageCircle, Loader2, ClipboardList, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useBeautyStore } from '../store/useBeautyStore';
import { beautyService } from '../../../services/beautyService';
import { normalizePhoneDigits } from '../../../services/messaging/clinicMessaging';
import type { BeautyPackagePurchase } from '../../../types/beauty';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/utils';
import '../ClinicStyles.css';

function buildWaUrl(phone: string, text: string): string {
    const digits = normalizePhoneDigits(phone).replace(/\D/g, '');
    return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export function MonthlySessionSeriesModule() {
    const { tm } = useLanguage();
    const {
        customers,
        packages,
        services,
        specialists,
        loadCustomers,
        loadPackages,
        loadServices,
        loadSpecialists,
        loadAppointments,
    } = useBeautyStore();

    const [tab, setTab] = useState<'plan' | 'report'>('plan');
    const [planMode, setPlanMode] = useState<'package' | 'service'>('package');
    const [submitting, setSubmitting] = useState(false);
    const [loadingReport, setLoadingReport] = useState(false);
    const [customerId, setCustomerId] = useState('');
    const [packageId, setPackageId] = useState('');
    const [serviceId, setServiceId] = useState('');
    const [sessionCount, setSessionCount] = useState(1);
    const [firstDate, setFirstDate] = useState(() => new Date().toISOString().slice(0, 10));
    const [specialistId, setSpecialistId] = useState('');
    const [useExistingPurchase, setUseExistingPurchase] = useState(false);
    const [existingPurchaseId, setExistingPurchaseId] = useState('');
    const [customerPurchases, setCustomerPurchases] = useState<BeautyPackagePurchase[]>([]);
    const [reportRows, setReportRows] = useState<Awaited<ReturnType<typeof beautyService.listMonthlySessionSeriesReport>>>([]);

    useEffect(() => {
        void loadCustomers();
        void loadPackages();
        void loadServices();
        void loadSpecialists();
    }, [loadCustomers, loadPackages, loadServices, loadSpecialists]);

    useEffect(() => {
        if (!customerId) {
            setCustomerPurchases([]);
            return;
        }
        beautyService.getCustomerPackages(customerId).then(setCustomerPurchases).catch(() => setCustomerPurchases([]));
    }, [customerId]);

    useEffect(() => {
        if (tab !== 'report') return;
        setLoadingReport(true);
        beautyService
            .listMonthlySessionSeriesReport()
            .then(setReportRows)
            .catch(e => {
                toast.error(String(e?.message || e));
                setReportRows([]);
            })
            .finally(() => setLoadingReport(false));
    }, [tab]);

    const pkgSessionsHint = useMemo(() => {
        const p = packages.find(x => x.id === packageId);
        return p ? p.total_sessions : null;
    }, [packages, packageId]);

    const handleCreate = async () => {
        if (!customerId) {
            toast.error(tm('bMonthlySeriesValidationCustomer'));
            return;
        }
        if (planMode === 'package') {
            if (!packageId) {
                toast.error(tm('bMonthlySeriesValidationCustomerPackage'));
                return;
            }
            if (useExistingPurchase && !existingPurchaseId) {
                toast.error(tm('bMonthlySeriesValidationPurchase'));
                return;
            }
        } else {
            if (!serviceId) {
                toast.error(tm('bMonthlySeriesValidationCustomerService'));
                return;
            }
            if (sessionCount < 1) {
                toast.error(tm('bMonthlySeriesValidationSessionCount'));
                return;
            }
        }
        setSubmitting(true);
        try {
            /** Saat iş kuralı: D-1 kesinleşir; DB’de yer tutucu */
            const provisionalTime = '09:00';
            const r = planMode === 'package'
                ? await beautyService.createMonthlySessionSeries({
                    customer_id: customerId,
                    package_id: packageId,
                    first_session_date: firstDate,
                    appointment_time: provisionalTime,
                    specialist_id: specialistId || undefined,
                    existing_package_purchase_id: useExistingPurchase ? existingPurchaseId : undefined,
                })
                : await beautyService.createMonthlySessionSeries({
                    customer_id: customerId,
                    service_id: serviceId,
                    session_count: sessionCount,
                    first_session_date: firstDate,
                    appointment_time: provisionalTime,
                    specialist_id: specialistId || undefined,
                });
            toast.success(tm('bMonthlySeriesCreatedToast').replace('{n}', String(r.appointment_ids.length)));
            await loadAppointments(firstDate);
            setTab('report');
            setLoadingReport(true);
            const rows = await beautyService.listMonthlySessionSeriesReport();
            setReportRows(rows);
            setLoadingReport(false);
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : String(e));
        } finally {
            setSubmitting(false);
        }
    };

    const sendApi = async (seriesId: string) => {
        const r = await beautyService.sendWhatsAppForNextSessionInSeries(seriesId);
        if (r.success) toast.success(tm('bMonthlySeriesWpSent'));
        else toast.error(r.error || tm('bMonthlySeriesWpFailed'));
    };

    const openWaMe = (phone: string | null, seriesId: string) => {
        if (!phone) {
            toast.error(tm('bMonthlySeriesNoPhone'));
            return;
        }
        const row = reportRows.find(x => x.session_series_id === seriesId);
        const next = row?.next_appointment_date || '';
        const msg = tm('bMonthlySeriesWaText')
            .replace('{date}', next)
            .replace('{customer}', row?.customer_name || '');
        window.open(buildWaUrl(phone, msg), '_blank', 'noopener,noreferrer');
    };

    return (
        <div className="p-6 space-y-6 bg-gray-50 min-h-screen">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
                        <Repeat className="text-purple-600" size={26} />
                        {tm('bMonthlySeriesTitle')}
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">{tm('bMonthlySeriesSubtitle')}</p>
                </div>
                <div className="flex gap-2">
                    <Button
                        variant={tab === 'plan' ? 'default' : 'outline'}
                        className={cn(tab === 'plan' && 'bg-purple-600 hover:bg-purple-700')}
                        onClick={() => setTab('plan')}
                    >
                        <Calendar size={16} className="mr-2" />
                        {tm('bMonthlySeriesTabPlan')}
                    </Button>
                    <Button
                        variant={tab === 'report' ? 'default' : 'outline'}
                        className={cn(tab === 'report' && 'bg-purple-600 hover:bg-purple-700')}
                        onClick={() => setTab('report')}
                    >
                        <ClipboardList size={16} className="mr-2" />
                        {tm('bMonthlySeriesTabReport')}
                    </Button>
                </div>
            </div>

            {tab === 'plan' && (
                <div className="bg-white rounded-[2rem] border border-gray-100 p-8 shadow-sm max-w-xl space-y-5">
                    <p className="text-sm text-gray-600">{tm('bMonthlySeriesPlanHelp')}</p>
                    <div className="flex flex-wrap gap-2">
                        <Button
                            type="button"
                            variant={planMode === 'package' ? 'default' : 'outline'}
                            size="sm"
                            className={cn(planMode === 'package' && 'bg-purple-600 hover:bg-purple-700')}
                            onClick={() => setPlanMode('package')}
                        >
                            {tm('bMonthlySeriesModePackage')}
                        </Button>
                        <Button
                            type="button"
                            variant={planMode === 'service' ? 'default' : 'outline'}
                            size="sm"
                            className={cn(planMode === 'service' && 'bg-purple-600 hover:bg-purple-700')}
                            onClick={() => setPlanMode('service')}
                        >
                            {tm('bMonthlySeriesModeService')}
                        </Button>
                    </div>
                    <label className="block">
                        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">{tm('bMonthlySeriesCustomer')}</span>
                        <select
                            value={customerId}
                            onChange={e => setCustomerId(e.target.value)}
                            className="mt-1 w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm"
                        >
                            <option value="">{tm('bMonthlySeriesSelect')}</option>
                            {customers.map(c => (
                                <option key={c.id} value={c.id}>{c.name}{c.phone ? ` — ${c.phone}` : ''}</option>
                            ))}
                        </select>
                    </label>
                    {planMode === 'package' && (
                        <>
                            <label className="block">
                                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">{tm('bMonthlySeriesPackage')}</span>
                                <select
                                    value={packageId}
                                    onChange={e => setPackageId(e.target.value)}
                                    className="mt-1 w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm"
                                >
                                    <option value="">{tm('bMonthlySeriesSelect')}</option>
                                    {packages.filter(p => p.is_active !== false).map(p => (
                                        <option key={p.id} value={p.id}>
                                            {p.name} ({p.total_sessions} {tm('bMonthlySeriesSessions')})
                                        </option>
                                    ))}
                                </select>
                            </label>
                            {pkgSessionsHint != null && (
                                <p className="text-xs text-purple-700 font-semibold">
                                    {tm('bMonthlySeriesSessionsNote').replace('{n}', String(pkgSessionsHint))}
                                </p>
                            )}
                        </>
                    )}
                    {planMode === 'service' && (
                        <>
                            <label className="block">
                                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">{tm('bMonthlySeriesService')}</span>
                                <select
                                    value={serviceId}
                                    onChange={e => {
                                        const id = e.target.value;
                                        setServiceId(id);
                                        const s = services.find(x => x.id === id);
                                        if (s) {
                                            setSessionCount(Math.max(1, Math.round(Number(s.default_sessions ?? 1))));
                                        }
                                    }}
                                    className="mt-1 w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm"
                                >
                                    <option value="">{tm('bMonthlySeriesSelect')}</option>
                                    {services.filter(s => s.is_active !== false).map(s => (
                                        <option key={s.id} value={s.id}>
                                            {s.name}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label className="block">
                                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">{tm('bMonthlySeriesSessionCount')}</span>
                                <input
                                    type="number"
                                    min={1}
                                    max={99}
                                    value={sessionCount}
                                    onChange={e => setSessionCount(Math.max(1, Math.min(99, parseInt(e.target.value, 10) || 1)))}
                                    className="mt-1 w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm"
                                />
                                <p className="text-xs text-gray-500 mt-1">{tm('bMonthlySeriesSessionCountHint')}</p>
                            </label>
                        </>
                    )}
                    <label className="block">
                        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">{tm('bMonthlySeriesFirstDate')}</span>
                        <input
                            type="date"
                            value={firstDate}
                            onChange={e => setFirstDate(e.target.value)}
                            className="mt-1 w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm"
                        />
                    </label>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 leading-relaxed">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">{tm('bMonthlySeriesTime')}</span>
                        {tm('bMonthlyTimePolicyD1')}
                    </div>
                    <label className="block">
                        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">{tm('bMonthlySeriesSpecialist')}</span>
                        <select
                            value={specialistId}
                            onChange={e => setSpecialistId(e.target.value)}
                            className="mt-1 w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm"
                        >
                            <option value="">{tm('bMonthlySeriesOptional')}</option>
                            {specialists.filter(s => s.is_active).map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                        </select>
                    </label>
                    {planMode === 'package' && (
                        <>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={useExistingPurchase}
                                    onChange={e => setUseExistingPurchase(e.target.checked)}
                                    className="rounded border-gray-300"
                                />
                                <span className="text-sm font-medium text-gray-700">{tm('bMonthlySeriesUseExisting')}</span>
                            </label>
                            {useExistingPurchase && (
                                <label className="block">
                                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">{tm('bMonthlySeriesPickPurchase')}</span>
                                    <select
                                        value={existingPurchaseId}
                                        onChange={e => setExistingPurchaseId(e.target.value)}
                                        className="mt-1 w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm"
                                    >
                                        <option value="">{tm('bMonthlySeriesSelect')}</option>
                                        {customerPurchases
                                            .filter(pp => !packageId || pp.package_id === packageId)
                                            .map(pp => (
                                                <option key={pp.id} value={pp.id}>
                                                    {pp.package_name || pp.package_id} — {tm('bMonthlySeriesRemaining')}: {pp.remaining_sessions}/{pp.total_sessions}
                                                </option>
                                            ))}
                                    </select>
                                </label>
                            )}
                        </>
                    )}
                    <Button
                        disabled={submitting}
                        className="w-full bg-purple-600 hover:bg-purple-700 text-white rounded-xl h-11 font-bold"
                        onClick={() => void handleCreate()}
                    >
                        {submitting ? <Loader2 className="animate-spin mr-2" size={18} /> : <Repeat size={18} className="mr-2" />}
                        {tm('bMonthlySeriesCreate')}
                    </Button>
                </div>
            )}

            {tab === 'report' && (
                <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden">
                    {loadingReport ? (
                        <div className="flex items-center justify-center py-24 gap-3 text-purple-600">
                            <Loader2 className="animate-spin" size={24} />
                            <span className="text-sm font-bold">{tm('bMonthlySeriesLoadingReport')}</span>
                        </div>
                    ) : reportRows.length === 0 ? (
                        <div className="py-16 text-center text-gray-400 text-sm font-medium">{tm('bMonthlySeriesEmpty')}</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-gray-100 bg-gray-50/80">
                                        <th className="text-left py-3 px-4 font-bold text-gray-600">{tm('bMonthlySeriesColCustomer')}</th>
                                        <th className="text-left py-3 px-4 font-bold text-gray-600">{tm('bMonthlySeriesColPackageOrService')}</th>
                                        <th className="text-left py-3 px-4 font-bold text-gray-600">{tm('bMonthlySeriesColProgress')}</th>
                                        <th className="text-left py-3 px-4 font-bold text-gray-600">{tm('bMonthlySeriesColNext')}</th>
                                        <th className="text-right py-3 px-4 font-bold text-gray-600">{tm('bMonthlySeriesColActions')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {reportRows.map(row => (
                                        <tr key={row.session_series_id} className="border-b border-gray-50 hover:bg-purple-50/40">
                                            <td className="py-3 px-4 font-medium text-gray-900">
                                                {row.customer_name || '—'}
                                                {row.phone && <div className="text-xs text-gray-500">{row.phone}</div>}
                                            </td>
                                            <td className="py-3 px-4 text-gray-700">{row.package_name || '—'}</td>
                                            <td className="py-3 px-4">
                                                {row.completed_sessions}/{row.total_sessions}
                                            </td>
                                            <td className="py-3 px-4 text-gray-700">
                                                {row.next_appointment_date
                                                    ? String(row.next_appointment_date).slice(0, 10)
                                                    : '—'}
                                            </td>
                                            <td className="py-3 px-4 text-right space-x-2">
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="rounded-lg text-xs font-bold border-green-200 text-green-700 hover:bg-green-50"
                                                    onClick={() => void sendApi(row.session_series_id)}
                                                >
                                                    <MessageCircle size={14} className="mr-1" />
                                                    {tm('bMonthlySeriesWpApi')}
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="rounded-lg text-xs font-bold text-gray-600"
                                                    onClick={() => openWaMe(row.phone, row.session_series_id)}
                                                >
                                                    {tm('bMonthlySeriesWpBrowser')}
                                                </Button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
