import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import { AppointmentStatus } from '../../../types/beauty';
import type { BeautyAppointment, BeautySpecialist } from '../../../types/beauty';
import { translate } from '../../../locales/module-translations';
import { formatLocalYmd } from '../../../utils/dateLocal';
import { ClinicBoardPage } from '../../../components/beauty/pages/ClinicBoardPage';
import { ShareOpenSlotsPage } from '../../../components/beauty/pages/ShareOpenSlotsPage';
import {
    SHARE_STORY_HEIGHT,
    SHARE_STORY_WIDTH,
    collectShareOpenSlotChips,
    composeShareSlotsMessage,
    recordShareSlotsVideo,
    renderShareSlotsPng,
    shareSlotsAnimationPlan,
    shareSlotsDayYmds,
    shareSlotsRevealCounts,
    shareSlotsVideoPlan,
} from '../../../components/beauty/share-slots/shareSlotsStory';

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
    useFirmaDonem: () => ({
        selectedFirm: { name: 'Nora Klinik', firm_nr: '001' },
        selectedPeriod: { nr: 1 },
    }),
}));

const staff: BeautySpecialist[] = [
    { id: 'st-1', name: 'Roza', is_active: true, commission_rate: 0 },
];

function busyDay(ymd: string): BeautyAppointment {
    return {
        id: `a-${ymd}`,
        customer_name: 'Nihat',
        service_name: 'Kesim',
        total_price: 50000,
        appointment_date: ymd,
        appointment_time: '10:00',
        duration: 60,
        status: AppointmentStatus.SCHEDULED,
        is_package_session: false,
        staff_id: 'st-1',
    };
}

vi.mock('../../../services/beautyService', () => ({
    beautyService: {
        getSpecialists: async () => [{ id: 'st-1', name: 'Roza', is_active: true, commission_rate: 0 }],
        getServices: async () => [],
        getCustomers: async () => [],
        getPortalSettings: async () => ({ public_token: 'tok' }),
        getAppointmentsInRange: async (start: string, end: string) => {
            const { shiftClinicBoardYmd } = await import('../../../components/beauty/pages/clinicBoardModel');
            const rows = [];
            let cursor = start;
            for (let guard = 0; cursor <= end && guard < 8; guard += 1) {
                rows.push({
                    id: `a-${cursor}`,
                    customer_name: 'Nihat',
                    service_name: 'Kesim',
                    total_price: 50000,
                    appointment_date: cursor,
                    appointment_time: '10:00',
                    duration: 60,
                    status: 'scheduled',
                    is_package_session: false,
                    staff_id: 'st-1',
                });
                cursor = shiftClinicBoardYmd(cursor, 1);
            }
            return rows;
        },
    },
}));

const BANNED = ['randevunet', 'lumeon'];

describe('Boş saatleri paylaş sayfası', () => {
    it('dolu 10:00 dilimini çip yapmaz ve hikâye 1080x1920 üretir', async () => {
        const today = formatLocalYmd(new Date());
        const days = shareSlotsDayYmds(today, 'today_tomorrow');
        expect(days).toHaveLength(2);
        const chips = collectShareOpenSlotChips({
            staff,
            appointments: days.map((day) => busyDay(day)),
            days,
            staffFilterId: 'st-1',
            unassignedName: 'Atanmamış',
        });
        const labels = chips.filter((chip) => chip.dayYmd === today).map((chip) => chip.label);
        expect(labels).toContain('09:00');
        expect(labels).not.toContain('10:00');
        expect(labels).not.toContain('10:30');

        const text = composeShareSlotsMessage({
            firmName: 'Nora Klinik',
            heading: 'Boş saatlerimiz',
            note: '',
            groups: [{
                dayLabel: 'Bugün',
                slots: [{
                    id: 'st-1-540',
                    staffId: 'st-1',
                    staffName: 'Roza',
                    startMin: 540,
                    endMin: 570,
                    label: '09:00-09:30',
                }],
            }],
            link: 'https://retail.example/book/001?period=01',
            brand: 'RetailEX',
        });
        expect(text).toContain('Nora Klinik');
        expect(text).toContain('RetailEX');
        expect(text).toContain('09:00-09:30');
        expect(text).not.toContain('10:00-10:30');
        for (const word of BANNED) expect(text.toLowerCase()).not.toContain(word);

        const counts = shareSlotsRevealCounts(4, 4);
        expect(counts).toEqual([1, 2, 3, 4]);
        const plan = shareSlotsVideoPlan(3);
        expect(plan.counts.at(-1)).toBe(3);
        expect(plan.durationMs).toBeGreaterThanOrEqual(2400);
        expect(plan.counts.every((count, index) => index === 0 || count >= plan.counts[index - 1])).toBe(true);
        const anim = shareSlotsAnimationPlan(3);
        expect(anim.frames.length).toBeGreaterThanOrEqual(3);
        expect(anim.width).toBe(1080);
        expect(anim.height).toBe(1920);
        const visibles = anim.frames.map((frame) => frame.visible);
        expect(visibles[0]).toBeLessThan(visibles[visibles.length - 1] ?? 0);
        expect(visibles.every((count, index) => index === 0 || count >= (visibles[index - 1] ?? 0))).toBe(true);
        expect(visibles).toContain(1);
        expect(visibles).toContain(2);
        expect(visibles).toContain(3);

        const texts: string[] = [];
        const canvas = {
            width: 0,
            height: 0,
            getContext() {
                return {
                    fillStyle: '',
                    font: '',
                    textAlign: 'left' as CanvasTextAlign,
                    textBaseline: 'alphabetic' as CanvasTextBaseline,
                    fillRect() {},
                    fillText(value: string) { texts.push(value); },
                    measureText(value: string) { return { width: value.length * 16 }; },
                    beginPath() {},
                    moveTo() {},
                    lineTo() {},
                    quadraticCurveTo() {},
                    closePath() {},
                    arc() {},
                    fill() {},
                };
            },
            toBlob(callback: (blob: Blob | null) => void) {
                callback(new Blob([Uint8Array.from([137, 80, 78, 71])], { type: 'image/png' }));
            },
        };
        const blob = await renderShareSlotsPng({
            width: 10,
            height: 10,
            firmName: 'Nora Klinik',
            initial: 'N',
            title: 'Boş saatlerimiz',
            dayLabel: 'Bugün',
            pills: ['09:00', '09:30'],
            visiblePills: 1,
            cta: 'Linke dokun, saatini seç',
            linkLabel: 'Nora Klinik · RetailEX',
            brand: 'RetailEX',
            background: { kind: 'solid', color: '#071833' },
        }, () => canvas as unknown as HTMLCanvasElement);
        expect(canvas.width).toBe(SHARE_STORY_WIDTH);
        expect(canvas.height).toBe(SHARE_STORY_HEIGHT);
        expect(SHARE_STORY_WIDTH).toBe(1080);
        expect(SHARE_STORY_HEIGHT).toBe(1920);
        expect(blob.type).toBe('image/png');
        expect(texts).toContain('09:00');
        expect(texts).toContain('09:30');
        expect(texts).toContain('RetailEX');
        expect(texts).not.toContain('10:00');

        class FakeRecorder {
            static isTypeSupported() { return true; }
            mimeType = 'video/webm';
            ondataavailable: ((event: { data: Blob }) => void) | null = null;
            onstop: (() => void) | null = null;
            onerror: (() => void) | null = null;
            start() {}
            stop() {
                this.ondataavailable?.({ data: new Blob(['webm'], { type: 'video/webm' }) });
                this.onstop?.();
            }
        }
        let frames = 0;
        const videoCanvas = {
            width: 0,
            height: 0,
            getContext() {
                return {
                    fillStyle: '',
                    font: '',
                    textAlign: 'left' as CanvasTextAlign,
                    textBaseline: 'alphabetic' as CanvasTextBaseline,
                    fillRect() { frames += 1; },
                    fillText() {},
                    measureText(value: string) { return { width: value.length * 16 }; },
                    beginPath() {},
                    moveTo() {},
                    lineTo() {},
                    quadraticCurveTo() {},
                    closePath() {},
                    arc() {},
                    fill() {},
                };
            },
            captureStream() { return {}; },
        };
        const video = await recordShareSlotsVideo({
            firmName: 'Nora Klinik',
            initial: 'N',
            title: 'Boş saatlerimiz',
            dayLabel: 'Bugün',
            pills: ['09:00', '11:00'],
            cta: 'Linke dokun, saatini seç',
            linkLabel: 'Nora Klinik · RetailEX',
            brand: 'RetailEX',
            background: { kind: 'solid', color: '#071833' },
        }, {
            createCanvas: () => videoCanvas as unknown as HTMLCanvasElement,
            MediaRecorder: FakeRecorder as unknown as typeof MediaRecorder,
            sleep: async () => {},
        });
        expect(video.type).toContain('webm');
        expect(videoCanvas.width).toBe(1080);
        expect(videoCanvas.height).toBe(1920);
        expect(frames).toBe(shareSlotsAnimationPlan(2).frames.length);
        expect(shareSlotsAnimationPlan(2).frames.length).toBeGreaterThanOrEqual(3);
    });

    it('tam sayfa yerleşir, menü sekmesini açar ve dolu saati göstermez', async () => {
        const keys = [
            'bShareOpenSlotsNav',
            'bShareOpenSlotsLead',
            'bShareOpenSlotsAllTeam',
            'bShareOpenSlotsTodayTomorrow',
            'bShareOpenSlotsDays3',
            'bShareOpenSlotsDays7',
            'bShareOpenSlotsDownloadVideo',
            'bShareOpenSlotsDownloadImage',
            'bShareOpenSlotsCopyLink',
            'bShareOpenSlotsWhatsApp',
            'bShareOpenSlotsTapLink',
            'bShareOpenSlotsIgShare',
            'bShareOpenSlotsWaSend',
            'bShareOpenSlotsWaChatHint',
            'bShareOpenSlotsNotConnected',
            'bShareOpenSlotsNeedNumber',
        ];
        for (const key of keys) {
            for (const lang of ['tr', 'en', 'ar', 'ku'] as const) {
                const label = translate(key, lang);
                expect(label.trim().length, `${key}:${lang}`).toBeGreaterThan(0);
                expect(label, key).not.toBe(key);
            }
        }
        expect(translate('bShareOpenSlotsNav', 'tr')).toBe('Boş saatleri paylaş');

        const indexSrc = readFileSync(resolve('src/components/beauty/index.tsx'), 'utf8');
        const menuStart = indexSrc.indexOf('const MENU_GROUPS');
        const menuEnd = indexSrc.indexOf('const PAGE_TITLES');
        const v1Menu = indexSrc.slice(menuStart, menuEnd);
        expect(v1Menu).not.toContain('SHARE_OPEN_SLOTS_TAB_ID');
        expect(v1Menu).not.toContain('share_open_slots');
        const dentalGeneral = indexSrc.indexOf("title: tm('bShellMenuGeneral')");
        const dentalOps = indexSrc.indexOf("title: tm('bShellMenuDentalOperations')");
        expect(indexSrc.indexOf('CLINIC_BOARD_SHELL_TAB_ID', dentalGeneral)).toBeLessThan(dentalOps);
        const secondGeneral = indexSrc.indexOf("title: tm('bShellMenuGeneral')", dentalGeneral + 10);
        const ops = indexSrc.indexOf("title: tm('bShellMenuOperations')");
        expect(indexSrc.indexOf('CLINIC_BOARD_SHELL_TAB_ID', secondGeneral)).toBeLessThan(ops);
        const v2Src = readFileSync(resolve('src/components/beauty/components/ClinicV2SideRail.tsx'), 'utf8');
        const v2Appointments = v2Src.indexOf("id: 'appointments'");
        const v2Customers = v2Src.indexOf("id: 'customers'");
        const v2Share = v2Src.indexOf('SHARE_OPEN_SLOTS_TAB_ID', v2Appointments);
        expect(v2Share).toBeGreaterThan(v2Appointments);
        expect(v2Share).toBeLessThan(v2Customers);
        const clientsAt = indexSrc.indexOf("id: 'clients'", ops);
        const calendarAt = indexSrc.indexOf("id: 'calendar'", ops);
        expect(calendarAt).toBeGreaterThan(clientsAt);
        expect(indexSrc).toContain('<ShareOpenSlotsPage');
        expect(indexSrc).toContain('onOpenShareSlots={() => setActiveTab(SHARE_OPEN_SLOTS_TAB_ID)}');

        const boardSrc = readFileSync(resolve('src/components/beauty/pages/ClinicBoardPage.tsx'), 'utf8');
        expect(boardSrc).toContain('onOpenShareSlots?.()');
        expect(boardSrc).not.toContain('ClinicBoardShareDialog');
        expect(boardSrc).not.toContain('ShareOpenSlotsStudio');

        const pageSrc = readFileSync(resolve('src/components/beauty/pages/ShareOpenSlotsPage.tsx'), 'utf8');
        const storySrc = readFileSync(resolve('src/components/beauty/share-slots/shareSlotsStory.ts'), 'utf8');
        expect(pageSrc).not.toContain('PercentBodyModal');
        for (const word of BANNED) {
            expect(pageSrc.toLowerCase()).not.toContain(word);
            expect(storySrc.toLowerCase()).not.toContain(word);
        }

        const onBack = vi.fn();
        render(<ShareOpenSlotsPage onBack={onBack} />);
        expect(screen.getByRole('heading', { name: 'Boş saatleri paylaş' })).toBeTruthy();
        expect(screen.getByText(/seçilen WhatsApp sohbetine mesaj olarak gider/)).toBeTruthy();
        expect(screen.getByRole('button', { name: "Instagram'da paylaş" })).toBeTruthy();
        expect(screen.getByRole('button', { name: "WhatsApp'ta gönder" })).toBeTruthy();
        expect(screen.getByText(/WhatsApp durumu olarak yayınlanmaz/)).toBeTruthy();
        expect(screen.getByRole('option', { name: 'Tüm ekip' })).toBeTruthy();
        expect(await screen.findByRole('option', { name: 'Roza' })).toBeTruthy();
        const today = formatLocalYmd(new Date());
        expect(await screen.findByTestId(`share-slot-${today}-09:00`)).toBeTruthy();
        expect(screen.queryByTestId(`share-slot-${today}-10:00`)).toBeNull();
        expect(screen.queryByTestId(`share-slot-${today}-10:30`)).toBeNull();
        expect(screen.getByTestId('share-slots-counter').textContent).toMatch(/\d+ \/ \d+ saat seçili/);
        expect(screen.getByTestId('share-slots-phone').textContent).toContain('Nora Klinik');
        expect(screen.getByTestId('share-slots-phone').textContent).toContain('RetailEX');
        expect(screen.getByTestId('share-slots-phone').textContent).toContain('Boş saatlerimiz');
        expect(screen.getByTestId('share-slots-download').textContent).toContain('Videoyu indir');
        expect(screen.getByTestId('share-slots-instagram').textContent).toContain('Instagram\'da paylaş');
        expect(screen.getByTestId('share-slots-whatsapp-send').textContent).toContain('WhatsApp\'ta gönder');
        expect(screen.getByTestId('share-slots-ig-off').textContent).toContain('Hesap bağlı değil');
        expect(screen.getByTestId('share-slots-wa-recipient')).toBeTruthy();
        fireEvent.click(screen.getByTestId('share-slots-mode-image'));
        expect(screen.getByTestId('share-slots-download').textContent).toContain('Görseli indir');
        expect(screen.queryByRole('dialog')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Geri' }));
        expect(onBack).toHaveBeenCalledTimes(1);

        const open = vi.spyOn(window, 'open').mockImplementation(() => null);
        fireEvent.click(screen.getByTestId('share-slots-whatsapp'));
        expect(String(open.mock.calls[0]?.[0])).toContain('https://wa.me/?text=');
        const decoded = decodeURIComponent(String(open.mock.calls[0]?.[0]));
        expect(decoded).toContain('09:00-09:30');
        expect(decoded).not.toContain('10:00-10:30');
        expect(decoded).toContain('RetailEX');

        const onOpen = vi.fn();
        render(<ClinicBoardPage onOpenShareSlots={onOpen} />);
        fireEvent.click(await screen.findByTestId('clinic-board-share-slots'));
        expect(onOpen).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole('dialog')).toBeNull();
    });
});
