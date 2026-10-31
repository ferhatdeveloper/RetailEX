import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { translate } from '../../locales/module-translations';
import { MODAL_OVERLAY_NESTED_Z, MODAL_OVERLAY_Z } from '../../components/shared/FullscreenBodyPortal';
import { PercentBodyModal } from '../../components/shared/PercentBodyModal';
import { ExpenseCategoryManagerModal, type ExpenseCategoryManagerRow } from '../../components/accounting/reports/ExpenseCategoryManagerModal';
import { expenseCategoryAddedByLabel, resolveExpenseCategoryLabel } from '../../utils/expenseCategoryLabel';

vi.mock('../../contexts/LanguageContext', () => ({
  useLanguage: () => ({
    language: 'tr',
    tm: (key: string) => translate(key, 'tr'),
    setLanguage: () => {},
    t: {},
    translations: {},
  }),
}));

vi.mock('../../contexts/ThemeContext', () => ({
  useTheme: () => ({ darkMode: false, setDarkMode: () => {}, toggleDarkMode: () => {} }),
}));

vi.mock('../../contexts/FirmaDonemContext', () => ({
  useFirmaDonem: () => ({ selectedFirm: { firm_nr: '001', ana_para_birimi: 'IQD' } }),
  useOptionalFirmaDonem: () => null,
}));

const rows: ExpenseCategoryManagerRow[] = [
  { id: 'sys-1', code: 'rent', name: 'Kira', is_active: true },
  { id: 'user-1', code: 'yeni_kategori', name: 'yeni_kategori', is_active: true, created_by_name: 'Aylin Kaya' },
  { id: 'user-2', code: 'misafir_gideri', name: 'expenseCategory.misafir_gideri', is_active: true },
  { id: 'user-3', code: 'konaklama', name: 'KONAKLAMA', is_active: false, created_by_name: 'Aylin Kaya' },
];

function StackHarness() {
  const [expenseOpen, setExpenseOpen] = useState(true);
  const [managerOpen, setManagerOpen] = useState(true);
  const [kept, setKept] = useState('Su');
  return (
    <>
      {expenseOpen ? (
        <PercentBodyModal ariaLabel="Yeni Gider" onClose={() => setExpenseOpen(false)} size="compact">
          <input aria-label="Kategori alanı" value={kept} onChange={(e) => setKept(e.target.value)} />
        </PercentBodyModal>
      ) : null}
      {managerOpen ? (
        <ExpenseCategoryManagerModal
          categories={rows}
          onClose={() => setManagerOpen(false)}
          onCreate={async () => true}
          onRename={async () => true}
          onRemove={async () => {}}
        />
      ) : null}
    </>
  );
}

describe('gider kategori penceresi', () => {
  it('kategori penceresi gider formunun üstünde, iç içe katmanda durur', () => {
    render(<StackHarness />);
    const expense = screen.getByRole('dialog', { name: 'Yeni Gider' });
    const manager = screen.getByRole('dialog', { name: 'Gider Kategorileri' });
    expect(Number(manager.style.zIndex)).toBe(MODAL_OVERLAY_NESTED_Z);
    expect(Number(expense.style.zIndex)).toBe(MODAL_OVERLAY_Z);
    expect(Number(manager.style.zIndex)).toBeGreaterThan(Number(expense.style.zIndex));

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Gider Kategorileri' })).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Yeni Gider' })).toBeInTheDocument();
    expect(screen.getByLabelText('Kategori alanı')).toHaveValue('Su');
  });

  it('kullanıcı satırında Değiştir vardır, sistem satırında yoktur', async () => {
    const onRename = vi.fn(async () => true);
    render(
      <ExpenseCategoryManagerModal
        categories={rows}
        onClose={() => {}}
        onCreate={async () => true}
        onRename={onRename}
        onRemove={async () => {}}
      />,
    );

    expect(screen.getByLabelText('Yeni kategori adı')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Ekle' })).toBeInTheDocument();

    const systemRow = screen.getByText('Kira').closest('tr');
    expect(systemRow).toBeTruthy();
    expect(within(systemRow as HTMLElement).queryByRole('button', { name: 'Değiştir' })).toBeNull();

    const userRow = screen.getByText('Yeni Kategori').closest('tr');
    expect(userRow).toBeTruthy();
    fireEvent.click(within(userRow as HTMLElement).getByRole('button', { name: 'Değiştir' }));
    const field = screen.getByLabelText('Kategori adı');
    expect(field).toHaveValue('Yeni Kategori');
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => {
      expect(onRename).toHaveBeenCalledWith('user-1', 'Yeni Kategori', true);
    });
  });

  it('Ekleyen, ekleyen adını ve sistem tohumunda Sistem yazar', () => {
    expect(expenseCategoryAddedByLabel(
      { code: 'rent', name: 'Kira' },
      { system: 'Sistem', unknownUser: 'Kullanıcı' },
    )).toBe('Sistem');
    expect(expenseCategoryAddedByLabel(
      { code: 'konaklama', name: 'KONAKLAMA', created_by_name: 'Aylin Kaya' },
      { system: 'Sistem', unknownUser: 'Kullanıcı' },
    )).toBe('Aylin Kaya');
    expect(expenseCategoryAddedByLabel(
      { code: 'misafir_gideri', name: 'Misafir Gideri' },
      { system: 'Sistem', unknownUser: 'Kullanıcı' },
    )).toBe('Kullanıcı');

    render(
      <ExpenseCategoryManagerModal
        categories={rows}
        onClose={() => {}}
        onCreate={async () => true}
        onRename={async () => true}
        onRemove={async () => {}}
      />,
    );

    expect(screen.getByText('EKLEYEN')).toBeInTheDocument();
    expect(screen.getByText('DURUM')).toBeInTheDocument();
    expect(screen.queryByText('TİP')).toBeNull();
    expect(screen.queryByText('AKTİF')).toBeNull();

    const systemRow = screen.getByText('Kira').closest('tr') as HTMLElement;
    expect(within(systemRow).getByText('Sistem')).toBeInTheDocument();
    expect(within(systemRow).queryByRole('button', { name: 'Değiştir' })).toBeNull();
    expect(within(systemRow).queryByRole('button', { name: 'Sil' })).toBeNull();

    const namedRow = screen.getByText('Yeni Kategori').closest('tr') as HTMLElement;
    expect(within(namedRow).getByText('Aylin Kaya')).toBeInTheDocument();

    const unknownRow = screen.getByText('Misafir Gideri').closest('tr') as HTMLElement;
    expect(within(unknownRow).getByText('Kullanıcı')).toBeInTheDocument();
  });

  it('Değiştir durum olarak Aktif veya Pasif yazar', async () => {
    const onRename = vi.fn(async () => true);
    render(
      <ExpenseCategoryManagerModal
        categories={rows}
        onClose={() => {}}
        onCreate={async () => true}
        onRename={onRename}
        onRemove={async () => {}}
      />,
    );

    const activeRow = screen.getByText('Yeni Kategori').closest('tr') as HTMLElement;
    fireEvent.click(within(activeRow).getByRole('button', { name: 'Değiştir' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Durum' }), { target: { value: 'passive' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => {
      expect(onRename).toHaveBeenCalledWith('user-1', 'Yeni Kategori', false);
    });

    const passiveRow = screen.getByText('KONAKLAMA').closest('tr') as HTMLElement;
    fireEvent.click(within(passiveRow).getByRole('button', { name: 'Değiştir' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Durum' }), { target: { value: 'active' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => {
      expect(onRename).toHaveBeenCalledWith('user-3', 'KONAKLAMA', true);
    });
  });

  it('Sil kategoriyi listeden kaldırır ve Pasif yapmaz', async () => {
    const onRename = vi.fn(async () => true);
    function Harness() {
      const [categories, setCategories] = useState(rows);
      return (
        <ExpenseCategoryManagerModal
          categories={categories}
          onClose={() => {}}
          onCreate={async () => true}
          onRename={onRename}
          onRemove={async (id) => {
            setCategories((prev) => prev.filter((row) => row.id !== id));
          }}
        />
      );
    }
    render(<Harness />);

    const userRow = screen.getByText('Yeni Kategori').closest('tr') as HTMLElement;
    expect(within(userRow).getByText('Aktif')).toBeInTheDocument();
    fireEvent.click(within(userRow).getByRole('button', { name: 'Sil' }));

    await waitFor(() => {
      expect(screen.queryByText('Yeni Kategori')).toBeNull();
    });
    expect(onRename).not.toHaveBeenCalled();
    const guestRow = screen.getByText('Misafir Gideri').closest('tr') as HTMLElement;
    expect(within(guestRow).getByText('Aktif')).toBeInTheDocument();
    const keptRow = screen.getByText('KONAKLAMA').closest('tr') as HTMLElement;
    expect(within(keptRow).getByText('Pasif')).toBeInTheDocument();
  });

  it('ham anahtar ve düz ad okunur etiket olur', () => {
    const tr = (key: string) => translate(key, 'tr');
    expect(resolveExpenseCategoryLabel('expenseCategory.misafir_gideri', { translate: tr })).toBe('Misafir Gideri');
    expect(resolveExpenseCategoryLabel('expenseCategory.hospitality_expenses', { translate: tr })).toBe('Ağırlama Giderleri');
    expect(resolveExpenseCategoryLabel('expenseCategory.new_category_test', { translate: tr })).toBe('Yeni Kategori Test');
    expect(resolveExpenseCategoryLabel('yeni_kategori', { translate: tr })).toBe('Yeni Kategori');
    expect(resolveExpenseCategoryLabel('Su', { translate: tr })).toBe('Su');
    expect(resolveExpenseCategoryLabel('Maaş', { translate: tr })).toBe('Maaş');
    expect(resolveExpenseCategoryLabel('Kira', { translate: tr })).toBe('Kira');

    render(
      <ExpenseCategoryManagerModal
        categories={rows}
        onClose={() => {}}
        onCreate={async () => true}
        onRename={async () => true}
        onRemove={async () => {}}
      />,
    );
    expect(screen.getByText('Misafir Gideri')).toBeInTheDocument();
    expect(screen.queryByText('expenseCategory.misafir_gideri')).toBeNull();
    expect(screen.queryByText('yeni_kategori')).toBeNull();
  });
});
