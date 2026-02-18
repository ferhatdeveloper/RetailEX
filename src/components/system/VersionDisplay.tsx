import React, { useState } from 'react';
import { Info, History, TrendingUp, Activity } from 'lucide-react';
import { useVersion } from '../../contexts/VersionContext';
import { useTheme } from '../../contexts/ThemeContext';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { ScrollArea } from '../ui/scroll-area';
import { Badge } from '../ui/badge';
import { SystemStatusModal } from './SystemStatusModal';

export function VersionDisplay() {
  const { version, fullVersion, buildNumber, versionHistory, incrementVersion } = useVersion();
  const { darkMode } = useTheme();
  const [open, setOpen] = useState(false);
  const [showSystemStatus, setShowSystemStatus] = useState(false);

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <button
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${\n              darkMode\n                ? 'bg-gray-800 text-gray-300 hover:bg-gray-700'\n                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'\n            }`}
            onClick={(e) => {
              // Shift + Click = System Status
              if (e.shiftKey) {
                e.preventDefault();
                setShowSystemStatus(true);
              }
            }}
          >
            <Info className="w-4 h-4" />
            <span className="font-medium">{version}</span>
          </button>
        </DialogTrigger>
        <DialogContent className={`max-w-2xl ${darkMode ? 'bg-gray-900 text-white' : 'bg-white'}`}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-blue-500" />
              Versiyon Bilgileri
            </DialogTitle>
            <DialogDescription>
              Uygulama versiyon bilgilerini ve geçmişini görüntüleyin
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Quick Actions */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setOpen(false);
                  setShowSystemStatus(true);
                }}
                className="flex items-center gap-2"
              >
                <Activity className="w-4 h-4" />
                Sistem Durumu
              </Button>
            </div>

            {/* Current Version */}
            <div className={`p-4 rounded-lg border ${
              darkMode ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <span className={darkMode ? 'text-gray-400' : 'text-gray-600'}>
                  Mevcut Versiyon
                </span>
                <Badge variant="default" className="bg-blue-600">
                  Aktif
                </Badge>
              </div>
              <div className="text-2xl font-bold">{version}</div>
              <div className={`text-sm mt-1 ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                {fullVersion}
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-4">
              <div className={`p-4 rounded-lg border ${
                darkMode ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'
              }`}>
                <div className={`text-sm mb-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  Build Numarası
                </div>
                <div className="text-xl font-semibold">{buildNumber}</div>
              </div>
              <div className={`p-4 rounded-lg border ${
                darkMode ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'
              }`}>
                <div className={`text-sm mb-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  Toplam Güncelleme
                </div>
                <div className="text-xl font-semibold">{versionHistory.length}</div>
              </div>
            </div>

            {/* Version History */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold flex items-center gap-2">
                  <History className="w-4 h-4" />
                  Versiyon Geçmişi
                </h4>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => incrementVersion('Manuel test artışı')}
                >
                  Test Artışı
                </Button>
              </div>
              
              <ScrollArea className="h-[300px] pr-4">
                <div className="space-y-2">
                  {versionHistory.length === 0 ? (
                    <div className={`text-center py-8 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                      Henüz versiyon geçmişi yok
                    </div>
                  ) : (
                    versionHistory
                      .slice()
                      .reverse()
                      .map((entry, index) => (
                        <div
                          key={entry.version}
                          className={`p-3 rounded-lg border ${
                            darkMode ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-semibold">Version {entry.version}</span>
                                {index === 0 && (
                                  <Badge variant="secondary" className="text-xs">
                                    Güncel
                                  </Badge>
                                )}
                              </div>
                              <div className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                                {entry.reason}
                              </div>
                            </div>
                            <div className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                              {new Date(entry.timestamp).toLocaleString('tr-TR', {
                                day: '2-digit',
                                month: '2-digit',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </div>
                          </div>
                          {entry.user && (
                            <div className={`text-xs mt-1 ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                              Kullanıcı: {entry.user}
                            </div>
                          )}
                        </div>
                      ))
                  )}
                </div>
              </ScrollArea>
            </div>

            {/* Info */}
            <div className={`text-xs p-3 rounded-lg ${
              darkMode ? 'bg-blue-900/20 text-blue-300' : 'bg-blue-50 text-blue-700'
            }`}>
              <strong>Not:</strong> Versiyon numarası önemli işlemlerde (satış, ürün ekleme, ayar değişikliği vb.) 
              otomatik olarak artırılır.
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* System Status Modal */}
      {showSystemStatus && (
        <SystemStatusModal
          open={showSystemStatus}
          onOpenChange={setShowSystemStatus}
        />
      )}
    </>
  );
}

// Compact version for headers/footers
export function VersionBadge() {
  const { version } = useVersion();
  const { darkMode } = useTheme();

  return (
    <Badge 
      variant="outline" 
      className={`text-xs ${darkMode ? 'border-gray-700' : 'border-gray-300'}`}
    >
      {version}
    </Badge>
  );
}
