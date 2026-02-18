// ğŸ“Š Performance Dashboard - Kullanıcı Performans Değerlendirmesi
// Real-time performance tracking for all warehouse users

import { useState, useEffect } from 'react';
import {
  TrendingUp, TrendingDown, Users, Target, Clock, Award,
  Package, CheckCircle, XCircle, Zap, BarChart3, Activity,
  Trophy, Medal, Star, Filter, Calendar, Download, Tv
} from 'lucide-react';

interface PerformanceDashboardProps {
  darkMode: boolean;
  onBack: () => void;
  onNavigate?: (page: string) => void;
}

interface UserPerformance {
  user_id: string;
  user_name: string;
  role: string;
  avatar?: string;
  
  // Metrics
  tasks_completed: number;
  tasks_assigned: number;
  accuracy_rate: number;
  speed_score: number;
  quality_score: number;
  
  // Picking metrics
  items_picked_today: number;
  items_picked_week: number;
  picking_errors: number;
  
  // Time metrics
  avg_pick_time: number; // seconds
  total_active_time: number; // minutes
  
  // Rankings
  rank_overall: number;
  rank_speed: number;
  rank_accuracy: number;
  
  // Trends
  performance_trend: 'up' | 'down' | 'stable';
  last_updated: string;
}

export function PerformanceDashboard({ darkMode, onBack, onNavigate }: PerformanceDashboardProps) {
  const [timeRange, setTimeRange] = useState<'today' | 'week' | 'month'>('today');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(false);
  const [users, setUsers] = useState<UserPerformance[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserPerformance | null>(null);

  const bgClass = darkMode ? 'bg-gray-900' : 'bg-gray-50';
  const cardClass = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const textClass = darkMode ? 'text-gray-100' : 'text-gray-900';

  useEffect(() => {
    loadPerformanceData();
  }, [timeRange, roleFilter]);

  const loadPerformanceData = async () => {
    setIsLoading(true);
    // Simulate API call
    setTimeout(() => {
      const mockUsers: UserPerformance[] = [
        {
          user_id: '1',
          user_name: 'Ahmet Yılmaz',
          role: 'picker',
          tasks_completed: 145,
          tasks_assigned: 150,
          accuracy_rate: 98.5,
          speed_score: 95,
          quality_score: 97,
          items_picked_today: 450,
          items_picked_week: 2100,
          picking_errors: 2,
          avg_pick_time: 45,
          total_active_time: 420,
          rank_overall: 1,
          rank_speed: 2,
          rank_accuracy: 1,
          performance_trend: 'up',
          last_updated: new Date().toISOString(),
        },
        {
          user_id: '2',
          user_name: 'Mehmet Demir',
          role: 'picker',
          tasks_completed: 138,
          tasks_assigned: 145,
          accuracy_rate: 96.2,
          speed_score: 98,
          quality_score: 94,
          items_picked_today: 480,
          items_picked_week: 2050,
          picking_errors: 5,
          avg_pick_time: 42,
          total_active_time: 430,
          rank_overall: 2,
          rank_speed: 1,
          rank_accuracy: 3,
          performance_trend: 'stable',
          last_updated: new Date().toISOString(),
        },
        {
          user_id: '3',
          user_name: 'Ayşe Kaya',
          role: 'receiver',
          tasks_completed: 85,
          tasks_assigned: 90,
          accuracy_rate: 99.1,
          speed_score: 88,
          quality_score: 99,
          items_picked_today: 320,
          items_picked_week: 1800,
          picking_errors: 1,
          avg_pick_time: 52,
          total_active_time: 410,
          rank_overall: 3,
          rank_speed: 5,
          rank_accuracy: 1,
          performance_trend: 'up',
          last_updated: new Date().toISOString(),
        },
        {
          user_id: '4',
          user_name: 'Fatma Şahin',
          role: 'packer',
          tasks_completed: 120,
          tasks_assigned: 125,
          accuracy_rate: 97.8,
          speed_score: 92,
          quality_score: 96,
          items_picked_today: 380,
          items_picked_week: 1950,
          picking_errors: 3,
          avg_pick_time: 48,
          total_active_time: 400,
          rank_overall: 4,
          rank_speed: 3,
          rank_accuracy: 2,
          performance_trend: 'down',
          last_updated: new Date().toISOString(),
        },
      ];
      setUsers(mockUsers);
      setIsLoading(false);
    }, 500);
  };

  const getRankBadge = (rank: number) => {
    if (rank === 1) return <Trophy className="w-5 h-5 text-yellow-500" />;
    if (rank === 2) return <Medal className="w-5 h-5 text-gray-400" />;
    if (rank === 3) return <Medal className="w-5 h-5 text-amber-600" />;
    return <span className="text-sm font-bold text-gray-500">#{rank}</span>;
  };

  const getPerformanceColor = (score: number) => {
    if (score >= 95) return 'text-green-600';
    if (score >= 85) return 'text-blue-600';
    if (score >= 75) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getTrendIcon = (trend: string) => {
    if (trend === 'up') return <TrendingUp className="w-4 h-4 text-green-500" />;
    if (trend === 'down') return <TrendingDown className="w-4 h-4 text-red-500" />;
    return <Activity className="w-4 h-4 text-gray-400" />;
  };

  return (
    <div className={`min-h-screen ${bgClass} p-6`}>
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={onBack}
          className="mb-4 flex items-center gap-2 text-blue-500 hover:text-blue-600"
        >
          ← Geri
        </button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className={`text-3xl font-bold ${textClass} mb-2`}>Performans Değerlendirmesi</h1>
            <p className="text-gray-500">Tüm kullanıcıların anlık performans metrikleri</p>
          </div>
          <div className="flex items-center gap-3">
            {onNavigate && (
              <button 
                onClick={() => onNavigate('live-performance-tv')}
                className="flex items-center gap-2 px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg"
              >
                <Tv className="w-5 h-5" />
                Live TV Ekranı
              </button>
            )}
            <button className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg">
              <Download className="w-5 h-5" />
              Rapor İndir
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className={`${cardClass} border rounded-xl p-4 mb-6`}>
        <div className="flex flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-gray-400" />
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value as any)}
              className={`px-4 py-2 rounded-lg border ${
                darkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-300'
              }`}
            >
              <option value="today">Bugün</option>
              <option value="week">Bu Hafta</option>
              <option value="month">Bu Ay</option>
            </select>
          </div>
          
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-gray-400" />
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className={`px-4 py-2 rounded-lg border ${
                darkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-300'
              }`}
            >
              <option value="all">Tüm Roller</option>
              <option value="picker">Toplayıcı</option>
              <option value="receiver">Kabul</option>
              <option value="packer">Paketleme</option>
              <option value="loader">Yükleme</option>
            </select>
          </div>
        </div>
      </div>

      {/* Overall Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className={`${cardClass} border rounded-xl p-6`}>
          <div className="flex items-center justify-between mb-2">
            <Users className="w-8 h-8 text-blue-500" />
            <span className="text-xs text-gray-500">Toplam</span>
          </div>
          <div className={`text-3xl font-bold ${textClass}`}>{users.length}</div>
          <div className="text-sm text-gray-500">Aktif Kullanıcı</div>
        </div>

        <div className={`${cardClass} border rounded-xl p-6`}>
          <div className="flex items-center justify-between mb-2">
            <Target className="w-8 h-8 text-green-500" />
            <span className="text-xs text-gray-500">Ortalama</span>
          </div>
          <div className={`text-3xl font-bold ${textClass}`}>
            {users.length > 0 ? (users.reduce((sum, u) => sum + u.accuracy_rate, 0) / users.length).toFixed(1) : 0}%
          </div>
          <div className="text-sm text-gray-500">Doğruluk Oranı</div>
        </div>

        <div className={`${cardClass} border rounded-xl p-6`}>
          <div className="flex items-center justify-between mb-2">
            <Zap className="w-8 h-8 text-yellow-500" />
            <span className="text-xs text-gray-500">Toplam</span>
          </div>
          <div className={`text-3xl font-bold ${textClass}`}>
            {users.reduce((sum, u) => sum + u.items_picked_today, 0).toLocaleString()}
          </div>
          <div className="text-sm text-gray-500">Bugünkü İşlem</div>
        </div>

        <div className={`${cardClass} border rounded-xl p-6`}>
          <div className="flex items-center justify-between mb-2">
            <Award className="w-8 h-8 text-purple-500" />
            <span className="text-xs text-gray-500">Toplam</span>
          </div>
          <div className={`text-3xl font-bold ${textClass}`}>
            {users.reduce((sum, u) => sum + u.tasks_completed, 0)}
          </div>
          <div className="text-sm text-gray-500">Tamamlanan Görev</div>
        </div>
      </div>

      {/* Performance Leaderboard */}
      <div className={`${cardClass} border rounded-xl overflow-hidden mb-6`}>
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className={`text-xl font-bold ${textClass} flex items-center gap-2`}>
            <Trophy className="w-6 h-6 text-yellow-500" />
            Performans Sıralaması
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className={darkMode ? 'bg-gray-700' : 'bg-gray-50'}>
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sıra</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Kullanıcı</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rol</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Görev</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Doğruluk</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Hız</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Kalite</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Bugün</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Trend</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Detay</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {users.map((user) => (
                <tr 
                  key={user.user_id}
                  className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer ${
                    user.rank_overall <= 3 ? 'bg-yellow-50/50 dark:bg-yellow-900/10' : ''
                  }`}
                  onClick={() => setSelectedUser(user)}
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      {getRankBadge(user.rank_overall)}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-bold">
                        {user.user_name.split(' ').map(n => n[0]).join('')}
                      </div>
                      <div>
                        <div className={`font-medium ${textClass}`}>{user.user_name}</div>
                        <div className="text-xs text-gray-500">ID: {user.user_id}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      user.role === 'picker' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                      user.role === 'receiver' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                      user.role === 'packer' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' :
                      'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400'
                    }`}>
                      {user.role === 'picker' ? 'Toplayıcı' : 
                       user.role === 'receiver' ? 'Kabul' :
                       user.role === 'packer' ? 'Paketleme' : user.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className={`text-sm ${textClass}`}>
                      {user.tasks_completed}/{user.tasks_assigned}
                    </div>
                    <div className="text-xs text-gray-500">
                      {((user.tasks_completed / user.tasks_assigned) * 100).toFixed(0)}%
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className={`text-lg font-bold ${getPerformanceColor(user.accuracy_rate)}`}>
                      {user.accuracy_rate.toFixed(1)}%
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className={`text-lg font-bold ${getPerformanceColor(user.speed_score)}`}>
                      {user.speed_score}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className={`text-lg font-bold ${getPerformanceColor(user.quality_score)}`}>
                      {user.quality_score}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className={`text-sm font-medium ${textClass}`}>
                      {user.items_picked_today}
                    </div>
                    <div className="text-xs text-gray-500">adet</div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    {getTrendIcon(user.performance_trend)}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedUser(user);
                      }}
                      className="text-blue-500 hover:text-blue-600"
                    >
                      <BarChart3 className="w-5 h-5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* User Detail Modal */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className={`${cardClass} rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto`}>
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-2xl font-bold">
                    {selectedUser.user_name.split(' ').map(n => n[0]).join('')}
                  </div>
                  <div>
                    <h3 className={`text-2xl font-bold ${textClass}`}>{selectedUser.user_name}</h3>
                    <p className="text-gray-500">Detaylı Performans Raporu</p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedUser(null)}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                >
                  <XCircle className="w-6 h-6 text-gray-500" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* Performance Scores */}
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                  <div className={`text-3xl font-bold ${getPerformanceColor(selectedUser.accuracy_rate)}`}>
                    {selectedUser.accuracy_rate.toFixed(1)}%
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">Doğruluk</div>
                  <div className="text-xs text-gray-500 mt-1">#{selectedUser.rank_accuracy} sırada</div>
                </div>
                <div className="text-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <div className={`text-3xl font-bold ${getPerformanceColor(selectedUser.speed_score)}`}>
                    {selectedUser.speed_score}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">Hız</div>
                  <div className="text-xs text-gray-500 mt-1">#{selectedUser.rank_speed} sırada</div>
                </div>
                <div className="text-center p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                  <div className={`text-3xl font-bold ${getPerformanceColor(selectedUser.quality_score)}`}>
                    {selectedUser.quality_score}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">Kalite</div>
                  <div className="text-xs text-gray-500 mt-1">Genel #{selectedUser.rank_overall}</div>
                </div>
              </div>

              {/* Daily Stats */}
              <div>
                <h4 className={`text-lg font-bold ${textClass} mb-3`}>Günlük İstatistikler</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className={`${cardClass} border p-4 rounded-lg`}>
                    <Package className="w-6 h-6 text-blue-500 mb-2" />
                    <div className={`text-2xl font-bold ${textClass}`}>{selectedUser.items_picked_today}</div>
                    <div className="text-sm text-gray-500">Bugün Toplanan</div>
                  </div>
                  <div className={`${cardClass} border p-4 rounded-lg`}>
                    <Clock className="w-6 h-6 text-green-500 mb-2" />
                    <div className={`text-2xl font-bold ${textClass}`}>{selectedUser.avg_pick_time}s</div>
                    <div className="text-sm text-gray-500">Ort. Toplama</div>
                  </div>
                  <div className={`${cardClass} border p-4 rounded-lg`}>
                    <CheckCircle className="w-6 h-6 text-green-500 mb-2" />
                    <div className={`text-2xl font-bold ${textClass}`}>{selectedUser.tasks_completed}</div>
                    <div className="text-sm text-gray-500">Tamamlanan</div>
                  </div>
                  <div className={`${cardClass} border p-4 rounded-lg`}>
                    <XCircle className="w-6 h-6 text-red-500 mb-2" />
                    <div className={`text-2xl font-bold ${textClass}`}>{selectedUser.picking_errors}</div>
                    <div className="text-sm text-gray-500">Hata</div>
                  </div>
                </div>
              </div>

              {/* Weekly Trend */}
              <div>
                <h4 className={`text-lg font-bold ${textClass} mb-3`}>Haftalık Performans</h4>
                <div className="h-48 bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-lg flex items-center justify-center">
                  <div className="text-center">
                    <BarChart3 className="w-16 h-16 text-gray-400 mx-auto mb-3" />
                    <p className="text-gray-500">Grafik görünümü yakında eklenecek</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
