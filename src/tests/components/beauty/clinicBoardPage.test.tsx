import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { AppointmentStatus } from '../../../types/beauty';
import type { BeautyAppointment, BeautySpecialist } from '../../../types/beauty';
import { translate } from '../../../locales/module-translations';
import { ClinicBoardMenu } from '../../../components/beauty/pages/ClinicBoardMenu';
import { ClinicDayBoard } from '../../../components/beauty/pages/ClinicDayBoard';
import {
    CLINIC_BOARD_MENU,
    CLINIC_BOARD_SHELL_LABEL_KEY,
    CLINIC_BOARD_SHELL_TAB_ID,
    CLINIC_BOARD_UNASSIGNED_ID,
    buildClinicBoardColumns,
    clinicBoardHourLabels,
    clinicBoardSideOpen,
} from '../../../components/beauty/pages/clinicBoardModel';

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
    { id: 'st-2', name: 'Hana', is_active: true, commission_rate: 0, color: '#0ea5e9' },
];

function apt(partial: Partial<BeautyAppointment> & Pick<BeautyAppointment, 'id' | 'service_name' | 'total_price'>): BeautyAppointment {
    return {
        customer_name: 'Nihat',
        appointment_date: '2026-10-21',
        appointment_time: '10:00',
        duration: 60,
        status: AppointmentStatus.SCHEDULED,
        is_package_session: false,
        staff_id: 'st-1',
        ...partial,
    };
}

describe('ClinicBoardPage kayıt ve boş tahta', () => {
    it('yeni sayfa menüsü dört dilde kayıtlıdır ve kabuğa tek sekme ekler', () => {
        expect(CLINIC_BOARD_MENU.map((item) => item.id)).toEqual(['appointment', 'customer', 'staff', 'service']);
        const keys = [...CLINIC_BOARD_MENU.map((item) => item.labelKey), CLINIC_BOARD_SHELL_LABEL_KEY];
        for (const key of keys) {
            for (const lang of ['tr', 'en', 'ar', 'ku'] as const) {
                const label = translate(key, lang);
                expect(label.trim().length).toBeGreaterThan(0);
                expect(label).not.toBe(key);
            }
        }
        expect(translate(CLINIC_BOARD_SHELL_LABEL_KEY, 'tr')).toBe('Randevu tahtası');
        const indexSrc = readFileSync(resolve('src/components/beauty/index.tsx'), 'utf8');
        expect(indexSrc).toContain('CLINIC_BOARD_SHELL_TAB_ID');
        expect(indexSrc).toContain('<ClinicBoardPage');
        expect(indexSrc).toContain(`activeTab === 'dashboard'`);
        expect(indexSrc).not.toContain('ClinicDashboardV2');
        expect(clinicBoardSideOpen(false, false)).toBe(false);
        expect(CLINIC_BOARD_SHELL_TAB_ID).toBe('clinic_board');
    });

    it('boş günde saat satırları ve personel kolonları üretir', () => {
        const columns = buildClinicBoardColumns({
            staff,
            appointments: [],
            dayYmd: '2026-10-21',
            unassignedName: 'Atanmamış',
        });
        expect(columns.map((column) => column.id)).toEqual(['st-2', 'st-1']);
        expect(columns.every((column) => column.appointmentCount === 0)).toBe(true);
        expect(columns.every((column) => column.emptySlotCount === clinicBoardHourLabels().length)).toBe(true);
        expect(clinicBoardHourLabels()[0]).toBe('08:00');
        expect(clinicBoardHourLabels()).toContain('16:30');
        expect(clinicBoardHourLabels().at(-1)).toBe('19:30');

        render(
            <ClinicDayBoard
                dayYmd="2026-10-21"
                staff={staff}
                appointments={[]}
                unassignedLabel="Atanmamış"
                appointmentWord="randevu"
                emptySlotWord="boş dilim"
                locale="tr-TR"
            />,
        );
        expect(screen.getByTestId('clinic-board-col-st-1')).toBeTruthy();
        expect(screen.getByTestId('clinic-board-col-st-2')).toBeTruthy();
        expect(screen.getAllByTestId('clinic-board-hour').map((node) => node.textContent)).toContain('08:00');
        expect(screen.queryByText('HAIR CUT')).toBeNull();
        expect(document.querySelector('table')).toBeNull();
    });

    it('personel yokken de bir kolon çizer ve API tutarını kartta gösterir', () => {
        const empty = buildClinicBoardColumns({
            staff: [],
            appointments: [],
            dayYmd: '2026-10-21',
            unassignedName: 'Atanmamış',
        });
        expect(empty.map((column) => column.id)).toEqual([CLINIC_BOARD_UNASSIGNED_ID]);
        expect(empty[0].blocks).toEqual([]);

        render(
            <>
                <ClinicBoardMenu section="appointment" onChange={() => {}} />
                <ClinicDayBoard
                    dayYmd="2026-10-21"
                    staff={staff}
                    appointments={[
                        apt({ id: 'a1', service_name: 'HAIR CUT', total_price: 50000, appointment_time: '09:00', customer_name: 'Nihat' }),
                        apt({
                            id: 'a2',
                            service_name: 'HAIR PINK COLOR',
                            total_price: 60000,
                            appointment_time: '11:00',
                            staff_id: 'st-2',
                            customer_name: 'Lana',
                        }),
                    ]}
                    unassignedLabel="Atanmamış"
                    appointmentWord="randevu"
                    emptySlotWord="boş dilim"
                    locale="tr-TR"
                />
            </>,
        );
        expect(screen.getByRole('button', { name: 'Randevu' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Müşteri' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Personel' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Hizmet' })).toBeTruthy();
        expect(screen.getByText('HAIR CUT')).toBeTruthy();
        expect(screen.getByText('HAIR PINK COLOR')).toBeTruthy();
        expect(screen.getByText('50.000')).toBeTruthy();
        expect(screen.getByText('60.000')).toBeTruthy();
    });
});
