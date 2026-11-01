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
  nameClassName = 'font-bold',
  logoClassName = 'h-10 w-auto object-contain',
  logoStyle,
}: PrintFirmBrandProps) {
  const name = String(firmName ?? '').trim();
  const logo = printableLogoSrc(logoDataUrl);
  if (!name && !logo) return null;
  return (
    <div data-print-firm-header="1" className="text-center">
      {logo ? (
        <div data-print-firm-logo="1" className="flex justify-center mb-1">
          <img src={logo} alt="" className={logoClassName} style={logoStyle} />
        </div>
      ) : null}
      {name ? (
        <div data-print-firm-name="1" className={`text-center ${nameClassName}`}>
          {name}
        </div>
      ) : null}
    </div>
  );
}
