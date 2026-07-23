import { useState } from 'react';
import { Printer, X } from 'lucide-react';
import { PercentBodyModal, PercentBodyModalScrollBody } from '../shared/PercentBodyModal';
import { printHtmlInMainDocument } from '../../utils/reportHtmlPrint';

type ReportHtmlPrintPreviewModalProps = {
  html: string;
  title: string;
  onClose: () => void;
  darkMode?: boolean;
  printLabel: string;
  closeLabel: string;
  hintLabel?: string;
};

/**
 * Mobil rapor yazdırma önizlemesi — yalnızca rapor HTML’i; Yazdır / Kapat.
 * Yazdırma ana belge kökü üzerinden (WebView’da tüm SPA’nın basılmasını önler).
 */
export function ReportHtmlPrintPreviewModal({
  html,
  title,
  onClose,
  darkMode = false,
  printLabel,
  closeLabel,
  hintLabel = 'Önizleme',
}: ReportHtmlPrintPreviewModalProps) {
  const [iframeH, setIframeH] = useState(420);

  const handlePrint = () => {
    printHtmlInMainDocument(html);
  };

  return (
    <PercentBodyModal
      onClose={onClose}
      size="wide"
      ariaLabel={title}
      shellClassName={darkMode ? '!bg-gray-800 !text-gray-100' : ''}
    >
      <div
        className="shrink-0 px-4 sm:px-6 py-4 text-white flex items-center justify-between gap-3 bg-[var(--asin-primary,#0E2433)]"
      >
        <div className="min-w-0">
          <h2 className="text-sm sm:text-base font-bold truncate">{title}</h2>
          <p className="text-[10px] uppercase tracking-wider text-white/80 mt-0.5">{hintLabel}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded-lg hover:bg-white/15 transition-colors shrink-0"
          aria-label={closeLabel}
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <PercentBodyModalScrollBody
        className={`p-3 sm:p-4 ${darkMode ? 'bg-gray-900' : 'bg-slate-100'}`}
      >
        <div
          className={`rounded-lg overflow-hidden border bg-white ${
            darkMode ? 'border-gray-600' : 'border-slate-200'
          }`}
        >
          <iframe
            title={title}
            className="w-full border-0 bg-white block"
            style={{ height: iframeH, minHeight: 280 }}
            srcDoc={html}
            onLoad={(e) => {
              const iframe = e.currentTarget;
              requestAnimationFrame(() => {
                try {
                  const d = iframe.contentDocument;
                  const inner =
                    d?.documentElement?.scrollHeight ?? d?.body?.scrollHeight ?? 420;
                  const cap =
                    typeof window !== 'undefined'
                      ? Math.floor(window.innerHeight * 0.62)
                      : 640;
                  setIframeH(Math.min(Math.max(inner + 16, 280), cap));
                } catch {
                  setIframeH(520);
                }
              });
            }}
          />
        </div>
      </PercentBodyModalScrollBody>

      <div
        className={`shrink-0 p-4 sm:p-5 border-t flex gap-3 ${
          darkMode ? 'border-gray-700 bg-gray-800/80' : 'border-slate-100 bg-slate-50/50'
        }`}
      >
        <button
          type="button"
          onClick={onClose}
          className={`flex-1 px-4 py-2.5 rounded-2xl border-2 text-sm font-bold uppercase tracking-wider transition-colors active:scale-[0.98] ${
            darkMode
              ? 'border-gray-600 text-gray-200 hover:bg-gray-700'
              : 'border-slate-200 text-slate-600 hover:bg-slate-100'
          }`}
        >
          {closeLabel}
        </button>
        <button
          type="button"
          onClick={handlePrint}
          className="flex-1 px-4 py-2.5 rounded-2xl bg-[var(--asin-accent,#1FA8A0)] text-white text-sm font-bold uppercase tracking-wider shadow-lg shadow-[rgb(14_36_51/0.12)] hover:bg-[#178f88] active:scale-[0.98] flex items-center justify-center gap-2"
        >
          <Printer className="w-4 h-4" />
          {printLabel}
        </button>
      </div>
    </PercentBodyModal>
  );
}
