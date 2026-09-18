import { describe, expect, it } from 'vitest';
import { isUuid, looksLikeUuid, newUuid, uuidOrNull } from '../../utils/pgUuid';

describe('uuidOrNull', () => {
  it('boş string ve kodu UUID kolonuna göndermez', () => {
    expect(uuidOrNull('')).toBeNull();
    expect(uuidOrNull('   ')).toBeNull();
    expect(uuidOrNull('000001')).toBeNull();
    expect(uuidOrNull('BOYA')).toBeNull();
  });

  it('geçerli UUID geçer', () => {
    const id = '550e8400-e29b-41d4-a716-446655440000';
    expect(uuidOrNull(id)).toBe(id);
    expect(isUuid(id)).toBe(true);
  });

  it('newUuid gerçek UUID üretir; kod değildir', () => {
    const id = newUuid();
    expect(isUuid(id)).toBe(true);
    expect(id).not.toBe('000001');
  });

  it('looksLikeUuid gevşek 8-4-4-4-12 yakalar', () => {
    expect(looksLikeUuid('000001')).toBe(false);
    expect(looksLikeUuid('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
  });
});
