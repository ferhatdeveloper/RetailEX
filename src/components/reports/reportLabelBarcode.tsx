import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import JsBarcode from 'jsbarcode';

export function reportBarcodeFormat(value: string): 'EAN13' | 'CODE128' {
  if (/^\d{13}$/.test(value)) return 'EAN13';
  return 'CODE128';
}

function estimateBarcodeModuleWidthPx(value: string, widthPx: number): number {
  const fmt = reportBarcodeFormat(value);
  if (fmt === 'EAN13' && /^\d{13}$/.test(value)) {
    return Math.max(0.9, Math.min(4, widthPx / 95));
  }
  const len = Math.max(value.length, 3);
  const modulesGuess = 56 + len * 14;
  return Math.max(0.75, Math.min(4, widthPx / modulesGuess));
}

function fitBarcodeSvgToContainer(svg: SVGSVGElement) {
  const apply = () => {
    try {
      const b = svg.getBBox();
      if (!Number.isFinite(b.width) || !Number.isFinite(b.height) || b.width <= 0 || b.height <= 0) return;
      const pad = 0.5;
      svg.setAttribute('viewBox', `${b.x - pad} ${b.y - pad} ${b.width + pad * 2} ${b.height + pad * 2}`);
      svg.removeAttribute('width');
      svg.removeAttribute('height');
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      svg.style.width = '100%';
      svg.style.height = '100%';
      svg.style.maxWidth = '100%';
      svg.style.maxHeight = '100%';
      svg.style.display = 'block';
    } catch {
      /* layout henüz hazır değil */
    }
  };
  apply();
  requestAnimationFrame(() => {
    apply();
    requestAnimationFrame(apply);
  });
}

function ReportBarcodeSvg({
  svgId,
  value,
  widthPx,
  heightPx,
}: {
  svgId: string;
  value: string;
  widthPx: number;
  heightPx: number;
}) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const el = svgRef.current;
    if (!el || !value || widthPx < 2 || heightPx < 2) return;
    while (el.firstChild) el.removeChild(el.firstChild);

    const textReserve = Math.min(Math.max(8, heightPx * 0.26), heightPx * 0.42);
    const barH = Math.max(6, Math.floor(heightPx - textReserve - 1));
    const modW = estimateBarcodeModuleWidthPx(value, widthPx);
    const fmt = reportBarcodeFormat(value);
    const opts = {
      format: fmt,
      width: modW,
      height: barH,
      displayValue: true,
      fontSize: Math.max(5, Math.min(14, Math.floor(heightPx * 0.17))),
      textMargin: 0,
      margin: 0,
      background: '#ffffff',
    } as const;

    const draw = (format: 'EAN13' | 'CODE128') => {
      while (el.firstChild) el.removeChild(el.firstChild);
      JsBarcode(el, value, { ...opts, format });
      fitBarcodeSvgToContainer(el);
    };

    try {
      draw(fmt);
    } catch {
      try {
        draw('CODE128');
      } catch {
        /* geçersiz barkod */
      }
    }
  }, [value, widthPx, heightPx, svgId]);

  return (
    <svg
      id={svgId}
      ref={svgRef}
      className="block min-h-0 min-w-0"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={value}
    />
  );
}

export function ReportBarcodePreview({ svgId, value }: { svgId: string; value: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const read = () => {
      const w = Math.max(1, Math.round(el.clientWidth));
      const h = Math.max(1, Math.round(el.clientHeight));
      setDims((d) => (d.w === w && d.h === h ? d : { w, h }));
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={wrapRef}
      className="w-full h-full min-h-0 min-w-0 flex items-center justify-center overflow-hidden box-border"
    >
      {dims.w > 0 && dims.h > 0 ? (
        <ReportBarcodeSvg svgId={svgId} value={value} widthPx={dims.w} heightPx={dims.h} />
      ) : null}
    </div>
  );
}
