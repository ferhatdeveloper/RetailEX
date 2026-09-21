import { describe, expect, it } from 'vitest';
import {
  isDevExDefaultHiddenColumnId,
  mergeDevExDefaultColumnVisibility,
} from '../../components/shared/DevExDataGrid';

describe('isDevExDefaultHiddenColumnId', () => {
  it('hides exact status/durum/actions ids', () => {
    expect(isDevExDefaultHiddenColumnId('status')).toBe(true);
    expect(isDevExDefaultHiddenColumnId('durum')).toBe(true);
    expect(isDevExDefaultHiddenColumnId('actions')).toBe(true);
    expect(isDevExDefaultHiddenColumnId('STATUS')).toBe(true);
  });

  it('hides report aliases used by günlük satış (statusLabel) and ERP', () => {
    expect(isDevExDefaultHiddenColumnId('statusLabel')).toBe(true);
    expect(isDevExDefaultHiddenColumnId('statusText')).toBe(true);
    expect(isDevExDefaultHiddenColumnId('colStatus')).toBe(true);
    expect(isDevExDefaultHiddenColumnId('campColStatus')).toBe(true);
  });

  it('hides aktif/is_active Durum columns', () => {
    expect(isDevExDefaultHiddenColumnId('is_active')).toBe(true);
    expect(isDevExDefaultHiddenColumnId('isActive')).toBe(true);
    expect(isDevExDefaultHiddenColumnId('aktif')).toBe(true);
    expect(isDevExDefaultHiddenColumnId('active')).toBe(true);
  });

  it('does not hide unrelated columns (incl. transaction)', () => {
    expect(isDevExDefaultHiddenColumnId('invoice_no')).toBe(false);
    expect(isDevExDefaultHiddenColumnId('total')).toBe(false);
    expect(isDevExDefaultHiddenColumnId('transaction')).toBe(false);
    expect(isDevExDefaultHiddenColumnId('select')).toBe(false);
  });
});

describe('mergeDevExDefaultColumnVisibility', () => {
  it('defaults statusLabel/status/actions to false when undefined', () => {
    const merged = mergeDevExDefaultColumnVisibility(
      [
        { id: 'receipt', header: 'Fiş' },
        { id: 'statusLabel', header: 'Durum' },
        { id: 'actions', header: 'İşlem' },
      ] as any,
      {},
    );
    expect(merged.statusLabel).toBe(false);
    expect(merged.actions).toBe(false);
    expect(merged.receipt).toBeUndefined();
  });

  it('preserves explicit user preference status:true', () => {
    const merged = mergeDevExDefaultColumnVisibility(
      [{ id: 'status', header: 'Durum' }] as any,
      { status: true },
    );
    expect(merged.status).toBe(true);
  });
});
