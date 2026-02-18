import { useState, useEffect } from 'react';
import { X, User, UserCheck, Lock, Loader2 } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { userAPI, type User as APIUser } from '../../services/api/users';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'sonner';

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
  const [error, setError] = useState('');

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

  const handleUserClick = (user: APIUser) => {
    // If clicking displayed user, do nothing
    // Note: currentStaff prop might be just a name string, so we compare usernames/names roughly
    // Ideally we should pass currentUserId prop, but for now logic is:

    // Only prompt password if switching user
    setSelectedUserForAuth(user);
    setPassword('');
    setError('');
  };

  const handleLogin = async () => {
    if (!selectedUserForAuth) return;

    setAuthLoading(true);
    setError('');

    try {
      const success = await login(selectedUserForAuth.username, password);

      if (success) {
        // Login successful - AuthContext state will update
        // We just need to close the modal
        onSelect(selectedUserForAuth.full_name || selectedUserForAuth.username);
        onClose();
        toast.success(`${t.welcome || 'Hoş geldiniz'}, ${selectedUserForAuth.full_name}`);
      } else {
        setError(t.invalidPassword || 'Hatalı şifre');
      }
    } catch (err) {
      console.error('Login error:', err);
      setError(t.loginError || 'Giriş yapılırken hata oluştu');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleLogin();
    }
  };

  // If selecting a user for auth, show password screen
  if (selectedUserForAuth) {
    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white w-full max-w-sm shadow-2xl rounded-lg overflow-hidden">
          <div className="p-3 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-blue-600 to-blue-700">
            <h3 className="text-base text-white flex items-center gap-2">
              <Lock className="w-5 h-5" />
              {t.login || 'Giriş Yap'}: {selectedUserForAuth.username}
            </h3>
            <button
              onClick={() => setSelectedUserForAuth(null)}
              className="text-white hover:text-gray-200 p-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6">
            <div className="flex flex-col items-center mb-6">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-3">
                <User className="w-8 h-8 text-blue-600" />
              </div>
              <h4 className="font-medium text-lg text-gray-900">{selectedUserForAuth.full_name}</h4>
              <span className="text-sm text-gray-500 capitalize">{selectedUserForAuth.role}</span>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t.password || 'Şifre'}
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                autoFocus
                placeholder="******"
              />
              {error && <p className="text-red-500 text-sm mt-1">{error}</p>}
            </div>

            <button
              onClick={handleLogin}
              disabled={authLoading || !password}
              className="w-full py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {authLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              {t.login || 'Giriş Yap'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white w-full max-w-md shadow-2xl rounded-lg overflow-hidden">
        {/* Header */}
        <div className="p-3 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-blue-600 to-blue-700">
          <h3 className="text-base text-white flex items-center gap-2">
            <User className="w-5 h-5" />
            {t.selectStaffTitle || 'Personel Seçin'}
          </h3>
          <button
            onClick={onClose}
            className="text-white hover:text-gray-200 p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Staff List */}
        <div className="p-4 max-h-[400px] overflow-auto">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
            </div>
          ) : (
            <div className="space-y-2">
              {users.map((staff) => (
                <button
                  key={staff.id}
                  onClick={() => handleUserClick(staff)}
                  className={`w-full p-4 rounded border-2 transition-all text-left flex items-center justify-between ${currentStaff === staff.full_name || currentStaff === staff.username
                      ? 'border-blue-600 bg-blue-50'
                      : 'border-gray-200 hover:border-blue-400 hover:bg-blue-50/50'
                    }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${staff.role === 'admin' || staff.role === 'manager' ? 'bg-purple-100' : 'bg-gray-100'
                      }`}>
                      <User className={`w-5 h-5 ${staff.role === 'admin' || staff.role === 'manager' ? 'text-purple-600' : 'text-gray-600'
                        }`} />
                    </div>
                    <div>
                      <div className="text-sm text-gray-900 font-medium">{staff.full_name || staff.username}</div>
                      <div className={`text-xs ${staff.role === 'admin' || staff.role === 'manager' ? 'text-purple-600' : 'text-gray-500'} capitalize`}>
                        {staff.role}
                      </div>
                    </div>
                  </div>
                  {(currentStaff === staff.full_name || currentStaff === staff.username) && (
                    <UserCheck className="w-5 h-5 text-blue-600" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 text-sm bg-gray-200 text-gray-700 hover:bg-gray-300 rounded transition-colors"
          >
            {t.cancel || 'İptal'}
          </button>
        </div>
      </div>
    </div>
  );
}
