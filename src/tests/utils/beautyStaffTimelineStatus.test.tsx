import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { AppointmentStatus, type BeautyAppointment, type BeautySpecialist } from '../../types/beauty';
import { translate } from '../../locales/module-translations';
import {
    beautyStaffTimelineBoxTone,
    staffTimelineAppointmentCards,
    staffTimelineStatusLabel,
} from '../../utils/beautyStaffTimelineStatus';
import { StaffTimelineView } from '../../components/beauty/components/StaffTimelineView';

const store = vi.hoisted(() => ({
    appointments: [] as BeautyAppointment[],
    specialists: [] as BeautySpecialist[],
}));

vi.mock('../../components/beauty/store/useBeautyStore', () => ({
    useBeautyStore: () => store,
}));

vi.mock('../../contexts/LanguageContext', async () => {
    const actual = await vi.importActual<typeof import('../../locales/module-translations')>(
        '../../locales/module-translations',
    );
    return {
        useLanguage: () => ({
            language: 'tr',
            tm: (key: string) => actual.translate(key, 'tr'),
        }),
    };
});

const DAY = '2026-10-26';
const CUSTOMER = 'aram-1';

function apt(partial: Partial<BeautyAppointment> & Pick<BeautyAppointment, 'id' | 'status'>): BeautyAppointment {
    return {
        duration: 60,
        total_price: 0,
        is_package_session: false,
        customer_id: CUSTOMER,
        client_id: CUSTOMER,
        customer_name: 'ARAM',
        staff_id: 'staff-1',
        appointment_date: DAY,
        date: DAY,
        service_color: '#22c55e',
        ...partial,
    };
}

describe('personel takvimi durum rengi', () => {
    it('tamamlanan ve kapanan kart yeşil sınıf ile Tamamlandı alır', () => {
        for (const status of ['completed', 'closed', AppointmentStatus.COMPLETED]) {
            const tone = beautyStaffTimelineBoxTone(status);
            expect(tone.className).toContain('beauty-staff-apt--green');
            expect(tone.background).toBe('#d1fae5');
            expect(tone.completed).toBe(true);
            expect(staffTimelineStatusLabel(tone, (key) => translate(key, 'tr'))).toBe('Tamamlandı');
        }
    });

    it('bekleyen kart yeşil olmaz ve Tamamlandı yazmaz', () => {
        for (const status of ['scheduled', 'pre_paid', AppointmentStatus.SCHEDULED, '']) {
            const tone = beautyStaffTimelineBoxTone(status);
            expect(tone.className).not.toContain('green');
            expect(tone.className).toContain('beauty-staff-apt--waiting');
            expect(tone.background).toBe('#ede9fe');
            expect(tone.background).not.toBe('#d1fae5');
            const label = staffTimelineStatusLabel(tone, (key) => translate(key, 'tr'));
            expect(label).toBe('Bekliyor');
            expect(label).not.toBe('Tamamlandı');
        }
    });

    it('iptal kırmızı, gelmedi gri, başladı ve onaylandı mevcut paletten ayrılır', () => {
        const tr = (key: string) => translate(key, 'tr');
        const cancelled = beautyStaffTimelineBoxTone('cancelled');
        const noShow = beautyStaffTimelineBoxTone('no_show');
        const started = beautyStaffTimelineBoxTone('in_progress');
        const confirmed = beautyStaffTimelineBoxTone('confirmed');
        expect(cancelled.background).toBe('#fee2e2');
        expect(staffTimelineStatusLabel(cancelled, tr)).toBe('İptal');
        expect(noShow.background).toBe('#f3f4f6');
        expect(staffTimelineStatusLabel(noShow, tr)).toBe('Gelmedi');
        expect(started.background).toBe('#fef3c7');
        expect(staffTimelineStatusLabel(started, tr)).toBe('Başladı');
        expect(confirmed.background).toBe('#e0f2fe');
        expect(staffTimelineStatusLabel(confirmed, tr)).toBe('Onaylandı');
        expect(cancelled.className).not.toContain('green');
        expect(noShow.className).not.toContain('green');
    });

    it('aynı müşterinin biri tamamlandı biri bekleyen iki randevusu ayrı boyanır', () => {
        const cards = staffTimelineAppointmentCards([
            apt({
                id: 'done',
                status: AppointmentStatus.COMPLETED,
                appointment_time: '09:00',
                time: '09:00',
                service_name: 'HIGHLIGHT',
                total_price: 25_000,
            }),
            apt({
                id: 'wait',
                status: AppointmentStatus.SCHEDULED,
                appointment_time: '10:00',
                time: '10:00',
                service_name: 'STRONG',
                total_price: 5_000,
            }),
        ], { mergeConsecutiveSameCustomer: true });

        expect(cards).toHaveLength(2);
        expect(cards.map((card) => card.customer_name)).toEqual(['ARAM', 'ARAM']);
        const tones = cards.map((card) => beautyStaffTimelineBoxTone(card.status));
        expect(tones[0]?.background).not.toBe(tones[1]?.background);
        expect(tones.map((tone) => tone.label).sort()).toEqual(['Bekliyor', 'Tamamlandı']);
        expect(tones.find((tone) => tone.label === 'Bekliyor')?.className).not.toContain('green');
        expect(cards.find((card) => card.id === 'wait')?.total_price).toBe(5_000);
        expect(cards.find((card) => card.id === 'done')?.total_price).toBe(25_000);
    });

    it('aynı durumdaki ardışık satırlar tek kartta kalır', () => {
        const cards = staffTimelineAppointmentCards([
            apt({
                id: '1',
                status: AppointmentStatus.COMPLETED,
                appointment_time: '09:00',
                time: '09:00',
                service_name: 'HIGHLIGHT',
                total_price: 20_000,
            }),
            apt({
                id: '2',
                status: AppointmentStatus.COMPLETED,
                appointment_time: '10:00',
                time: '10:00',
                service_name: 'STRONG',
                total_price: 5_000,
            }),
        ], { mergeConsecutiveSameCustomer: true });
        expect(cards).toHaveLength(1);
        expect(cards[0]?.service_name).toContain('HIGHLIGHT');
        expect(cards[0]?.service_name).toContain('STRONG');
        expect(cards[0]?.total_price).toBe(25_000);
        expect(beautyStaffTimelineBoxTone(cards[0]?.status).label).toBe('Tamamlandı');
    });
});

describe('StaffTimelineView durum kutusu', () => {
    it('tamamlanan kutu yeşil ve Tamamlandı, bekleyen kutu yeşil değil', () => {
        store.specialists = [
            { id: 'staff-1', name: 'System Administrator', is_active: true, commission_rate: 0, color: '#7c3aed' },
        ];
        store.appointments = [];
        render(
            <StaffTimelineView
                currentDate={new Date(2026, 9, 26)}
                queueMode={false}
                mergeConsecutiveByCustomer
                timeSlots={['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00']}
                onAppointmentClick={() => {}}
                appointmentsOverride={[
                    apt({
                        id: 'done',
                        status: AppointmentStatus.COMPLETED,
                        appointment_time: '09:00',
                        time: '09:00',
                        service_name: 'HIGHLIGHT',
                        total_price: 25_000,
                    }),
                    apt({
                        id: 'wait',
                        status: AppointmentStatus.SCHEDULED,
                        appointment_time: '10:00',
                        time: '10:00',
                        service_name: 'STRONG',
                        total_price: 5_000,
                    }),
                    apt({
                        id: 'cancel',
                        status: AppointmentStatus.CANCELLED,
                        appointment_time: '14:00',
                        time: '14:00',
                        service_name: 'HIGHLIGHT',
                        total_price: 0,
                    }),
                    apt({
                        id: 'miss',
                        status: AppointmentStatus.NO_SHOW,
                        appointment_time: '15:00',
                        time: '15:00',
                        service_name: 'STRONG',
                        total_price: 0,
                    }),
                ]}
            />,
        );

        const cards = screen.getAllByTestId('staff-timeline-apt');
        const byId = (id: string) => {
            const card = cards.find((node) => node.getAttribute('data-apt-id') === id);
            expect(card).toBeTruthy();
            return card as HTMLElement;
        };
        const done = byId('done');
        const wait = byId('wait');
        const cancel = byId('cancel');
        const miss = byId('miss');

        expect(done.className).toContain('beauty-staff-apt--green');
        expect(done.getAttribute('data-bg')).toBe('#d1fae5');
        expect(within(done).getByTestId('staff-timeline-apt-status')).toHaveTextContent('Tamamlandı');
        expect(done).toHaveTextContent('ARAM');

        expect(wait.className).not.toContain('beauty-staff-apt--green');
        expect(wait.className).toContain('beauty-staff-apt--waiting');
        expect(wait.getAttribute('data-bg')).toBe('#ede9fe');
        expect(within(wait).getByTestId('staff-timeline-apt-status')).toHaveTextContent('Bekliyor');
        expect(within(wait).getByTestId('staff-timeline-apt-status')).not.toHaveTextContent('Tamamlandı');
        expect(wait).toHaveTextContent('ARAM');

        expect(done.getAttribute('data-bg')).not.toBe(wait.getAttribute('data-bg'));
        expect(cancel.getAttribute('data-bg')).toBe('#fee2e2');
        expect(within(cancel).getByTestId('staff-timeline-apt-status')).toHaveTextContent('İptal');
        expect(miss.getAttribute('data-bg')).toBe('#f3f4f6');
        expect(within(miss).getByTestId('staff-timeline-apt-status')).toHaveTextContent('Gelmedi');
    });
});
