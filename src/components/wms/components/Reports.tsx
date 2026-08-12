// Reports Module - Enterprise WMS

import { ArrowLeft, FileText } from 'lucide-react';

interface ReportsProps {
  darkMode: boolean;
  onNavigate: (page: string) => void;
}

export default function Reports({ darkMode, onNavigate }: ReportsProps) {
  const cardClass = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const textClass = darkMode ? 'text-gray-100' : 'text-gray-900';
  const textMutedClass = darkMode ? 'text-gray-400' : 'text-gray-600';

  return (
    <div className={`min-h-screen ${darkMode ? 'bg-gray-900' : 'bg-gradient-to-br from-gray-50 to-teal-50'}`}>
      <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} border-b shadow-sm`}>
        <div className="px-6 py-4">
          <div className="flex items-center gap-4">
            <button onClick={() => onNavigate('dashboard')} className={`p-2 rounded-lg ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}>
              <ArrowLeft className={`w-5 h-5 ${textClass}`} />
            </button>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-teal-500 to-teal-600 rounded-lg flex items-center justify-center">
                <FileText className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className={`text-xl ${textClass}`}>Raporlar</h1>
                <p className={`text-xs ${textMutedClass}`}>Detaylı analiz ve raporlama</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <div className="p-6">
        <div className={`${cardClass} border rounded-xl p-12 text-center`}>
          <FileText className={`w-16 h-16 ${textMutedClass} mx-auto mb-4`} />
          <h3 className={`text-lg ${textClass} mb-2`}>Raporlar Modülü</h3>
          <p className={`${textMutedClass}`}>Yakında eklenecek...</p>
        </div>
      </div>
    </div>
  );
}

