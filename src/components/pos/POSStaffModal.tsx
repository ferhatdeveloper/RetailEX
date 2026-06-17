import { useState, useEffect } from 'react';
import { X, User, Lock, Loader2, Delete } from 'lucide-react';
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
  const [selectedUser, setSelectedUser] = useState<APIUser | null>(null);
  const [password, setPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const data = await userAPI.getAll();
        setUsers(data.filter((u) => u.is_active !== false));
      } catch (err) {
        console.error('Failed to fetch users:', err);
        toast.error(t.errorFetchingUsers || 'Kullanıcı listesi alınamadı');
      } finally {
        setLoading(false);
      }
    };
    void fetchUsers();
  }, [t]);

  useEffect(() => {
    if (selectedUser && password.length === 4) {
      void handleLogin();
    }
  }, [password, selectedUser]);

  const addDigit = (digit: string) => {
    if (password.length < 4) {
      setPassword((prev) => prev + digit);
      setError(false);
    }
  };

  const handleLogin = async () => {
    if (!selectedUser || authLoading) return;

    setAuthLoading(true);
    setError(false);

    try {
      const success = await login(selectedUser.username, password);
      if (success) {
        onSelect(selectedUser.full_name || selectedUser.username);
        onClose();
        toast.success(`${t.welcome || 'Hoş geldiniz'}, ${selectedUser.full_name || selectedUser.username}`);
      } else {
        setError(true);
        setPassword('');
      }
    } catch (err) {
      console.error('Login error:', err);
      toast.error(t.loginError || 'Giriş yapılırken hata oluştu');
    } finally {
      setAuthLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[200] p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden border border-slate-200">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
          <div>
            <h2 className="text-sm font-bold text-slate-800">Personel Değiştir</h2>
            <p className="text-[11px] text-slate-500">Aktif: {currentStaff}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2 mb-4 max-h-36 overflow-y-auto">
                {users.map((staff) => {
                  const active = selectedUser?.id === staff.id;
                  const label = staff.full_name || staff.username;
                  const initials = label
                    .split(' ')
                    .map((w) => w[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase();
                  return (
                    <button
                      key={staff.id}
                      type="button"
                      onClick={() => {
                        setSelectedUser(staff);
                        setPassword('');
                        setError(false);
                      }}
                      className={cn(
                        'flex flex-col items-center gap-1.5 p-2 rounded-xl border transition-all',
                        active
                          ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                          : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'
                      )}
                    >
                      <div
                        className={cn(
                          'w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold',
                          active ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
                        )}
                      >
                        {initials || <User className="w-4 h-4" />}
                      </div>
                      <span className="text-[10px] font-semibold text-slate-700 text-center leading-tight line-clamp-2">
                        {label}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div
                className={cn(
                  'rounded-xl border p-3 transition-opacity',
                  selectedUser ? 'border-slate-200 bg-white' : 'border-dashed border-slate-200 bg-slate-50 opacity-60 pointer-events-none'
                )}
              >
                <div className="flex items-center gap-2 mb-3">
                  <Lock className="w-4 h-4 text-slate-400" />
                  <span className="text-xs font-medium text-slate-600">
                    {selectedUser
                      ? `${selectedUser.full_name || selectedUser.username} — PIN`
                      : 'Önce personel seçin'}
                  </span>
                </div>

                <div className="flex justify-center gap-2 mb-3">
                  {[0, 1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className={cn(
                        'w-2.5 h-2.5 rounded-full transition-all',
                        password.length > i ? 'bg-blue-600 scale-110' : 'bg-slate-200'
                      )}
                    />
                  ))}
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => addDigit(String(num))}
                      disabled={!selectedUser || authLoading}
                      className="h-11 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-lg font-semibold text-slate-800 active:scale-95 disabled:opacity-40"
                    >
                      {num}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setPassword('');
                      setError(false);
                    }}
                    disabled={!selectedUser}
                    className="h-11 rounded-lg bg-red-50 hover:bg-red-100 border border-red-100 flex items-center justify-center text-red-500 disabled:opacity-40"
                  >
                    <Delete className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => addDigit('0')}
                    disabled={!selectedUser || authLoading}
                    className="h-11 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-lg font-semibold text-slate-800 active:scale-95 disabled:opacity-40"
                  >
                    0
                  </button>
                  <div className="h-11 flex items-center justify-center">
                    {authLoading && <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />}
                  </div>
                </div>

                {error && (
                  <p className="text-center text-xs font-semibold text-red-600 mt-2">Hatalı PIN</p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
