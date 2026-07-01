import { Suspense, lazy } from 'react';
import { Receipt, ArrowLeft } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTheme } from '../../contexts/ThemeContext';
import { POS_MODAL_Z } from './posUiConstants';

const ExpenseManagement = lazy(() =>
  import('../accounting/reports/ExpenseManagement').then((m) => ({
    default: m.ExpenseManagement,
  })),
);

interface POSExpenseScreenProps {
  onClose: () => void;
}

export function POSExpenseScreen({ onClose }: POSExpenseScreenProps) {
  const { t, tm } = useLanguage();
  const { darkMode } = useTheme();

  return (
    <div
      className={`fixed inset-0 ${POS_MODAL_Z} flex flex-col min-h-0 ${darkMode ? 'bg-gray-900' : 'bg-white'}`}
      role="dialog"
      aria-modal="true"
      aria-label="Gider İşlemleri"
    >
      <div
        className={`flex items-center justify-between gap-3 px-4 py-3 border-b shrink-0 ${
          darkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-gradient-to-r from-blue-600 to-blue-700'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
            <Receipt className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-black uppercase tracking-wide truncate text-white">
              Gider İşlemleri
            </h2>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-100">
              POS — tam ekran
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/20 hover:bg-white/30 text-white text-sm font-bold transition-colors shrink-0"
        >
          <ArrowLeft className="w-4 h-4" />
          Geri
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <div className="w-10 h-10 border-4 border-red-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>{tm('loadingExpenses')}</p>
              </div>
            </div>
          }
        >
          <ExpenseManagement />
        </Suspense>
      </div>
    </div>
  );
}
