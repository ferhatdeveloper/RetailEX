import { describe, it, expect } from 'vitest';
import { scalePluLookupVariants } from '../../services/api/products';

describe('scalePluLookupVariants', () => {
  it('10 hane tartı kodu varyantları', () => {
    const variants = scalePluLookupVariants('1000000009');
    expect(variants).toContain('1000000009');
    expect(variants).toContain('1000000009'.padStart(10, '0'));
    expect(variants).not.toContain('11000000009');
  });
});
