/**
 * WhatsApp Baileys köprüsü — oturumu kapat, veriyi sıfırla, yeni QR üret.
 */
import React, { useState } from 'react';
import { Loader2, LogOut } from 'lucide-react';
import { toast } from 'sonner';
import { resetEmbeddedBridgeSession } from '../../services/messaging/whatsappEmbeddedBridge';
import { useTheme } from '../../contexts/ThemeContext';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../ui/alert-dialog';

export interface WhatsAppSessionResetButtonProps {
  baseUrl: string;
  token?: string | null;
  disabled?: boolean;
  /** header = üst bar, inline = panel içi */
  variant?: 'header' | 'inline' | 'destructive';
  className?: string;
  onResetComplete?: (result: { status?: string; qr?: string | null }) => void;
}

export function WhatsAppSessionResetButton({
  baseUrl,
  token,
  disabled = false,
  variant = 'inline',
  className = '',
  onResetComplete,
}: WhatsAppSessionResetButtonProps) {
  const { darkMode } = useTheme();
  const [open, setOpen] = useState(false);
  const [resetting, setResetting] = useState(false);

  const runReset = async () => {
    const url = baseUrl.trim();
    if (!url) {
      toast.error('Önce köprü URL girin');
      return;
    }
    setResetting(true);
    try {
      const r = await resetEmbeddedBridgeSession({
        whatsapp_base_url: url,
        whatsapp_token: token ?? null,
      });
      if (r.ok) {
        toast.success(r.message || 'Oturum kapatıldı — yeni QR hazırlanıyor');
        onResetComplete?.({ status: r.status, qr: r.qr ?? null });
        setOpen(false);
      } else {
        toast.error(r.error || 'Oturum sıfırlanamadı');
      }
    } finally {
      setResetting(false);
    }
  };

  const triggerClass =
    variant === 'header'
      ? `inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-50 ${
          darkMode
            ? 'border-gray-700 bg-gray-800 text-gray-200 hover:bg-gray-700'
            : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
        }`
      : variant === 'destructive'
        ? `inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50 ${
            darkMode
              ? 'border-red-800 text-red-300 hover:bg-red-950/50'
              : 'border-red-200 text-red-700 hover:bg-red-50'
          }`
        : `inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50 ${
            darkMode
              ? 'border-gray-600 text-gray-200 hover:bg-gray-800'
              : 'border-gray-300 text-gray-700 hover:bg-gray-50'
          }`;

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <button
          type="button"
          disabled={disabled || resetting || !baseUrl.trim()}
          className={`${triggerClass} ${className}`}
        >
          {resetting ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
          Oturumu kapat ve sıfırla
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent className={darkMode ? 'bg-gray-900 border-gray-700 text-gray-100' : ''}>
        <AlertDialogHeader>
          <AlertDialogTitle>WhatsApp oturumunu kapat?</AlertDialogTitle>
          <AlertDialogDescription className={darkMode ? 'text-gray-400' : ''}>
            Bağlı cihaz oturumu sonlandırılır, sunucudaki oturum dosyaları silinir ve yeni bağlantı için QR kod
            üretilir. Telefonda WhatsApp → Bağlı cihazlar listesinden bu oturum da kalkabilir.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={resetting}>Vazgeç</AlertDialogCancel>
          <AlertDialogAction
            disabled={resetting}
            onClick={(e) => {
              e.preventDefault();
              void runReset();
            }}
            className="bg-red-600 hover:bg-red-700"
          >
            {resetting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin inline" />
                Sıfırlanıyor…
              </>
            ) : (
              'Kapat ve sıfırla'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
