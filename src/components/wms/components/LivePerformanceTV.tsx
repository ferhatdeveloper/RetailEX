// ğŸ“º Live Performance TV - Anlık Performans Ekranı
// Full-screen live performance dashboard for warehouse TV displays

import { useState, useEffect } from 'react';
import {
  Trophy, Medal, Star, TrendingUp, Target, Zap,
  Package, CheckCircle, Clock, BarChart3, Award,
  Activity, Users, Crown
} from 'lucide-react';

interface LivePerformanceTVProps {
  darkMode: boolean;
  onBack: () => void;
}

interface LivePerformer {
  id: string;
  name: string;
  rank: number;
  items_picked_today: number;
  accuracy_rate: number;
  speed_score: number;
  trend: 'up' | 'down' | 'stable';
  avatar_color: string;
}

export function LivePerformanceTV({ darkMode, onBack }: LivePerformanceTVProps) {
  const [performers, setPerformers] = useState<LivePerformer[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    loadPerformers();
    const performerInterval = setInterval(loadPerformers, 5000); // Refresh every 5 seconds

    const timeInterval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => {
      clearInterval(performerInterval);
      clearInterval(timeInterval);
    };
  }, []);

  const loadPerformers = async () => {
    // Mock real-time data
    const mockPerformers: LivePerformer[] = [
      {
        id: '1',
        name: 'Ahmet YILMAZ',
        rank: 1,
        items_picked_today: 487,
        accuracy_rate: 99.2,
        speed_score: 96,
        trend: 'up',
        avatar_color: 'from-yellow-400 to-yellow-600'
      },
      {
        id: '2',
        name: 'Mehmet DEMİR',
        rank: 2,
        items_picked_today: 465,
        accuracy_rate: 98.5,
        speed_score: 94,
        trend: 'stable',
        avatar_color: 'from-gray-300 to-gray-500'
      },
      {
        id: '3',
        name: 'Ali KAYA',
        rank: 3,
        items_picked_today: 452,
        accuracy_rate: 97.8,
        speed_score: 93,
        trend: 'up',
        avatar_color: 'from-amber-600 to-amber-800'
      },
      {
        id: '4',
        name: 'Ayşe ŞAHİN',
        rank: 4,
        items_picked_today: 438,
        accuracy_rate: 98.1,
        speed_score: 91,
        trend: 'down',
        avatar_color: 'from-blue-400 to-blue-600'
      },
      {
        id: '5',
        name: 'Fatma ÖZ',
        rank: 5,
        items_picked_today: 425,
        accuracy_rate: 96.9,
        speed_score: 90,
        trend: 'stable',
        avatar_color: 'from-purple-400 to-purple-600'
      },
    ];
    setPerformers(mockPerformers);
  };

  const getRankBadge = (rank: number) => {
    if (rank === 1) {
      return (
        <div className="relative">
          <Crown className="w-16 h-16 text-yellow-400 fill-yellow-400 animate-pulse" />
          <div className="absolute inset-0 bg-yellow-400/20 rounded-full animate-ping" />
        </div>
      );
    }
    if (rank === 2) {
      return <Medal className="w-16 h-16 text-gray-400 fill-gray-400" />;
    }
    if (rank === 3) {
      return <Medal className="w-16 h-16 text-amber-600 fill-amber-600" />;
    }
    return (
      <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center">
        <span className="text-3xl font-bold text-white">#{rank}</span>
      </div>
    );
  };

  const getTrendIcon = (trend: string) => {
    if (trend === 'up') {
      return <TrendingUp className="w-8 h-8 text-green-400 animate-bounce" />;
    }
    if (trend === 'down') {
      return <Activity className="w-8 h-8 text-red-400" />;
    }
    return <Activity className="w-8 h-8 text-gray-400" />;
  };

  const bgGradient = 'bg-gradient-to-br from-blue-900 via-purple-900 to-blue-900';

  return (
    <div className={`min-h-screen ${bgGradient} text-white p-8 relative overflow-hidden`}>
      {/* Animated Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse delay-1000" />
      </div>

      {/* Header */}
      <div className="relative z-10 mb-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="w-20 h-20 bg-gradient-to-br from-yellow-400 to-yellow-600 rounded-2xl flex items-center justify-center shadow-2xl">
              <Trophy className="w-12 h-12 text-white" />
            </div>
            <div>
              <h1 className="text-5xl font-black tracking-tight mb-2 bg-gradient-to-r from-yellow-300 to-yellow-500 bg-clip-text text-transparent">
                PERFORMANS LİDERLİĞİ
              </h1>
              <p className="text-xl text-blue-200">Bugünün En İyileri</p>
            </div>
          </div>

          <div className="text-right">
            <div className="text-5xl font-black tabular-nums">
              {currentTime.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
            </div>
            <div className="text-xl text-blue-200">
              {currentTime.toLocaleDateString('tr-TR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
            </div>
          </div>
        </div>
      </div>

      {/* Top 3 Podium */}
      <div className="relative z-10 mb-12">
        <div className="grid grid-cols-3 gap-8 max-w-6xl mx-auto">
          {/* 2nd Place */}
          <div className="flex flex-col items-center transform -translate-y-4">
            <div className="mb-4">
              {getRankBadge(2)}
            </div>
            <div className={`w-full bg-gradient-to-br ${performers[1]?.avatar_color || 'from-gray-400 to-gray-600'} h-32 rounded-t-3xl flex items-center justify-center text-6xl font-black shadow-2xl`}>
              2
            </div>
            <div className="w-full bg-white/10 backdrop-blur-sm p-6 rounded-b-3xl border-2 border-gray-400/30">
              <div className="text-center mb-4">
                <div className="text-3xl font-black mb-2">{performers[1]?.name || 'Loading...'}</div>
                <div className="text-6xl font-black text-yellow-300 mb-2">
                  {performers[1]?.items_picked_today || 0}
                </div>
                <div className="text-xl text-blue-200">ürün toplandı</div>
              </div>
              <div className="flex justify-around text-center">
                <div>
                  <div className="text-2xl font-bold">{performers[1]?.accuracy_rate || 0}%</div>
                  <div className="text-sm text-blue-200">Doğruluk</div>
                </div>
                <div>
                  <div className="text-2xl font-bold">{performers[1]?.speed_score || 0}</div>
                  <div className="text-sm text-blue-200">Hız</div>
                </div>
              </div>
            </div>
          </div>

          {/* 1st Place - Larger */}
          <div className="flex flex-col items-center transform -translate-y-12 scale-110">
            <div className="mb-4">
              {getRankBadge(1)}
            </div>
            <div className={`w-full bg-gradient-to-br ${performers[0]?.avatar_color || 'from-yellow-400 to-yellow-600'} h-40 rounded-t-3xl flex items-center justify-center text-8xl font-black shadow-2xl ring-4 ring-yellow-400/50`}>
              1
            </div>
            <div className="w-full bg-white/10 backdrop-blur-sm p-6 rounded-b-3xl border-2 border-yellow-400/50 shadow-2xl">
              <div className="text-center mb-4">
                <div className="text-4xl font-black mb-2">{performers[0]?.name || 'Loading...'}</div>
                <div className="text-8xl font-black text-yellow-300 mb-2 animate-pulse">
                  {performers[0]?.items_picked_today || 0}
                </div>
                <div className="text-2xl text-blue-200">ürün toplandı</div>
              </div>
              <div className="flex justify-around text-center">
                <div>
                  <div className="text-3xl font-bold">{performers[0]?.accuracy_rate || 0}%</div>
                  <div className="text-base text-blue-200">Doğruluk</div>
                </div>
                <div>
                  <div className="text-3xl font-bold">{performers[0]?.speed_score || 0}</div>
                  <div className="text-base text-blue-200">Hız</div>
                </div>
              </div>
            </div>
          </div>

          {/* 3rd Place */}
          <div className="flex flex-col items-center transform -translate-y-2">
            <div className="mb-4">
              {getRankBadge(3)}
            </div>
            <div className={`w-full bg-gradient-to-br ${performers[2]?.avatar_color || 'from-amber-600 to-amber-800'} h-28 rounded-t-3xl flex items-center justify-center text-5xl font-black shadow-2xl`}>
              3
            </div>
            <div className="w-full bg-white/10 backdrop-blur-sm p-6 rounded-b-3xl border-2 border-amber-600/30">
              <div className="text-center mb-4">
                <div className="text-2xl font-black mb-2">{performers[2]?.name || 'Loading...'}</div>
                <div className="text-5xl font-black text-yellow-300 mb-2">
                  {performers[2]?.items_picked_today || 0}
                </div>
                <div className="text-lg text-blue-200">ürün toplandı</div>
              </div>
              <div className="flex justify-around text-center">
                <div>
                  <div className="text-xl font-bold">{performers[2]?.accuracy_rate || 0}%</div>
                  <div className="text-xs text-blue-200">Doğruluk</div>
                </div>
                <div>
                  <div className="text-xl font-bold">{performers[2]?.speed_score || 0}</div>
                  <div className="text-xs text-blue-200">Hız</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Remaining Performers */}
      <div className="relative z-10 max-w-6xl mx-auto">
        <div className="grid grid-cols-2 gap-6">
          {performers.slice(3, 5).map((performer) => (
            <div key={performer.id} className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
              <div className="flex items-center gap-4 mb-4">
                <div className="text-5xl font-black text-blue-300">#{performer.rank}</div>
                <div className="flex-1">
                  <div className="text-2xl font-black mb-1">{performer.name}</div>
                  <div className="flex items-center gap-2">
                    <div className="text-4xl font-black text-yellow-300">{performer.items_picked_today}</div>
                    <div className="text-sm text-blue-200">ürün</div>
                    {getTrendIcon(performer.trend)}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 text-center">
                <div className="bg-white/5 rounded-lg p-3">
                  <div className="text-2xl font-bold">{performer.accuracy_rate}%</div>
                  <div className="text-xs text-blue-200">Doğruluk</div>
                </div>
                <div className="bg-white/5 rounded-lg p-3">
                  <div className="text-2xl font-bold">{performer.speed_score}</div>
                  <div className="text-xs text-blue-200">Hız Skoru</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer Stats */}
      <div className="relative z-10 mt-12 max-w-6xl mx-auto">
        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
          <div className="grid grid-cols-4 gap-6 text-center">
            <div>
              <Package className="w-12 h-12 mx-auto mb-2 text-yellow-400" />
              <div className="text-4xl font-black mb-1">
                {performers.reduce((sum, p) => sum + p.items_picked_today, 0)}
              </div>
              <div className="text-sm text-blue-200">Toplam Toplanan</div>
            </div>
            <div>
              <Users className="w-12 h-12 mx-auto mb-2 text-green-400" />
              <div className="text-4xl font-black mb-1">{performers.length}</div>
              <div className="text-sm text-blue-200">Aktif Toplayıcı</div>
            </div>
            <div>
              <Target className="w-12 h-12 mx-auto mb-2 text-purple-400" />
              <div className="text-4xl font-black mb-1">
                {(performers.reduce((sum, p) => sum + p.accuracy_rate, 0) / performers.length).toFixed(1)}%
              </div>
              <div className="text-sm text-blue-200">Ort. Doğruluk</div>
            </div>
            <div>
              <Zap className="w-12 h-12 mx-auto mb-2 text-orange-400" />
              <div className="text-4xl font-black mb-1">
                {(performers.reduce((sum, p) => sum + p.speed_score, 0) / performers.length).toFixed(0)}
              </div>
              <div className="text-sm text-blue-200">Ort. Hız</div>
            </div>
          </div>
        </div>
      </div>

      {/* Live Indicator */}
      <div className="fixed top-4 right-4 z-50 flex items-center gap-2 bg-red-500 px-4 py-2 rounded-full shadow-2xl">
        <div className="w-3 h-3 bg-white rounded-full animate-pulse" />
        <span className="font-bold text-sm">CANLI</span>
      </div>

      {/* Exit Button (hidden in fullscreen) */}
      {!isFullscreen && (
        <button
          onClick={onBack}
          className="fixed bottom-4 left-4 z-50 px-6 py-3 bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-xl font-semibold transition-colors"
        >
          ← Geri Dön
        </button>
      )}

      {/* Fullscreen Toggle */}
      <button
        onClick={() => {
          if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
            setIsFullscreen(true);
          } else {
            document.exitFullscreen();
            setIsFullscreen(false);
          }
        }}
        className="fixed bottom-4 right-4 z-50 px-6 py-3 bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-xl font-semibold transition-colors"
      >
        {isFullscreen ? '⊗ Tam Ekrandan Çık' : '⛶ Tam Ekran'}
      </button>
    </div>
  );
}

