import { useState, useEffect } from 'react';
import { X, User, Loader2 } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { userAPI, type User as APIUser } from '../../services/api/users';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'sonner';
import { cn } from '../ui/utils';
import { PinNumpadInput } from '../shared/PinNumpadInput';

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

  const matchesCurrentStaff = (staff: APIUser) =>
    currentStaff === staff.username || currentStaff === staff.full_name;

  const activeStaffUser = users.find(matchesCurrentStaff);
  const activeStaffLabel = activeStaffUser?.username || currentStaff;

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

  const handleLogin = async () => {
    if (!selectedUser || authLoading) return;

    setAuthLoading(true);
    setError(false);

    try {
      const success = await login(selectedUser.username, password);
      if (success) {
        onSelect(selectedUser.username);
        onClose();
        toast.success(`${t.welcome || 'Hoş geldiniz'}, ${selectedUser.username}`);
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
            <p className="text-[11px] text-slate-500">
              Aktif kasiyer: <span className="font-semibold text-slate-700">{activeStaffLabel}</span>
              {activeStaffUser?.full_name && activeStaffUser.full_name !== activeStaffUser.username && (
                <span className="text-slate-400"> ({activeStaffUser.full_name})</span>
              )}
            </p>
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
                  const isCurrent = matchesCurrentStaff(staff);
                  const initials = staff.username
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
                        'flex flex-col items-center gap-1.5 p-2 rounded-xl border transition-all relative',
                        active
                          ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                          : isCurrent
                            ? 'border-emerald-400 bg-emerald-50'
                            : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'
                      )}
                    >
                      {isCurrent && (
                        <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-emerald-500" title="Aktif kasiyer" />
                      )}
                      <div
                        className={cn(
                          'w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold',
                          active ? 'bg-blue-600 text-white' : isCurrent ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'
                        )}
                      >
                        {initials || <User className="w-4 h-4" />}
                      </div>
                      <span className="text-[10px] font-bold text-slate-800 text-center leading-tight line-clamp-1 w-full">
                        {staff.username}
                      </span>
                      {staff.full_name && staff.full_name !== staff.username && (
                        <span className="text-[9px] text-slate-500 text-center leading-tight line-clamp-1 w-full">
                          {staff.full_name}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <div
                className={cn(
                  'transition-opacity',
                  selectedUser ? '' : 'opacity-60 pointer-events-none'
                )}
              >
                <PinNumpadInput
                  value={password}
                  onChange={(v) => {
                    setPassword(v);
                    setError(false);
                  }}
                  maxLength={4}
                  dotSlots={4}
                  disabled={!selectedUser || authLoading}
                  label={
                    selectedUser
                      ? `${selectedUser.username} — PIN`
                      : 'Önce personel seçin'
                  }
                  error={error}
                  errorText="Hatalı PIN"
                  compact
                />
                {authLoading && (
                  <div className="flex justify-center mt-2">
                    <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
