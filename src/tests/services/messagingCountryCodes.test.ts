import { describe, it, expect } from 'vitest';
import {
  normalizePhoneDigits,
  resolveCountryCodeForLocalDigits,
  repairMisprefixedIraqiDigits,
} from '../../services/messaging/messagingCountryCodes';

describe('resolveCountryCodeForLocalDigits', () => {
  it('Irak 7xx → 964 (varsayılan TR olsa bile)', () => {
    expect(resolveCountryCodeForLocalDigits('7508555646', '90')).toBe('964');
  });

  it('TR 5xx → 90 (varsayılan IQ olsa bile)', () => {
    expect(resolveCountryCodeForLocalDigits('5443633334', '964')).toBe('90');
  });

  it('diğer lider rakam → varsayılan', () => {
    expect(resolveCountryCodeForLocalDigits('6123456789', '90')).toBe('90');
    expect(resolveCountryCodeForLocalDigits('6123456789', '964')).toBe('964');
  });
});

describe('repairMisprefixedIraqiDigits', () => {
  it('9075… → 96475…', () => {
    expect(repairMisprefixedIraqiDigits('907508555646')).toBe('9647508555646');
  });

  it('geçerli TR 905… dokunulmaz', () => {
    expect(repairMisprefixedIraqiDigits('905443633334')).toBe('905443633334');
  });
});

describe('normalizePhoneDigits — TR varsayılan 90', () => {
  const cc = '90';

  it.each([
    ['7508555646', '9647508555646'],
    ['07508555646', '9647508555646'],
    ['5443633334', '905443633334'],
    ['05443633334', '905443633334'],
    ['905443633334', '905443633334'],
    ['9647508555646', '9647508555646'],
    ['907508555646', '9647508555646'],
  ] as const)('%s → %s', (input, expected) => {
    expect(normalizePhoneDigits(input, cc)).toBe(expected);
  });
});
