import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AppointmentStatus } from '../../../types/beauty';
import type { BeautyAppointment, BeautySpecialist } from '../../../types/beauty';
import { translate } from '../../../locales/module-translations';
import {
    SHARE_STORY_HEIGHT,
    SHARE_STORY_WIDTH,
    buildShareSlotsText,
    buildShareStoryPlan,
    listShareOpenSlots,
    shareCopyPayload,
} from '../../../components/beauty/share-slots/shareSlotsStory';
import { ShareOpenSlotsStudio } from '../../../components/beauty/share-slots/ShareOpenSlotsStudio';

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

vi.mock('../../../contexts/FirmaDonemContext', () => ({
    useFirmaDonem: () => ({ selectedFirm: { name: 'Demo Klinik', firma_adi: 'Demo Klinik' } }),
}));

vi.mock('../../../services/postgres', () => ({
    ERP_SETTINGS: { firmNr: '001', periodNr: '01' },
}));

vi.mock('../../../services/beautyService', () => ({
    beautyService: {
        getAppointmentsInRange: vi.fn(async () => [
            {
                id: 'a1',
                customer_name: 'Deneme',
                service_name: 'Kesim',
                total_price: 0,
                appointment_date: '2026-10-21',
                appointment_time: '10:00',
                duration: 60,
                status: 'scheduled',
                is_package_session: false,
                staff_id: 'st-1',
            },
        ]),
        getPortalSettings: vi.fn(async () => null),
    },
}));

const staff: BeautySpecialist[] = [
    { id: 'st-1', name: 'Roza', is_active: true, commission_rate: 0 },
];

const labels = { today: 'Bugün', tomorrow: 'Yarın' };

function apt(partial: Partial<BeautyAppointment> = {}): BeautyAppointment {
    return {
        id: 'a1',
        customer_name: 'Deneme',
        service_name: 'Kesim',
        total_price: 0,
        appointment_date: '2026-10-21',
        appointment_time: '10:00',
        duration: 60,
        status: AppointmentStatus.SCHEDULED,
        is_package_session: false,
        staff_id: 'st-1',
        ...partial,
    };
}

function openSlots(extra?: Partial<Parameters<typeof listShareOpenSlots>[0]>) {
    return listShareOpenSlots({
        staff,
        appointments: [apt()],
        startYmd: '2026-10-21',
        span: 'todayTomorrow',
        staffId: 'st-1',
        todayYmd: '2026-10-21',
        labels,
        ...extra,
    });
}

const I18N_KEYS = [
    'bShareSlotsTitle',
    'bShareSlotsIntro',
    'bShareSlotsWhose',
    'bShareSlotsAllTeam',
    'bShareSlotsWhichDays',
    'bShareSlotsTodayTomorrow',
    'bShareSlotsThreeDays',
    'bShareSlotsSevenDays',
    'bShareSlotsToday',
    'bShareSlotsTomorrow',
    'bShareSlotsHours',
    'bShareSlotsHoursSelected',
    'bShareSlotsBackground',
    'bShareSlotsBgSolid',
    'bShareSlotsBgPhoto',
    'bShareSlotsBgPreset',
    'bShareSlotsTitleOurs',
    'bShareSlotsNotePlaceholder',
    'bShareSlotsCta',
    'bShareSlotsFooter',
    'bShareSlotsTabVideo',
    'bShareSlotsTabImage',
    'bShareSlotsDownloadVideo',
    'bShareSlotsDownloadImage',
    'bShareSlotsCopyLink',
    'bShareSlotsWhatsApp',
    'bShareSlotsPresetNavy',
    'bShareSlotsPresetTeal',
    'bShareSlotsPresetPlum',
];

describe('boş saat hikâyesi', () => {
    it('dolu 10:00-11:00 çip değildir, boş 09:00 seçilebilir, plan 1080x1920 seçili saatleri içerir', () => {
        const slots = openSlots();
        const today = slots.filter((slot) => slot.dayYmd === '2026-10-21').map((slot) => slot.label);
        expect(today).toContain('09:00');
        expect(today).toContain('19:30');
        expect(today).not.toContain('10:00');
        expect(today).not.toContain('10:30');
        expect(today).not.toContain('20:00');
        expect(today).not.toContain('07:30');

        const selected = new Set(
            slots.filter((slot) => slot.dayYmd === '2026-10-21' && (slot.label === '09:00' || slot.label === '11:00')).map((slot) => slot.id),
        );
        const plan = buildShareStoryPlan({
            companyName: 'Demo Klinik',
            title: 'Boş saatlerimiz',
            note: '',
            cta: 'Linke dokun, saatini seç',
            footer: 'RetailEX ile',
            backgroundColor: '#0B1F3A',
            hasPhoto: false,
            slots,
            selectedIds: selected,
        });
        expect(plan.width).toBe(1080);
        expect(plan.height).toBe(1920);
        expect(plan.width).toBe(SHARE_STORY_WIDTH);
        expect(plan.height).toBe(SHARE_STORY_HEIGHT);
        expect(plan.selectedTimes).toEqual(['09:00', '11:00']);
        expect(plan.selectedTimes).not.toContain('10:00');
        expect(plan.selectedTimes).not.toContain('10:30');
        expect(plan.footer).toBe('RetailEX ile');
        expect(plan.days.map((day) => day.label)).toEqual(['Bugün']);

        const text = buildShareSlotsText({
            title: plan.title,
            days: plan.days,
            note: '',
            link: '',
            footer: plan.footer,
        });
        expect(text).toContain('Bugün');
        expect(text).toContain('09:00');
        expect(text).toContain('11:00');
        expect(text).not.toContain('10:00');
        expect(shareCopyPayload('', text)).toEqual({ kind: 'text', value: text });
        expect(shareCopyPayload('https://klinik.example/book', text).kind).toBe('link');
        expect(shareCopyPayload('https://klinik.example/book', text).value).toBe('https://klinik.example/book');
    });

    it('tüm ekipte bir kişi boşsa saat kalır, seçili dolu personelde kalkar', () => {
        const two: BeautySpecialist[] = [
            ...staff,
            { id: 'st-2', name: 'Hana', is_active: true, commission_rate: 0 },
        ];
        const all = openSlots({ staff: two, staffId: '' });
        const busyOnly = openSlots({ staff: two, staffId: 'st-1' });
        const labelsOf = (rows: ReturnType<typeof openSlots>) =>
            rows.filter((slot) => slot.dayYmd === '2026-10-21').map((slot) => slot.label);
        expect(labelsOf(all)).toContain('10:00');
        expect(labelsOf(busyOnly)).not.toContain('10:00');
        expect(labelsOf(busyOnly)).toContain('09:00');
    });

    it('personel yoksa çip üretilmez', () => {
        const rows = openSlots({
            staff: [{ id: 'st-1', name: 'Roza', is_active: false, commission_rate: 0 }],
            appointments: [],
            staffId: '',
        });
        expect(rows).toEqual([]);
    });

    it('stüdyo dolu saati göstermez ve dört dilde metin vardır', async () => {
        render(createElement(ShareOpenSlotsStudio, {
            staff,
            anchorYmd: '2026-10-21',
            onClose: () => undefined,
        }));
        expect(await screen.findByTestId('share-slot-2026-10-21-09:00')).toBeTruthy();
        await waitFor(() => {
            expect(screen.queryByTestId('share-slot-2026-10-21-10:00')).toBeNull();
            expect(screen.queryByTestId('share-slot-2026-10-21-10:30')).toBeNull();
        });
        expect(screen.getByText('Boş saatleri paylaş')).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Videoyu indir' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Linki kopyala' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'WhatsApp metni' })).toBeTruthy();
        const canvas = document.querySelector('canvas');
        expect(canvas?.getAttribute('width')).toBe('1080');
        expect(canvas?.getAttribute('height')).toBe('1920');

        const studio = readFileSync(resolve('src/components/beauty/share-slots/ShareOpenSlotsStudio.tsx'), 'utf8');
        const story = readFileSync(resolve('src/components/beauty/share-slots/shareSlotsStory.ts'), 'utf8');
        const blob = `${studio}\n${story}`.toLowerCase();
        expect(studio).toContain('PercentBodyModal');
        expect(studio).toContain('size="full"');
        expect(studio).not.toContain('z-50');
        expect(studio).not.toContain('fixed inset-0');
        expect(blob).not.toContain('randevunet');
        expect(blob).not.toContain('lumeon');
        expect(translate('bShareSlotsFooter', 'tr')).toBe('RetailEX ile');
        for (const key of I18N_KEYS) {
            for (const lang of ['tr', 'en', 'ar', 'ku'] as const) {
                const label = translate(key, lang);
                expect(label.trim().length, `${key}:${lang}`).toBeGreaterThan(0);
                expect(label, `${key}:${lang}`).not.toBe(key);
            }
        }
    });
});
