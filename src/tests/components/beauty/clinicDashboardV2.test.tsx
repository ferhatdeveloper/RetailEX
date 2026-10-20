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
    },
}));

vi.mock('../../../contexts/LanguageContext', () => ({
    useLanguage: () => ({
        language: 'tr',
        tm: (key: string) => {
            const dict: Record<string, string> = {
                bClinicPanelTitle: 'Klinik Paneli',
                bClinicV2KpiAppointments: 'Bugünkü randevu',
                cebeGirenNakit: 'Tahsilat',
                bKpiCancelledLabel: 'İptal',
                bClinicV2KpiOccupancy: 'Doluluk',
                bClinicV2OccupancyHint: '08:00–20:00',
                bClinicV2DayBoard: 'Gün tahtası',
                bClinicV2Unassigned: 'Atanmamış',
                bKpiCompletedLabel: 'Tamamlanan',
                bKpiPendingLabel: 'Bekleyen',
                bClinicV2StatusChart: 'Durum dağılımı',
                bClinicV2ServiceRevenue: 'Hizmet cirosu',
                bClinicV2StaffOccupancy: 'Personel doluluğu',
                bCustomerFallbackName: 'Müşteri',
                localeCode: 'tr-TR',
                time: 'Saat',
                bClinicV2Today: 'Bugün',
                bClinicV2Day: 'Gün',
                bClinicV2Week: 'Hafta',
                bClinicV2AllStaff: 'Tüm personel',
                bClinicV2ApptCount: '{n} randevu',
                bClinicV2EmptySlots: '{n} boş',
                bClinicV2Prev: 'Önceki',
                bClinicV2Next: 'Sonraki',
                bClinicV2SurveyToggle: 'Anket',
                bClinicV2CrmToggle: 'CRM',
            };
            return dict[key] ?? key;
        },
    }),
}));

const staff: BeautySpecialist[] = [
    { id: 'st-1', name: 'Roza', is_active: true, commission_rate: 0, color: '#db2777' },
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
    it('gün tahtasında hizmet tutarını API değerinde gösterir', () => {
        render(
            <ClinicDashboardV2
                revenue={85000}
                appointmentCount={2}
                cancelledCount={0}
                todayStr="2026-10-20"
                specialists={staff}
                appointments={[
                    apt({ id: 'a1', service_name: 'HAIR CUT', total_price: 50000, appointment_time: '09:00' }),
                    apt({ id: 'a2', service_name: 'HAIR PINK COLOR', total_price: 60000, appointment_time: '11:00' }),
                ]}
            />,
        );
        expect(screen.getByText('Bugünkü randevu')).toBeTruthy();
        expect(screen.getByText('Bugün')).toBeTruthy();
        expect(screen.getAllByText('Roza').length).toBeGreaterThan(0);
        expect(screen.getAllByText('08:00').length).toBeGreaterThan(0);
        expect(screen.getAllByText('09:00').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Nihat').length).toBeGreaterThan(0);
        expect(screen.getAllByText('2').length).toBeGreaterThan(0);
        expect(screen.getByText('85.000')).toBeTruthy();
        expect(screen.getAllByText('HAIR CUT').length).toBeGreaterThan(0);
        expect(screen.getAllByText('HAIR PINK COLOR').length).toBeGreaterThan(0);
        expect(screen.getByText('50.000')).toBeTruthy();
        expect(screen.getByText('60.000')).toBeTruthy();
    });

    it('randevu yoksa grafik alanı sıfır gösterir', () => {
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
        expect(screen.getAllByText('0').length).toBeGreaterThan(0);
        expect(screen.getByText('08:00')).toBeTruthy();
        expect(screen.getByText('Atanmamış')).toBeTruthy();
        expect(screen.queryByText('HAIR CUT')).toBeNull();
    });
});
