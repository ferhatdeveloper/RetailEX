import type { CSSProperties } from 'react';
import { printableLogoSrc } from '../../utils/printFirmHeader';

type PrintFirmBrandProps = {
  firmName?: string | null;
  logoDataUrl?: string | null;
  nameClassName?: string;
  logoClassName?: string;
  logoStyle?: CSSProperties;
};

/** Ekran ve tarayıcı yazdırması: logo, hemen altında ortalı firma adı. */
export function PrintFirmBrand({
  firmName,
  logoDataUrl,
  nameClassName = 'font-semibold',
  logoClassName = 'max-h-14 h-auto w-auto object-contain',
  logoStyle,
}: PrintFirmBrandProps) {
  const name = String(firmName ?? '').trim();
  const logo = printableLogoSrc(logoDataUrl);
  if (!name && !logo) return null;
  const blockCenter: CSSProperties = {
    display: 'block',
    width: '100%',
    maxWidth: '100%',
    textAlign: 'center',
    float: 'none',
  };
  return (
    <div data-print-firm-header="1" className="rx-firm-header text-center" style={blockCenter}>
      {logo ? (
        <div data-print-firm-logo="1" className="rx-firm-logo mb-0.5" style={blockCenter}>
          <img
            src={logo}
            alt=""
            className={logoClassName}
            style={{
              maxHeight: 56,
              ...logoStyle,
              display: 'block',
              marginLeft: 'auto',
              marginRight: 'auto',
              float: 'none',
              width: 'auto',
              height: 'auto',
            }}
          />
        </div>
      ) : null}
      {name ? (
        <div data-print-firm-name="1" className={`rx-firm-name text-center ${nameClassName}`} style={blockCenter}>
          {name}
        </div>
      ) : null}
    </div>
  );
}
