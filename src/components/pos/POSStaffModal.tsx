import { useState, useEffect } from 'react';
import { X, User, UserCheck, Lock, Loader2, RefreshCcw, CheckCircle } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { userAPI, type User as APIUser } from '../../services/api/users';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'sonner';
import { cn } from '../ui/utils';

interface POSStaffModalProps {
  currentStaff: string;
  onSelect: (staff: string) => void;
  onClose: () => void;
}

export function POSStaffModal({ currentStaff, onSelect, onClose }: POSStaffModalProps) {
  const { t } = useLanguage();
  const { login } = useAuth();

  const [users, setUsers] = useState<APIUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUserForAuth, setSelectedUserForAuth] = useState<APIUser | null>(null);
  const [password, setPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [error, setError] = useState(false);

  // Fetch users
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const data = await userAPI.getAll();
        setUsers(data);
      } catch (err) {
        console.error('Failed to fetch users:', err);
        toast.error(t.errorFetchingUsers || 'Kullanıcı listesi alınamadı');
      } finally {
        setLoading(false);
      }
    };
    fetchUsers();
  }, [t]);

  // Auto-submit on 4 digits (standardizing on 4-digit PINs where possible)
  useEffect(() => {
    if (selectedUserForAuth && password.length === 4) {
      handleLogin();
    }
  }, [password]);

  const handleUserClick = (user: APIUser) => {
    setSelectedUserForAuth(user);
    setPassword('');
    setError(false);
  };

  const addDigit = (digit: string) => {
    if (password.length < 8) {
      setPassword(prev => prev + digit);
      setError(false);
    }
  };

  const handleClear = () => {
    setPassword('');
    setError(false);
  };

  const handleLogin = async () => {
    if (!selectedUserForAuth) return;

    setAuthLoading(true);
    setError(false);

    try {
      const success = await login(selectedUserForAuth.username, password);

      if (success) {
        onSelect(selectedUserForAuth.full_name || selectedUserForAuth.username);
        onClose();
        toast.success(`${t.welcome || 'Hoş geldiniz'}, ${selectedUserForAuth.full_name}`);
      } else {
        setError(true);
        setPassword('');
        setTimeout(() => setError(false), 500);
      }
    } catch (err) {
      console.error('Login error:', err);
      toast.error(t.loginError || 'Giriş yapılırken hata oluştu');
    } finally {
      setAuthLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-[200] p-4 animate-in fade-in duration-300">
      <div className="bg-white rounded-[48px] w-full max-w-4xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300 grid grid-cols-1 md:grid-cols-12 relative border border-white/10">

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-8 right-8 w-12 h-12 rounded-2xl bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-all flex items-center justify-center z-20 border border-white/10 backdrop-blur-md"
        >
          <X className="w-6 h-6" />
        </button>

        {/* Left Side: Staff List */}
        <div className="md:col-span-5 bg-slate-50 p-10 border-r border-slate-100 flex flex-col h-[640px]">
          <div className="mb-8">
            <h2 className="text-2xl font-black text-slate-800 tracking-tight uppercase">Personel Seçimi</h2>
            <p className="text-[10px] text-slate-400 font-black tracking-[0.2em] mt-1 italic uppercase">Lütfen isminizi seçin</p>
          </div>

          <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
              </div>
            ) : (
              users.map((staff) => (
                <button
                  key={staff.id}
                  onClick={() => handleUserClick(staff)}
                  className={cn(
                    "w-full flex items-center gap-4 p-4 rounded-3xl border transition-all duration-300 group",
                    selectedUserForAuth?.id === staff.id
                      ? "bg-blue-600 border-blue-600 shadow-xl shadow-blue-200 translate-x-2"
                      : "bg-white border-slate-100 hover:border-blue-200 hover:bg-blue-50/30"
                  )}
                >
                  <div className={cn(
                    "w-12 h-12 rounded-2xl flex items-center justify-center transition-colors shadow-sm",
                    selectedUserForAuth?.id === staff.id ? "bg-white/20 text-white" : "bg-slate-100 text-slate-400"
                  )}>
                    <User className="w-6 h-6" />
                  </div>
                  <div className="text-left flex-1 min-w-0">
                    <div className={cn(
                      "font-black text-sm uppercase tracking-tight truncate",
                      selectedUserForAuth?.id === staff.id ? "text-white" : "text-slate-700"
                    )}>
                      {staff.full_name || staff.username}
                    </div>
                    <div className={cn(
                      "text-[10px] font-bold uppercase tracking-widest",
                      selectedUserForAuth?.id === staff.id ? "text-blue-100" : "text-slate-400"
                    )}>
                      {staff.role}
                    </div>
                  </div>
                  {selectedUserForAuth?.id === staff.id && (
                    <CheckCircle className="w-5 h-5 text-white animate-in zoom-in duration-300" />
                  )}
                </button>
              ))
            )}
          </div>

          <div className="mt-8 p-6 bg-white border border-slate-100 rounded-3xl text-center">
            <p className="text-[9px] font-black text-slate-300 uppercase tracking-[0.3em]">RetailEX ERP Staff Access</p>
          </div>
        </div>

        {/* Right Side: Keypad Area */}
        <div className="md:col-span-7 flex flex-col bg-white relative">
          {/* Header matching Manager Auth style */}
          <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-10 flex items-center gap-6 text-white relative overflow-hidden shrink-0">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-3xl opacity-50" />

            <div className="w-16 h-16 bg-white/20 rounded-3xl flex items-center justify-center backdrop-blur-md border border-white/20 shadow-lg relative z-10">
              <Lock className="w-8 h-8 font-black" />
            </div>

            <div className="relative z-10 flex-1">
              <h3 className="text-2xl font-black uppercase tracking-tight leading-none">Yetki Doğrulaması</h3>
              {selectedUserForAuth ? (
                <p className="text-blue-100 font-bold text-sm mt-2 uppercase tracking-wide opacity-90 italic">
                  {selectedUserForAuth.full_name} <span className="text-[10px] opacity-60 ml-2">OTURUM AÇILIYOR...</span>
                </p>
              ) : (
                <p className="text-[10px] text-blue-100 font-black uppercase tracking-widest mt-2 opacity-70">GÜVENLİ GİRİŞ SİSTEMİ</p>
              )}
            </div>
          </div>

          <div className={cn(
            "flex-1 flex flex-col items-center justify-center p-12 relative transition-opacity duration-300",
            !selectedUserForAuth && "opacity-40 pointer-events-none"
          )}>
            <div className={cn(
              "w-full max-w-[340px] transition-all duration-300",
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
                    onClick={() => addDigit(num.toString())}
                    disabled={authLoading}
                    className="w-full aspect-square rounded-[32px] bg-slate-50 hover:bg-slate-100 border border-slate-200/50 shadow-sm active:scale-90 transition-all flex items-center justify-center text-3xl font-black text-slate-800"
                  >
                    {num}
                  </button>
                ))}
                <button
                  onClick={handleClear}
                  className="w-full aspect-square rounded-[32px] bg-red-50 hover:bg-red-100 border border-red-100 active:scale-95 transition-all flex items-center justify-center text-red-500 group shadow-sm"
                >
                  <RefreshCcw className="w-8 h-8 group-hover:rotate-180 transition-transform duration-500" />
                </button>
                <button
                  onClick={() => addDigit('0')}
                  disabled={authLoading}
                  className="w-full aspect-square rounded-[32px] bg-slate-50 hover:bg-slate-100 border border-slate-200/50 shadow-sm active:scale-90 transition-all flex items-center justify-center text-3xl font-black text-slate-800"
                >
                  0
                </button>
                <div className="w-full aspect-square flex items-center justify-center">
                  {authLoading ? (
                    <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center border border-slate-100 shadow-inner">
                      <UserCheck className="w-7 h-7 text-slate-200" />
                    </div>
                  )}
                </div>
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

            {!selectedUserForAuth && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-12 text-center">
                <div className="w-20 h-20 bg-slate-50 rounded-[32px] flex items-center justify-center mb-6 border border-slate-100 animate-bounce duration-1000">
                  <User className="w-10 h-10 text-slate-200" />
                </div>
                <h4 className="text-xl font-black text-slate-300 uppercase tracking-tight italic">LÜTFEN PERSONEL SEÇİN</h4>
                <p className="text-slate-400 text-xs font-bold mt-2 opacity-50 uppercase tracking-widest">Giriş yapmak için soldaki listeden isminize tıklayın</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
