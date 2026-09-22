import { beforeEach, describe, expect, it } from 'vitest';
import { usePosDateOverrideStore, getPosNow, notifyPosSaleSuccess } from '../../store/usePosDateOverrideStore';

describe('usePosDateOverrideStore', () => {
  beforeEach(() => {
    usePosDateOverrideStore.setState({
      overrideIso: null,
      appliedAtMs: null,
      resetAfterSale: true,
    });
  });

  it('defaults resetAfterSale to true', () => {
    expect(usePosDateOverrideStore.getState().resetAfterSale).toBe(true);
  });

  it('getPosNow returns override clock while active', () => {
    const base = new Date('2026-09-21T09:55:00');
    usePosDateOverrideStore.getState().setOverride(base.toISOString(), true);
    const now = getPosNow();
    expect(now.getFullYear()).toBe(2026);
    expect(now.getMonth()).toBe(8);
    expect(now.getDate()).toBe(21);
    expect(now.getHours()).toBe(9);
  });

  it('clears override after sale when resetAfterSale is true', () => {
    usePosDateOverrideStore.getState().setOverride(new Date('2026-09-21T09:55:00').toISOString(), true);
    expect(usePosDateOverrideStore.getState().isActive()).toBe(true);
    notifyPosSaleSuccess();
    expect(usePosDateOverrideStore.getState().isActive()).toBe(false);
  });

  it('keeps override after sale when resetAfterSale is false', () => {
    usePosDateOverrideStore.getState().setOverride(new Date('2026-09-21T09:55:00').toISOString(), false);
    notifyPosSaleSuccess();
    expect(usePosDateOverrideStore.getState().isActive()).toBe(true);
  });
});
