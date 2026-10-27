import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;

vi.mock('../../../contexts/LanguageContext', () => ({
  useLanguage: () => ({
    language: 'tr',
    t: {},
    tm: (key: string) =>
      ({
        page: 'Sayfa',
        of: '/',
        records: 'kayıt',
        first: 'İlk',
        last: 'Son',
        previous: 'Önceki',
        next: 'Sonraki',
        show: 'Göster',
        showAllColumns: 'Tümünü Göster',
        noDataFound: 'Kayıt yok',
        filterRefresh: 'Yenile',
      })[key] || key,
  }),
}));

vi.mock('../../../contexts/ThemeContext', () => ({
  useTheme: () => ({ darkMode: false }),
}));

vi.mock('../../../contexts/FirmaDonemContext', () => ({
  useFirmaDonem: () => ({ selectedFirm: null }),
}));

vi.mock('../../../shared/hooks/usePermission', () => ({
  usePermission: () => ({
    isAdmin: () => true,
    hasPermission: () => true,
  }),
}));

import { LocaleFilesModule } from '../../../components/system/LocaleFilesModule';

const ROW_COUNT = 80;

function localePayload() {
  const leaves: Record<string, string> = {};
  for (let i = 0; i < ROW_COUNT; i += 1) {
    const key = `k${String(i).padStart(3, '0')}`;
    leaves[key] = `metin ${i}`;
  }
  return JSON.stringify(leaves);
}

describe('dil dosyaları tablosu kaydırma', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 640 });
    const text = localePayload();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/content')) {
          return new Response(JSON.stringify({ text }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response(
          JSON.stringify({
            writable: true,
            roots: [
              {
                id: 'mobile-i18n',
                relative: 'mobile/src/i18n/locales',
                files: [{ file: 'tr.json', language: 'tr' }],
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }),
    );
  });

  it('sabit yükseklikte gövde kayar, arama durur, son satıra sayfa ile ulaşılır', async () => {
    render(
      <div style={{ height: 480, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <LocaleFilesModule />
      </div>,
    );

    await waitFor(() => {
      expect(screen.getByText('k000')).toBeInTheDocument();
    });

    const page = screen.getByTestId('locale-files-page');
    expect(page.className).toContain('min-h-0');
    expect(page.className).toContain('overflow-hidden');
    expect(page.className).not.toContain('overflow-y-auto');

    const search = screen.getByTestId('locale-files-search');
    expect(search.parentElement?.className).toContain('shrink-0');

    const gridHost = screen.getByTestId('locale-files-grid');
    expect(gridHost.className).toContain('flex-1');
    expect(gridHost.className).toContain('min-h-0');
    expect(gridHost.className).toContain('overflow-hidden');

    const body = gridHost.querySelector('[data-grid-body]');
    expect(body).toBeTruthy();
    expect(body?.className).toContain('min-h-0');
    expect(body?.className).toContain('overflow-y-auto');
    expect(body?.contains(search)).toBe(false);

    await waitFor(() => {
      expect(screen.getByText('Sayfa 1 / 2')).toBeInTheDocument();
    });
    const lastButton = screen.getByRole('button', { name: 'Son' });
    expect(lastButton).toBeEnabled();
    expect(body?.contains(lastButton)).toBe(false);
    expect(screen.queryByText('k079')).not.toBeInTheDocument();

    fireEvent.click(lastButton);

    await waitFor(() => {
      expect(screen.getByText('Sayfa 2 / 2')).toBeInTheDocument();
      expect(screen.getByText('k079')).toBeInTheDocument();
    });
    expect(screen.queryByText('k000')).not.toBeInTheDocument();
    expect(screen.getByTestId('locale-files-search')).toBe(search);

    fireEvent.change(search, { target: { value: 'k079' } });
    await waitFor(() => {
      expect(within(gridHost).getByText('k079')).toBeInTheDocument();
      expect(within(gridHost).queryByText('k050')).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('locale-files-search')).toHaveValue('k079');
  });
});
