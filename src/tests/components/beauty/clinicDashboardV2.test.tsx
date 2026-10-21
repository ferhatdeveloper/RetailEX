import { describe, expect, it, vi } from 'vitest';

class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
import { render, screen } from '@testing-library/react';
import { AppointmentStatus } from '../../../types/beauty';
import type { BeautyAppointment, BeautySpecialist } from '../../../types/beauty';
import { ClinicDashboardV2 } from '../../../components/beauty/components/ClinicDashboardV2';

vi.mock('../../../services/beautyService', () => ({
    beautyService: {
        getAppointmentsInRange: () => new Promise(() => {}),
        getCustomers: () => Promise.resolve([]),
    },
}));

vi.mock('../../../components/beauty/store/useBeautyStore', () => ({
    useBeautyStore: (selector: (state: { customers: []; loadCustomers: () => Promise<void> }) => unknown) =>
        selector({ customers: [], loadCustomers: async () => {} }),
}));

vi.mock('../../../contexts/LanguageContext', () => ({
    useLanguage: () => ({
        language: 'tr',
        tm: (key: string) => {
            const dict: Record<string, string> = {
                bClinicV2Hello: 'İyi günler',
                bClinicV2KpiAppointments: 'Bugünkü randevu',
                cebeGirenNakit: 'Tahsilat',
                bKpiCancelledLabel: 'İptal',
                bClinicV2KpiOccupancy: 'Doluluk',
                bClinicV2Unassigned: 'Atanmamış',
                bCustomerFallbackName: 'Müşteri',
                localeCode: 'tr-TR',
                bClinicV2Today: 'Bugün',
                bClinicV2Yesterday: 'Dün',
                bClinicV2Tomorrow: 'Yarın',
                bClinicV2ApptCount: '{n} randevu',
                bClinicV2CustomerChip: '{n} müşteri',
                bClinicV2NoAppointments: 'Bugün randevu kaydı yok',
                bClinicV2StepsTitle: 'İlk randevu için üç adım',
                bClinicV2NoShowRate: 'Gelmeme oranı',
                bClinicV2RegisteredCustomers: 'Kayıtlı müşteri',
                bClinicV2WeekProgram: 'Haftalık program',
                bClinicV2MonthChart: 'Aylık genel bakış',
                bClinicV2QuickAccess: 'Hızlı erişim',
                bClinicV2StatusNew: 'Yeni',
                bClinicV2StatusConfirmed: 'Onay',
                bClinicV2StatusArrived: 'Geldi',
                bClinicV2StatusNoShow: 'Gelmedi',
                bClinicV2OpenCalendar: 'Randevu takvimi',
            };
            return dict[key] ?? key;
        },
    }),
}));

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

describe('ClinicDashboardV2', () => {
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
});
