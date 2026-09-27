/**
 * Mesajlaşma ayarları — varsayılan ülke kodu seçimi (liste + Diğer özel).
 */
import React, { useEffect, useState } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import {
  MESSAGING_COUNTRY_CODE_OPTIONS,
  MESSAGING_COUNTRY_CODE_OTHER,
  isPresetCountryCode,
  sanitizeCountryCode,
} from '../../services/messaging/messagingCountryCodes';

type Props = {
  value: string;
  onChange: (code: string) => void;
  inputCls: string;
  labelCls?: string;
  showLabel?: boolean;
  showHint?: boolean;
  className?: string;
};

export function MessagingCountryCodeSelect({
  value,
  onChange,
  inputCls,
  labelCls = 'text-xs font-medium text-gray-500',
  showLabel = true,
  showHint = true,
  className = '',
}: Props) {
  const { tm } = useLanguage();
  const sanitized = sanitizeCountryCode(value, '90');
  const [otherMode, setOtherMode] = useState(() => !isPresetCountryCode(sanitized));
  const [customDigits, setCustomDigits] = useState(() =>
    isPresetCountryCode(sanitized) ? '' : sanitized,
  );

  useEffect(() => {
    const next = sanitizeCountryCode(value, '90');
    if (!isPresetCountryCode(next)) {
      setOtherMode(true);
      setCustomDigits(next);
    } else if (!otherMode) {
      setCustomDigits('');
    }
  }, [value, otherMode]);

  const selectVal = otherMode ? MESSAGING_COUNTRY_CODE_OTHER : sanitized;

  const handleSelect = (next: string) => {
    if (next === MESSAGING_COUNTRY_CODE_OTHER) {
      setOtherMode(true);
      const digits = customDigits.replace(/\D/g, '');
      setCustomDigits(digits);
      if (digits) onChange(digits);
      return;
    }
    setOtherMode(false);
    setCustomDigits('');
    onChange(next);
  };

  const handleCustom = (raw: string) => {
    const digits = raw.replace(/\D/g, '');
    setCustomDigits(digits);
    if (digits) onChange(digits);
  };

  return (
    <div className={className}>
      {showLabel && <label className={labelCls}>{tm('msgNotifyCountryCode')}</label>}
      <select
        className={`${inputCls}${showLabel ? ' mt-1' : ''}`}
        value={selectVal}
        onChange={(e) => handleSelect(e.target.value)}
        aria-label={tm('msgNotifyCountryCode')}
      >
        {MESSAGING_COUNTRY_CODE_OPTIONS.map((o) => (
          <option key={o.code} value={o.code}>
            +{o.code} — {tm(o.labelKey)}
          </option>
        ))}
        <option value={MESSAGING_COUNTRY_CODE_OTHER}>{tm('msgNotifyCountryCodeOther')}</option>
      </select>
      {otherMode && (
        <input
          className={`${inputCls} mt-2`}
          value={customDigits}
          onChange={(e) => handleCustom(e.target.value)}
          placeholder={tm('msgNotifyCountryCodeCustomPh')}
          inputMode="numeric"
          autoComplete="off"
          aria-label={tm('msgNotifyCountryCodeOther')}
        />
      )}
      {showHint && (
        <p className="mt-1 text-xs text-gray-500">
          {tm('msgNotifyCountryCodeHint').replace(
            '{code}',
            otherMode ? customDigits || sanitized : sanitized,
          )}
        </p>
      )}
    </div>
  );
}
