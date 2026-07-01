import { X, Calendar } from 'lucide-react';
import { useState } from 'react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { PercentBodyModal } from '../../shared/PercentBodyModal';

interface InvoiceEditDateModalProps {
  currentDate: string;
  onSelect: (date: string) => void;
  onClose: () => void;
}

export function InvoiceEditDateModal({ currentDate, onSelect, onClose }: InvoiceEditDateModalProps) {
  const { tm } = useLanguage();
  const [selectedDate, setSelectedDate] = useState(() => {
    if (currentDate.includes('.')) {
      const parts = currentDate.split('.');
      if (parts.length === 3) {
        return `${parts[2]}-${parts[1]}-${parts[0]}`;
      }
    }
    return currentDate || new Date().toISOString().split('T')[0];
  });

  const handleSave = () => {
    const date = new Date(selectedDate);
    if (!isNaN(date.getTime())) {
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      onSelect(`${day}.${month}.${year}`);
      onClose();
    }
  };

  return (
    <PercentBodyModal onClose={onClose} size="compact" ariaLabel={tm('selectEditDate')}>
        <div className="p-3 border-b border-gray-200 flex items-center justify-between shrink-0 bg-gradient-to-r from-blue-600 to-blue-700">
          <h3 className="text-base text-white flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            {tm('selectEditDate')}
          </h3>
          <button onClick={onClose} className="text-white hover:text-gray-200 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4">
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">{tm('date')}</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-blue-600"
              autoFocus
            />
          </div>
          <div className="text-sm text-gray-600">
            <p>{tm('currentDateLabel')}: <strong>{currentDate}</strong></p>
          </div>
        </div>

        <div className="p-4 border-t border-gray-200 bg-gray-50 flex gap-2 shrink-0">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
          >
            {tm('cancel')}
          </button>
          <button
            onClick={handleSave}
            className="flex-1 px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
          >
            {tm('selectButton')}
          </button>
        </div>
    </PercentBodyModal>
  );
}
