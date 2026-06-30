import { Suspense, lazy } from 'react';
import { X, Receipt } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTheme } from '../../contexts/ThemeContext';

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
      className={`fixed inset-0 z-[2147483646] flex flex-col min-h-0 ${darkMode ? 'bg-gray-900' : 'bg-white'}`}
      role="dialog"
      aria-modal="true"
      aria-label={t.expenseManagement}
    >
      <div
        className={`flex items-center justify-between gap-3 px-4 py-3 border-b shrink-0 ${
          darkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-gradient-to-r from-red-50 to-orange-50'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-red-500 to-orange-600 flex items-center justify-center shrink-0">
            <Receipt className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <h2 className={`text-sm font-black uppercase tracking-wide truncate ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              {t.expenseManagement}
            </h2>
            <p className={`text-[10px] font-semibold uppercase tracking-wider ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              POS
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className={`p-2 rounded-xl transition-colors shrink-0 ${
            darkMode ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-white/80 text-gray-600'
          }`}
          aria-label={t.close}
        >
          <X className="w-5 h-5" />
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
