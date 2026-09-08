import React, { useState } from 'react';

/** Küçük ürün görseli — yoksa / bozulursa beyaz zemin + “Resim yok” */
export function QrProductThumb({
  src,
  label,
  size = 56,
  className = '',
}: {
  src?: string | null;
  label: string;
  size?: number;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  const dim = `${size}px`;
  const showImg = !!src && !broken;

  if (showImg) {
    return (
      <div
        className={`shrink-0 overflow-hidden rounded-xl ${className}`}
        style={{ width: dim, height: dim, background: '#fff' }}
      >
        <img
          src={src!}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
          onError={() => setBroken(true)}
        />
      </div>
    );
  }

  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-xl px-1 text-center ${className}`}
      style={{
        width: dim,
        height: dim,
        background: '#ffffff',
        color: '#64748b',
      }}
      aria-hidden
    >
      <span className="text-[9px] font-semibold leading-tight tracking-wide uppercase">
        {label}
      </span>
    </div>
  );
}
