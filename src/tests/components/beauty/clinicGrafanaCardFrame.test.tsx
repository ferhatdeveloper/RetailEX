import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import {
    CLINIC_V2_GRAFANA_SIZE_KEY,
    ClinicGrafanaCardFrame,
} from '../../../components/beauty/components/ClinicGrafanaCardFrame';
import { translate, type Language } from '../../../locales/module-translations';

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

function frame(uid: string, title: string) {
    return (
        <ClinicGrafanaCardFrame uid={uid} title={title}>
            <iframe title={title} src={`/embed/${uid}`} />
        </ClinicGrafanaCardFrame>
    );
}

describe('ClinicGrafanaCardFrame', () => {
    beforeEach(() => {
        localStorage.removeItem(CLINIC_V2_GRAFANA_SIZE_KEY);
    });

    it('kademe değişince yükseklik değişir ve genişletince tam genişlik true olur', () => {
        const view = (
            <div className="grid grid-cols-2">
                {frame('pano-a', 'Güzellik panosu')}
                {frame('pano-b', 'Kasa panosu')}
            </div>
        );
        const first = render(view);
        const body = (uid: string) => {
            const card = screen.getAllByTestId('clinic-grafana-card').find((node) => node.getAttribute('data-uid') === uid);
            if (!card) throw new Error(uid);
            return card.querySelector('[data-testid="clinic-grafana-frame-body"]') as HTMLElement;
        };
        const card = (uid: string) => {
            const node = screen.getAllByTestId('clinic-grafana-card').find((item) => item.getAttribute('data-uid') === uid);
            if (!node) throw new Error(uid);
            return node;
        };

        expect(body('pano-a').style.height).toBe('280px');
        expect(card('pano-a').getAttribute('data-wide')).toBe('false');
        expect(screen.getAllByRole('button', { name: 'Küçült' })).toHaveLength(2);
        expect(screen.getAllByRole('button', { name: 'Büyüt' })).toHaveLength(2);
        expect(screen.getAllByRole('button', { name: 'Alanı genişlet' })).toHaveLength(2);

        const growA = card('pano-a').querySelector('[data-testid="clinic-grafana-grow"]') as HTMLButtonElement;
        fireEvent.click(growA);
        expect(body('pano-a').style.height).toBe('420px');
        fireEvent.click(growA);
        expect(body('pano-a').style.height).toBe('640px');
        expect(body('pano-b').style.height).toBe('280px');

        const shrinkA = card('pano-a').querySelector('[data-testid="clinic-grafana-shrink"]') as HTMLButtonElement;
        fireEvent.click(shrinkA);
        expect(body('pano-a').style.height).toBe('420px');

        fireEvent.click(card('pano-a').querySelector('[data-testid="clinic-grafana-wide"]') as HTMLButtonElement);
        expect(card('pano-a').getAttribute('data-wide')).toBe('true');
        expect(card('pano-a').style.gridColumn).toBe('1 / -1');
        expect(card('pano-b').getAttribute('data-wide')).toBe('false');
        expect(screen.getAllByRole('button', { name: 'Alanı daralt' })).toHaveLength(1);
        expect(screen.getAllByRole('button', { name: 'Alanı genişlet' })).toHaveLength(1);

        const saved = JSON.parse(localStorage.getItem(CLINIC_V2_GRAFANA_SIZE_KEY) || '{}') as {
            heights: Record<string, number>;
            wideUid: string;
        };
        expect(CLINIC_V2_GRAFANA_SIZE_KEY).toBe('retailex_clinic_v2_grafana_size');
        expect(saved.heights['pano-a']).toBe(420);
        expect(saved.heights['pano-b']).toBeUndefined();
        expect(saved.wideUid).toBe('pano-a');

        fireEvent.click(card('pano-b').querySelector('[data-testid="clinic-grafana-wide"]') as HTMLButtonElement);
        expect(card('pano-b').getAttribute('data-wide')).toBe('true');
        expect(card('pano-a').getAttribute('data-wide')).toBe('false');

        fireEvent.click(card('pano-b').querySelector('[data-testid="clinic-grafana-wide"]') as HTMLButtonElement);
        expect(card('pano-a').getAttribute('data-wide')).toBe('false');
        expect(card('pano-b').getAttribute('data-wide')).toBe('false');
        expect(card('pano-b').style.gridColumn).toBe('');

        first.unmount();
        render(view);
        expect(body('pano-a').style.height).toBe('420px');
        expect(card('pano-a').getAttribute('data-wide')).toBe('false');
    });

    it('boyut düğmeleri dört dilde dolu', () => {
        const keys = [
            'bClinicV2GrafanaShrink',
            'bClinicV2GrafanaGrow',
            'bClinicV2GrafanaExpand',
            'bClinicV2GrafanaCollapse',
        ];
        const langs: Language[] = ['tr', 'en', 'ar', 'ku'];
        for (const key of keys) {
            for (const lang of langs) {
                expect(translate(key, lang), `${key}/${lang}`).not.toBe(key);
            }
        }
        expect(translate('bClinicV2GrafanaShrink', 'tr')).toBe('Küçült');
        expect(translate('bClinicV2GrafanaGrow', 'tr')).toBe('Büyüt');
        expect(translate('bClinicV2GrafanaExpand', 'tr')).toBe('Alanı genişlet');
        expect(translate('bClinicV2GrafanaCollapse', 'tr')).toBe('Alanı daralt');
    });
});
