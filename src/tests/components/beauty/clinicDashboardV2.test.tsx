import { beforeEach, describe, expect, it, vi } from 'vitest';

class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
import { fireEvent, render, screen } from '@testing-library/react';
import { AppointmentStatus } from '../../../types/beauty';
import type { BeautyAppointment, BeautySpecialist } from '../../../types/beauty';
import { ClinicDashboardV2 } from '../../../components/beauty/components/ClinicDashboardV2';
import { translate, type Language } from '../../../locales/module-translations';
import {
    CLINIC_QUICK_LINKS,
    CLINIC_V2_GRAFANA_PICKS_KEY,
    buildClinicMonthSeries,
    clinicChartFetchBounds,
    clinicGrafanaCards,
    clinicGrafanaCatalog,
    clinicGrafanaEmbedUrl,
} from '../../../utils/clinicDashboardRich';

const harness = vi.hoisted(() => ({
    customers: [] as Array<{ id: string; name: string; is_active: boolean; created_at?: string }>,
}));

vi.mock('../../../services/beautyService', () => ({
    beautyService: {
        getAppointmentsInRange: () => new Promise(() => {}),
        getCustomers: () => Promise.resolve([]),
    },
}));

vi.mock('../../../components/beauty/store/useBeautyStore', () => ({
    useBeautyStore: (selector: (state: {
        customers: typeof harness.customers;
        loadCustomers: () => Promise<void>;
    }) => unknown) =>
        selector({
            customers: harness.customers,
            loadCustomers: async () => {},
        }),
}));

vi.mock('../../../contexts/LanguageContext', async () => {
    const actual = await vi.importActual<typeof import('../../../locales/module-translations')>(
        '../../../locales/module-translations',
    );
    return {
        useLanguage: () => ({
            language: 'tr',
            tm: (key: string) => actual.translate(key, 'tr'),
        }),
    };
});

const staff: BeautySpecialist[] = [
    { id: 'st-1', name: 'Roza', is_active: true, commission_rate: 0, color: '#2563eb' },
];

function apt(partial: Partial<BeautyAppointment> & Pick<BeautyAppointment, 'id' | 'service_name' | 'total_price'>): BeautyAppointment {
    return {
        customer_name: 'Nihat',
        appointment_date: '2026-10-20',
        appointment_time: '10:00',
        duration: 60,
        status: AppointmentStatus.SCHEDULED,
        is_package_session: false,
        staff_id: 'st-1',
        ...partial,
    };
}

const QUICK_LABELS = [
    'Randevu Takvimi',
    'Randevu Listesi',
    'Müşteriler',
    'Stok Yönetimi',
    'Laboratuvar',
    'Raporlar',
    'Şube Ayarları',
    'Online Randevu',
    'Bildirim Ayarları',
    'Kredi Yükle',
    'Yardım Merkezi',
    'Destek',
];

describe('ClinicDashboardV2', () => {
    beforeEach(() => {
        harness.customers = [];
        localStorage.removeItem(CLINIC_V2_GRAFANA_PICKS_KEY);
    });

    it('gün listesinde hizmet tutarını API değerinde gösterir', () => {
        render(
            <ClinicDashboardV2
                revenue={85000}
                appointmentCount={2}
                cancelledCount={0}
                todayStr="2026-10-20"
                specialists={staff}
                appointments={[
                    apt({ id: 'a1', service_name: 'HAIR CUT', total_price: 50000, appointment_time: '09:00' }),
                    apt({ id: 'a2', service_name: 'HAIR PINK COLOR', total_price: 60000, appointment_time: '11:00', customer_name: 'Leyla' }),
                ]}
            />,
        );
        expect(screen.getByText('İyi günler')).toBeTruthy();
        expect(screen.getAllByText('Bugün').length).toBeGreaterThan(0);
        expect(screen.getByText('Bugünkü randevu')).toBeTruthy();
        expect(screen.getAllByText('85.000').length).toBeGreaterThan(0);
        expect(screen.getByText('HAIR CUT')).toBeTruthy();
        expect(screen.getByText('HAIR PINK COLOR')).toBeTruthy();
        expect(screen.getByText('50.000')).toBeTruthy();
        expect(screen.getByText('60.000')).toBeTruthy();
        expect(screen.getByText('Nihat')).toBeTruthy();
        expect(screen.queryByText('İlk randevu için üç adım')).toBeNull();
    });

    it('randevu yoksa boş gün kartı sıfır gösterir', () => {
        render(
            <ClinicDashboardV2
                revenue={0}
                appointmentCount={0}
                cancelledCount={0}
                todayStr="2026-10-20"
                specialists={[]}
                appointments={[]}
            />,
        );
        expect(screen.getByText('Bugün randevu kaydı yok')).toBeTruthy();
        expect(screen.getByText('İlk randevu için üç adım')).toBeTruthy();
        expect(screen.getAllByText('0').length).toBeGreaterThan(0);
        expect(screen.queryByText('HAIR CUT')).toBeNull();
    });

    it('son 6 ay serisi 6 nokta ve gerçek sayılardan gelir', () => {
        const empty = buildClinicMonthSeries({
            anchorYmd: '2026-10-21',
            locale: 'tr-TR',
            appointments: [],
            customers: [{ createdAt: '' }, { createdAt: null }],
        });
        expect(empty).toHaveLength(6);
        expect(empty.every((row) => row.appointments === 0 && row.newCustomers === 0)).toBe(true);
        expect(clinicChartFetchBounds('2026-10-21')).toEqual({ start: '2026-05-01', end: '2026-10-31' });

        harness.customers = [
            { id: 'c1', name: 'Aylin', is_active: true, created_at: '2026-10-04T08:00:00' },
            { id: 'c2', name: 'Tarihsiz', is_active: true },
        ];
        render(
            <ClinicDashboardV2
                revenue={0}
                appointmentCount={3}
                cancelledCount={0}
                todayStr="2026-10-21"
                specialists={staff}
                appointments={[
                    apt({ id: 'm1', appointment_date: '2026-10-02', service_name: 'Kesim', total_price: 10 }),
                    apt({ id: 'm2', appointment_date: '2026-10-11', service_name: 'Boya', total_price: 10 }),
                    apt({ id: 'm3', appointment_date: '2026-08-15', service_name: 'Bakım', total_price: 10 }),
                ]}
            />,
        );
        const points = screen.getAllByTestId('clinic-month-point');
        expect(points).toHaveLength(6);
        expect(points.map((node) => node.getAttribute('data-key'))).toEqual([
            '2026-05',
            '2026-06',
            '2026-07',
            '2026-08',
            '2026-09',
            '2026-10',
        ]);
        expect(points.map((node) => node.getAttribute('data-appointments'))).toEqual(['0', '0', '0', '1', '0', '2']);
        expect(points.map((node) => node.getAttribute('data-customers'))).toEqual(['0', '0', '0', '0', '0', '1']);
        expect(screen.getByText('Aylık Genel Bakış')).toBeTruthy();
        expect(screen.getByText('Son 6 Ay')).toBeTruthy();
        expect(screen.getByText('Randevular')).toBeTruthy();
        expect(screen.getByText('Yeni Müşteriler')).toBeTruthy();
        const chart = screen.getByTestId('clinic-rich-chart');
        const quick = screen.getByTestId('clinic-rich-quick');
        const grafana = screen.getByTestId('clinic-rich-grafana');
        expect(chart.compareDocumentPosition(quick) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(quick.compareDocumentPosition(grafana) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('hızlı erişim 12 etiket ve mevcut sekmeye gider', () => {
        expect(CLINIC_QUICK_LINKS).toHaveLength(12);
        render(
            <ClinicDashboardV2
                revenue={0}
                appointmentCount={0}
                cancelledCount={0}
                todayStr="2026-10-21"
                specialists={[]}
                appointments={[]}
            />,
        );
        const buttons = screen.getAllByTestId('clinic-quick-link');
        expect(buttons.map((node) => node.textContent)).toEqual(QUICK_LABELS);
        const heard: string[] = [];
        const onOpen = (event: Event) => {
            heard.push(String((event as CustomEvent<{ tab?: string }>).detail?.tab || ''));
        };
        window.addEventListener('retailex-beauty-open-tab', onOpen);
        for (const button of buttons) fireEvent.click(button);
        window.removeEventListener('retailex-beauty-open-tab', onOpen);
        expect(heard).toEqual(CLINIC_QUICK_LINKS.map((link) => link.tab));
        const byLabel = (label: string) => buttons.find((node) => node.textContent === label);
        expect(byLabel('Laboratuvar')?.getAttribute('title')).toBe('Laboratuvar — Raporlar açılır');
        expect(byLabel('Kredi Yükle')?.getAttribute('title')).toBe('Kredi Yükle — Raporlar açılır');
        expect(byLabel('Yardım Merkezi')?.getAttribute('title')).toBe('Yardım Merkezi — Raporlar açılır');
        expect(byLabel('Online Randevu')?.getAttribute('title')).toBe('Online Randevu — Klinik operasyon açılır');
        expect(byLabel('Bildirim Ayarları')?.getAttribute('title')).toBe('Bildirim Ayarları — Klinik operasyon açılır');
        expect(byLabel('Destek')?.getAttribute('title')).toBe('Destek — Klinik operasyon açılır');
        expect(byLabel('Stok Yönetimi')?.getAttribute('title')).toBe('Stok Yönetimi — Ürün satışı açılır');
        expect(byLabel('Randevu Listesi')?.getAttribute('title')).toBe('Randevu Listesi — Randevu tahtası açılır');
        expect(byLabel('Şube Ayarları')?.getAttribute('title')).toBe('Şube Ayarları — Klinik operasyon açılır');
        expect(byLabel('Randevu Takvimi')?.getAttribute('data-tab')).toBe('calendar');
    });

    it('grafana seçimi n kart döner ve localStorage da kalır', () => {
        const catalog = clinicGrafanaCatalog();
        const n = 3;
        expect(catalog.length).toBeGreaterThan(n);
        const chosen = catalog.slice(0, n);
        expect(clinicGrafanaCards([...chosen.map((row) => row.uid), 'kayip-pano'], catalog)).toHaveLength(n);

        const view = (
            <ClinicDashboardV2
                revenue={0}
                appointmentCount={0}
                cancelledCount={0}
                todayStr="2026-10-21"
                specialists={[]}
                appointments={[]}
            />
        );
        const first = render(view);
        expect(screen.getByTestId('clinic-grafana-empty').textContent).toBe('Grafana raporu seçin');
        const boxes = screen.getAllByRole('checkbox');
        for (let i = 0; i < n; i += 1) fireEvent.click(boxes[i]);
        const cards = screen.getAllByTestId('clinic-grafana-card');
        expect(cards).toHaveLength(n);
        expect(cards.map((node) => node.getAttribute('data-uid'))).toEqual(chosen.map((row) => row.uid));
        expect(screen.queryByTestId('clinic-grafana-empty')).toBeNull();
        expect(JSON.parse(localStorage.getItem(CLINIC_V2_GRAFANA_PICKS_KEY) || '[]')).toEqual(chosen.map((row) => row.uid));
        const src = cards[0].querySelector('iframe')?.getAttribute('src') || '';
        expect(src).toBe(clinicGrafanaEmbedUrl(chosen[0]));
        expect(src.includes(chosen[0].uid)).toBe(true);
        expect(/api[_-]?key|bearer|token=/i.test(src)).toBe(false);
        first.unmount();

        render(view);
        expect(screen.getAllByTestId('clinic-grafana-card')).toHaveLength(n);
    });

    it('yeni alt şerit çevirileri dört dilde dolu', () => {
        const keys = [
            'bClinicV2Last6Months',
            'bClinicV2SeriesAppointments',
            'bClinicV2SeriesNewCustomers',
            'bClinicV2QaCalendar',
            'bClinicV2QaApptList',
            'bClinicV2QaClients',
            'bClinicV2QaStock',
            'bClinicV2QaLab',
            'bClinicV2QaReports',
            'bClinicV2QaBranch',
            'bClinicV2QaOnline',
            'bClinicV2QaNotify',
            'bClinicV2QaCredit',
            'bClinicV2QaHelp',
            'bClinicV2QaSupport',
            'bClinicV2QaGoesTo',
            'bClinicV2GrafanaTitle',
            'bClinicV2GrafanaEmpty',
            'bClinicV2GrafanaSearch',
            'bClinicV2GrafanaRemove',
        ];
        const langs: Language[] = ['tr', 'en', 'ar', 'ku'];
        for (const key of keys) {
            for (const lang of langs) {
                expect(translate(key, lang), `${key}/${lang}`).not.toBe(key);
            }
        }
    });
});
