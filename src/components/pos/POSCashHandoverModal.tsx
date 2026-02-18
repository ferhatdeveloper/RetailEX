import { X, Users, Printer, CheckCircle, AlertCircle } from 'lucide-react';
import { useState } from 'react';
import { formatCurrency, formatNumber } from '../../utils/formatNumber';

interface POSCashHandoverModalProps {
  onClose: () => void;
  onConfirmHandover: (toStaff: string, amount: number, note: string) => void;
  fromStaff: string;
  amount: number;
  note: string;
}

interface Staff {
  id: string;
  name: string;
  role: string;
}

export function POSCashHandoverModal({
  onClose,
  onConfirmHandover,
  fromStaff,
  amount,
  note
}: POSCashHandoverModalProps) {
  const [selectedStaff, setSelectedStaff] = useState<string>('');
  const [handoverNote, setHandoverNote] = useState(note);
  const [showPrintPreview, setShowPrintPreview] = useState(false);

  // Demo personel listesi - gerçek uygulamada API'den gelecek
  const staffList: Staff[] = [
    { id: '1', name: 'Ali Yılmaz', role: 'Kasiyer' },
    { id: '2', name: 'Ayşe Demir', role: 'Kasiyer' },
    { id: '3', name: 'Mehmet Kaya', role: 'Kıdemli Kasiyer' },
    { id: '4', name: 'Fatma Şahin', role: 'Kasiyer' },
  ];

  const handlePrintHandoverReceipt = () => {
    setShowPrintPreview(true);
  };

  const handleActualPrint = () => {
    window.print();
    setShowPrintPreview(false);
  };

  const handleConfirm = () => {
    if (!selectedStaff) {
      alert('Lütfen devredilecek kasiyeri seçin!');
      return;
    }

    const selectedStaffName = staffList.find(s => s.id === selectedStaff)?.name || '';
    
    // Devir fişini yazdır
    handlePrintHandoverReceipt();
    
    // Devri onayla
    setTimeout(() => {
      onConfirmHandover(selectedStaffName, amount, handoverNote);
    }, 500);
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl rounded-lg overflow-hidden">
          {/* Header */}
          <div className="p-4 border-b border-gray-200 bg-gradient-to-r from-purple-600 to-purple-700 flex items-center justify-between">
            <h3 className="text-lg text-white flex items-center gap-2">
              <Users className="w-6 h-6" />
              Kasa Devir İşlemi
            </h3>
            <button
              onClick={onClose}
              className="text-white hover:bg-white/10 p-1 rounded transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {/* Devir Bilgileri */}
            <div className="bg-purple-50 border-2 border-purple-200 p-4 rounded-lg mb-6">
              <h4 className="font-medium text-purple-900 mb-3 flex items-center gap-2">
                <AlertCircle className="w-5 h-5" />
                Devir Bilgileri
              </h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Devreden Kasiyer:</span>
                  <span className="font-medium text-gray-900">{fromStaff}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Devir Tutarı:</span>
                  <span className="text-2xl font-bold text-purple-900">{formatCurrency(amount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Devir Tarihi:</span>
                  <span className="font-medium text-gray-900">
                    {new Date().toLocaleDateString('tr-TR')} {new Date().toLocaleTimeString('tr-TR')}
                  </span>
                </div>
              </div>
            </div>

            {/* Personel Seçimi */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
              <h4 className="text-sm font-medium text-gray-900 mb-3">Devredilecek Kasiyer Seçin</h4>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {staffList.map((staff) => (
                  <button
                    key={staff.id}
                    onClick={() => setSelectedStaff(staff.id)}
                    className={`w-full flex items-center justify-between p-3 rounded-lg border-2 transition-all ${
                      selectedStaff === staff.id
                        ? 'border-purple-500 bg-purple-50'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-medium ${
                        selectedStaff === staff.id
                          ? 'bg-purple-600 text-white'
                          : 'bg-gray-200 text-gray-700'
                      }`}>
                        {staff.name.split(' ').map(n => n[0]).join('')}
                      </div>
                      <div className="text-left">
                        <p className="font-medium text-gray-900">{staff.name}</p>
                        <p className="text-xs text-gray-500">{staff.role}</p>
                      </div>
                    </div>
                    {selectedStaff === staff.id && (
                      <CheckCircle className="w-5 h-5 text-purple-600" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Not Alanı */}
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h4 className="text-sm font-medium text-gray-900 mb-2">Devir Notu</h4>
              <textarea
                value={handoverNote}
                onChange={(e) => setHandoverNote(e.target.value)}
                placeholder="Kasa devri ile ilgili notlarınızı yazın..."
                rows={3}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:border-purple-500"
              />
            </div>

            {/* Uyarı */}
            <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-yellow-800">
                  <p className="font-medium mb-1">Önemli Bilgilendirme:</p>
                  <ul className="list-disc list-inside space-y-1 text-xs">
                    <li>Devir işlemi onaylandıktan sonra devir fişi otomatik yazdırılacaktır</li>
                    <li>Seçilen kasiyer kasa açılışı yapana kadar bekleyecektir</li>
                    <li>Kasiyer devri onaylamadan kasa açamayacaktır</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Footer - Actions */}
          <div className="p-4 border-t border-gray-200 bg-gray-50 flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-6 py-3 text-sm bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors rounded-lg"
            >
              İptal
            </button>
            <button
              onClick={handleConfirm}
              disabled={!selectedStaff}
              className="flex-1 px-6 py-3 text-sm bg-purple-600 text-white hover:bg-purple-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg"
            >
              <CheckCircle className="w-5 h-5" />
              Devri Onayla
            </button>
          </div>
        </div>
      </div>

      {/* Devir Fişi Yazdırma Önizlemesi */}
      {showPrintPreview && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl rounded-lg overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-medium text-gray-900">Devir Fişi Önizleme</h3>
              <button
                onClick={() => setShowPrintPreview(false)}
                className="text-gray-400 hover:text-gray-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Print Content */}
            <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
              <div className="bg-white p-8 mx-auto max-w-lg border border-gray-200 print-content">
                <div className="text-center mb-6">
                  <h2 className="text-2xl font-bold text-gray-900 mb-1">KASA DEVİR FİŞİ</h2>
                  <p className="text-sm text-gray-600">ExRetailOS - Profesyonel Satış Yönetimi</p>
                </div>

                <div className="border-t border-b border-gray-300 py-4 mb-4">
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Devir No:</span>
                      <span className="font-medium text-gray-900">#{Date.now().toString().slice(-8)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Tarih:</span>
                      <span className="font-medium text-gray-900">{new Date().toLocaleDateString('tr-TR')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Saat:</span>
                      <span className="font-medium text-gray-900">{new Date().toLocaleTimeString('tr-TR')}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 p-4 rounded mb-4">
                  <h3 className="text-sm font-medium text-gray-900 mb-3">Devir Bilgileri</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Devreden:</span>
                      <span className="font-medium text-gray-900">{fromStaff}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Devralan:</span>
                      <span className="font-medium text-gray-900">
                        {staffList.find(s => s.id === selectedStaff)?.name || '-'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="bg-purple-50 border border-purple-200 p-4 rounded mb-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-purple-900">DEVİR TUTARI:</span>
                    <span className="text-3xl font-bold text-purple-900">{formatCurrency(amount)}</span>
                  </div>
                </div>

                {handoverNote && (
                  <div className="mb-4 p-3 bg-gray-50 rounded">
                    <p className="text-xs text-gray-600 mb-1">Not:</p>
                    <p className="text-sm text-gray-900">{handoverNote}</p>
                  </div>
                )}

                <div className="border-t border-gray-300 pt-6 mt-6">
                  <div className="grid grid-cols-2 gap-8">
                    <div className="text-center">
                      <div className="border-t border-gray-400 pt-2 mt-12">
                        <p className="text-xs text-gray-600">Devreden İmza</p>
                        <p className="text-sm font-medium text-gray-900">{fromStaff}</p>
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="border-t border-gray-400 pt-2 mt-12">
                        <p className="text-xs text-gray-600">Devralan İmza</p>
                        <p className="text-sm font-medium text-gray-900">
                          {staffList.find(s => s.id === selectedStaff)?.name || '-'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-6 text-center text-xs text-gray-500">
                  <p>Bu belge elektronik ortamda oluşturulmuş olup imza gerektirmez.</p>
                  <p className="mt-1">Yazdırma Tarihi: {new Date().toLocaleString('tr-TR')}</p>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-gray-200 bg-gray-50 flex gap-3">
              <button
                onClick={() => setShowPrintPreview(false)}
                className="flex-1 px-6 py-3 text-sm bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors rounded-lg"
              >
                Kapat
              </button>
              <button
                onClick={handleActualPrint}
                className="flex-1 px-6 py-3 text-sm bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 rounded-lg"
              >
                <Printer className="w-5 h-5" />
                Yazdır
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Print Styles */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .print-content,
          .print-content * {
            visibility: visible;
          }
          .print-content {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
        }
      `}</style>
    </>
  );
}

