import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import { translate } from '../../../locales/module-translations';
import { ClinicShellLanguageCluster } from '../../../components/beauty/components/ClinicShellLanguageCluster';
import { shouldShowGoToManagement } from '../../../components/shared/GoToManagementIconButton';

vi.mock('../../../contexts/LanguageContext', async () => {
    const actual = await vi.importActual<typeof import('../../../locales/module-translations')>(
        '../../../locales/module-translations',
    );
    return {
        useLanguage: () => ({
            language: 'tr',
            tm: (key: string) => actual.translate(key, 'tr'),
            t: { languageSelectionTitle: 'Dil Seçimi' },
        }),
    };
});

describe('Yönetime geç ikonu', () => {
    it('dil kümesinde ikon olarak durur ve mevcut yönetim geçişini çağırır', () => {
        const onOpenLanguage = vi.fn();
        const onGoToManagement = vi.fn();
        render(
            <ClinicShellLanguageCluster
                onOpenLanguage={onOpenLanguage}
                onGoToManagement={onGoToManagement}
            />,
        );

        const cluster = screen.getByTestId('clinic-language-cluster');
        const language = screen.getByRole('button', { name: 'Dil Seçimi' });
        const go = screen.getByRole('button', { name: 'Yönetime geç' });

        expect(cluster.contains(language)).toBe(true);
        expect(cluster.contains(go)).toBe(true);
        expect(language.nextElementSibling).toBe(go);
        expect(go).toHaveAttribute('title', 'Yönetime geç');
        expect(go.textContent?.replace(/\s/g, '')).toBe('');

        fireEvent.click(go);
        expect(onGoToManagement).toHaveBeenCalledTimes(1);
        expect(onOpenLanguage).not.toHaveBeenCalled();

        fireEvent.click(language);
        expect(onOpenLanguage).toHaveBeenCalledTimes(1);
    });

    it('yetki veya geçiş yoksa düğme çizilmez', () => {
        render(<ClinicShellLanguageCluster onOpenLanguage={() => undefined} />);
        expect(screen.getByRole('button', { name: 'Dil Seçimi' })).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Yönetime geç' })).toBeNull();
    });

    it('yönetim ekranında gizlenir, diğer kabuklarda yetkiyle görünür', () => {
        expect(shouldShowGoToManagement('management', true)).toBe(false);
        expect(shouldShowGoToManagement('beauty', true)).toBe(true);
        expect(shouldShowGoToManagement('pos', true)).toBe(true);
        expect(shouldShowGoToManagement('wms', false)).toBe(false);
    });

    it('dört dilde ipucu dolu ve klinik ile genel kabuk mevcut geçişe bağlı', () => {
        expect(translate('goToManagement', 'tr')).toBe('Yönetime geç');
        expect(translate('goToManagement', 'en')).toBe('Go to management');
        expect(translate('goToManagement', 'ar')).toBe('انتقل إلى الإدارة');
        expect(translate('goToManagement', 'ku')).toBe('بڕۆ بۆ بەڕێوەبردن');

        const beauty = readFileSync(resolve('src/components/beauty/index.tsx'), 'utf8');
        expect(beauty).toContain('<ClinicShellLanguageCluster');
        expect(beauty).toContain('onRequestManagementAccess');
        expect(beauty).toContain("hasPermission('management', 'READ')");
        expect(beauty).toContain('<ClinicV2SideRail');
        expect(beauty).toContain('MENU_GROUPS.map');
        expect(beauty).not.toContain("setCurrentModule('management')");

        const shell = readFileSync(resolve('src/components/system/MainLayout.tsx'), 'utf8');
        const buttons = shell.match(/<GoToManagementIconButton/g) ?? [];
        expect(buttons).toHaveLength(2);
        expect(shell).toContain("shouldShowGoToManagement(currentModule, hasPermission('management', 'READ'))");
        expect(shell).toContain('onClick={requestManagementAccess}');
    });
});
