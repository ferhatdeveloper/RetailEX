import { X, Shield, Lock, RefreshCcw } from 'lucide-react';
import { useState, useEffect } from 'react';
import { cn } from '../ui/utils';

interface POSManagerAuthModalProps {
  onClose: () => void;
  onAuthorized: () => void;
}

export function POSManagerAuthModal({ onClose, onAuthorized }: POSManagerAuthModalProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (password.length >= 4) {
      handleSubmit();
    }
  }, [password]);

  const handleNumberClick = (num: string) => {
    if (password.length < 8) {
      setPassword(prev => prev + num);
      setError(false);
    }
  };

  const handleClear = () => {
    setPassword('');
    setError(false);
  };

  const handleSubmit = async () => {
    setLoading(true);
    // Basit şifre kontrolü - gerçek uygulamada API ile kontrol edilmeli
    // 1234 veya admin için onay ver
    setTimeout(() => {
      if (password === '1234' || password === '4321') {
        onAuthorized();
        onClose();
      } else {
        setError(true);
        setPassword('');
        setTimeout(() => setError(false), 500);
      }
      setLoading(false);
    }, 300);
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-[200] p-4 animate-in fade-in duration-300">
      <div className="bg-white rounded-[48px] w-full max-w-sm overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300 flex flex-col relative border border-white/10">

        {/* Header with Blue Gradient - Matching "Masa Aç" style */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-8 flex items-center justify-between text-white relative overflow-hidden shrink-0">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-3xl opacity-50" />

          <div className="flex items-center gap-5 relative z-10">
            <div className="w-16 h-16 bg-white/20 rounded-3xl flex items-center justify-center backdrop-blur-md border border-white/20 shadow-lg">
              <Shield className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-2xl font-black uppercase tracking-tight leading-none">Yönetici</h3>
              <p className="text-[10px] text-blue-100 font-black uppercase tracking-widest mt-2 opacity-70">Yetki Doğrulaması</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-12 h-12 bg-white/10 hover:bg-white/20 rounded-2xl flex items-center justify-center transition-all active:scale-90 relative z-10 border border-white/10"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-10 flex flex-col items-center bg-white flex-1 relative">
          {/* Status Badge */}
          <div className="bg-slate-50 border border-slate-100 rounded-3xl px-6 py-3 flex items-center gap-3 mb-10 animate-in slide-in-from-top-4 duration-500">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
            <p className="text-[11px] font-black text-slate-400 leading-tight uppercase tracking-widest">
              Lütfen 4 haneli PIN girin
            </p>
          </div>

          <div className={cn(
            "w-full transition-all duration-300",
            error && "animate-shake"
          )}>
            {/* PIN Display Dots */}
            <div className="flex justify-center gap-6 mb-12">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={cn(
                    "w-6 h-6 rounded-full border-2 transition-all duration-500 flex items-center justify-center shadow-inner",
                    password.length > i
                      ? "bg-blue-600 border-blue-600 scale-125 shadow-[0_0_20px_rgba(37,99,235,0.4)]"
                      : "border-slate-100 bg-slate-50"
                  )}
                >
                  {password.length > i && <div className="w-2.5 h-2.5 bg-white rounded-full shadow-sm" />}
                </div>
              ))}
            </div>

            {/* Numeric Keypad Grid - Modern Flat Style */}
            <div className="grid grid-cols-3 gap-5 w-full">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                <button
                  key={num}
                  onClick={() => handleNumberClick(num.toString())}
                  disabled={loading}
                  className="w-full aspect-square rounded-[32px] bg-slate-50 hover:bg-slate-100 border border-slate-200/50 shadow-sm active:scale-90 transition-all flex items-center justify-center text-3xl font-black text-slate-800"
                >
                  {num}
                </button>
              ))}
              <button
                onClick={handleClear}
                className="w-full aspect-square rounded-[32px] bg-red-50 hover:bg-red-100 border border-red-100 active:scale-95 transition-all flex items-center justify-center text-red-500 group"
              >
                <RefreshCcw className="w-8 h-8 group-hover:rotate-180 transition-transform duration-500" />
              </button>
              <button
                onClick={() => handleNumberClick('0')}
                disabled={loading}
                className="w-full aspect-square rounded-[32px] bg-slate-50 hover:bg-slate-100 border border-slate-200/50 shadow-sm active:scale-90 transition-all flex items-center justify-center text-3xl font-black text-slate-800"
              >
                0
              </button>
              <button
                onClick={onClose}
                className="w-full aspect-square rounded-[32px] bg-slate-50 hover:bg-slate-100 border border-slate-200/50 active:scale-95 transition-all flex items-center justify-center text-slate-400"
              >
                <X className="w-8 h-8 font-black" />
              </button>
            </div>

            {/* Error Message */}
            {error && (
              <div className="mt-10 text-center animate-in fade-in slide-in-from-top-2 duration-300">
                <span className="px-6 py-2.5 bg-red-500 text-white text-[11px] font-black uppercase tracking-[0.2em] rounded-full shadow-xl shadow-red-200">
                  HATALI ŞİFRE!
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Footer info */}
        <div className="p-8 bg-slate-50 border-t border-slate-100 text-center">
          <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.4em]">RETAILEX ERP SECURITY</p>
        </div>
      </div>
    </div>
  );
}
