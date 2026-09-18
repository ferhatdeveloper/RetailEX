import { describe, expect, it } from 'vitest';
import { clampReportBusinessType, resolveEnabledReportBusinessTypes } from './reportBusinessLineOptions';

describe('resolveEnabledReportBusinessTypes', () => {
  it('firma güzellik modülündeyse yalnızca beauty döner', () => {
    expect(resolveEnabledReportBusinessTypes({ enabled_modules: ['beauty', 'management'] })).toEqual([
      'beauty',
    ]);
  });

  it('firma POS açıksa perakende (retail) ekler', () => {
    const types = resolveEnabledReportBusinessTypes({ enabled_modules: ['pos', 'management'] });
    expect(types).toContain('retail');
    expect(types).not.toContain('restaurant');
  });

  it('modül yokken dört dikeyi açmaz — güzellik varsayılanı', () => {
    expect(resolveEnabledReportBusinessTypes({ enabled_modules: [] })).toEqual(['beauty']);
    expect(resolveEnabledReportBusinessTypes(null)).toEqual(['beauty']);
  });
});

describe('clampReportBusinessType', () => {
  it('tek seçenekte geçersiz tipi güzelliğe çeker', () => {
    expect(clampReportBusinessType('retail', ['beauty'])).toBe('beauty');
  });
});
