import type { CSSProperties } from 'react';
import { RECEIPT_80MM_LOGO_MAX_PX } from '../../utils/receipt80mmDocumentCss';
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
  logoClassName = 'h-auto w-auto object-contain',
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
        <div data-print-firm-logo="1" className="rx-firm-logo mb-0.5" style={{ ...blockCenter, direction: 'ltr' }}>
          <img
            src={logo}
            alt=""
            className={logoClassName}
            style={{
              maxHeight: RECEIPT_80MM_LOGO_MAX_PX,
              maxWidth: RECEIPT_80MM_LOGO_MAX_PX,
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
