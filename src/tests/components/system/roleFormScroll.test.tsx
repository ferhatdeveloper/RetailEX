import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { rbacUiTranslations } from '../../../locales/rbacUiTranslations';

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({}),
  useSearchParams: () => [new URLSearchParams()],
}));

vi.mock('../../../contexts/LanguageContext', () => ({
  useLanguage: () => ({
    language: 'tr',
    t: {},
    tm: (key: string) => rbacUiTranslations[key]?.tr || key,
  }),
}));

vi.mock('../../../contexts/ThemeContext', () => ({
  useTheme: () => ({ darkMode: false }),
}));

vi.mock('../../../services/api/roles', () => ({
  roleAPI: {
    getAll: vi.fn(async () => []),
    create: vi.fn(),
    update: vi.fn(),
  },
}));

import { RoleForm } from '../../../components/system/RoleForm';

describe('rol formu yetki matrisi kaydırma', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 900 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 640 });
  });

  it('üst çubuk sabit kalır, matris ve son grup aynı kaydırma gövdesindedir', () => {
    render(
      <div style={{ height: 480, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <RoleForm />
      </div>,
    );

    const page = screen.getByTestId('role-form-page');
    expect(page.className).toContain('min-h-0');
    expect(page.className).toContain('flex');
    expect(page.className).toContain('flex-col');
    expect(page.className).toContain('h-full');
    expect(page.className).toContain('overflow-hidden');
    expect(page.className).not.toContain('overflow-y-auto');

    const header = screen.getByTestId('role-form-header');
    expect(header.className).toContain('shrink-0');
    const save = screen.getByRole('button', { name: 'createRole' });
    expect(header.contains(save)).toBe(true);

    const scroll = screen.getByTestId('role-form-scroll');
    expect(scroll.className).toContain('flex-1');
    expect(scroll.className).toContain('min-h-0');
    expect(scroll.className).toContain('overflow-y-auto');
    expect(scroll.className).not.toContain('overflow-hidden');
    expect(scroll.contains(header)).toBe(false);
    expect(scroll.contains(save)).toBe(false);

    const lastGroup = screen.getByRole('button', { name: /Yönetim ve Sistem Kuruluşu/ });
    const matrix = screen.getByTestId('role-form-matrix');
    expect(scroll.contains(lastGroup)).toBe(true);
    expect(scroll.contains(matrix)).toBe(true);
    expect(matrix.textContent).toContain('dashboard');
    expect(
      lastGroup.compareDocumentPosition(matrix) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    const clippingAside = page.querySelector('aside');
    expect(clippingAside?.className).not.toContain('overflow-y-auto');
    expect(clippingAside?.className).not.toContain('overflow-hidden');
  });
});
