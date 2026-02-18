// Barcode & QR Code Scanner Component - Mobile Optimized

import { useState, useRef, useEffect } from 'react';
import { Html5QrcodeScanner, Html5Qrcode } from 'html5-qrcode';
import { 
  Camera, 
  X, 
  Zap, 
  ZapOff,
  RotateCcw,
  Maximize2,
  Check,
  AlertCircle
} from 'lucide-react';

export interface BarcodeScanResult {
  code: string;
  type: 'barcode' | 'qrcode';
  rawData: string;
}

interface BarcodeScannerProps {
  onScan: (result: BarcodeScanResult) => void;
  onClose: () => void;
  continuous?: boolean;
  vibrate?: boolean;
  playSound?: boolean;
}

export function BarcodeScanner({
  onScan,
  onClose,
  continuous = false,
  vibrate = true,
  playSound = true
}: BarcodeScannerProps) {
  const [isScanning, setIsScanning] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastScan, setLastScan] = useState<string | null>(null);
  const [cameraFacing, setCameraFacing] = useState<'user' | 'environment'>('environment');
  
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannerDivRef = useRef<HTMLDivElement>(null);
  const isProcessingRef = useRef(false); // Prevent multiple scans

  // Initialize scanner
  useEffect(() => {
    initScanner();
    return () => {
      stopScanner();
    };
  }, [cameraFacing]);

  const initScanner = async () => {
    try {
      setError(null);
      setHasPermission(null);
      
      // Check if mediaDevices is supported
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setHasPermission(false);
        setError('Tarayıcınız kamera erişimini desteklemiyor. Lütfen güncel bir tarayıcı kullanın.');
        return;
      }

      // Create scanner instance
      const scannerId = 'barcode-scanner-' + Date.now();
      if (scannerDivRef.current) {
        scannerDivRef.current.id = scannerId;
      }

      const html5QrCode = new Html5Qrcode(scannerId);
      scannerRef.current = html5QrCode;

      // Get available cameras
      const cameras = await Html5Qrcode.getCameras();
      if (!cameras || cameras.length === 0) {
        setHasPermission(false);
        setError('Kamera bulunamadı. Lütfen cihazınızda kamera olduğundan emin olun.');
        return;
      }

      // Find back camera (environment) or front camera (user)
      let cameraId = cameras[0].id;
      const backCamera = cameras.find(cam => 
        cam.label.toLowerCase().includes('back') || 
        cam.label.toLowerCase().includes('rear') ||
        cam.label.toLowerCase().includes('environment')
      );
      const frontCamera = cameras.find(cam => 
        cam.label.toLowerCase().includes('front') ||
        cam.label.toLowerCase().includes('user')
      );

      if (cameraFacing === 'environment' && backCamera) {
        cameraId = backCamera.id;
      } else if (cameraFacing === 'user' && frontCamera) {
        cameraId = frontCamera.id;
      }

      // Start scanning
      await html5QrCode.start(
        cameraId,
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0,
        },
        (decodedText, decodedResult) => {
          // Success callback
          handleScanSuccess({
            code: decodedText,
            type: decodedResult.result.format?.formatName?.toLowerCase().includes('qr') ? 'qrcode' : 'barcode',
            rawData: decodedText
          });
        },
        (errorMessage) => {
          // Error callback (called frequently, ignore most errors)
          // Only log critical errors
        }
      );

      setHasPermission(true);
      setIsScanning(true);
    } catch (err: any) {
      console.error('Scanner error:', err);
      setHasPermission(false);
      
      // Provide specific error messages
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setError('Kamera izni reddedildi. Lütfen tarayıcı ayarlarından kamera iznini verin ve sayfayı yenileyin.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setError('Kamera bulunamadı. Lütfen cihazınızda kamera olduğundan emin olun.');
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        setError('Kamera kullanımda. Lütfen diğer uygulamaları kapatın ve tekrar deneyin.');
      } else if (err.name === 'OverconstrainedError') {
        setError('Kamera ayarları desteklenmiyor. Farklı bir kamera deneyin.');
      } else if (err.name === 'SecurityError') {
        setError('Güvenlik hatası. HTTPS bağlantısı gerekli olabilir.');
      } else {
        setError(`Kamera hatası: ${err.message || 'Bilinmeyen hata'}`);
      }
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current && isScanning) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch (err) {
        console.error('Error stopping scanner:', err);
      }
    }
    setIsScanning(false);
  };

  const handleScanSuccess = (result: BarcodeScanResult) => {
    // Prevent duplicate scans
    if (isProcessingRef.current) {
      return;
    }
    isProcessingRef.current = true;

    setLastScan(result.code);

    // Haptic feedback
    if (vibrate && 'vibrate' in navigator) {
      navigator.vibrate(100);
    }

    // Sound feedback
    if (playSound) {
      playBeep();
    }

    // Callback
    onScan(result);

    // Close if not continuous
    if (!continuous) {
      setTimeout(async () => {
        await stopScanner();
        onClose();
      }, 500);
    }

    // Reset processing flag after a short delay
    setTimeout(() => {
      isProcessingRef.current = false;
    }, 1000);
  };

  const playBeep = () => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = 800;
      oscillator.type = 'sine';
      gainNode.gain.value = 0.3;

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.1);
    } catch (err) {
      console.error('Audio error:', err);
    }
  };

  const switchCamera = async () => {
    await stopScanner();
    setCameraFacing(prev => prev === 'user' ? 'environment' : 'user');
  };

  if (hasPermission === false) {
    return (
      <div className="fixed inset-0 bg-black z-50 flex items-center justify-center">
        <div className="bg-white rounded-lg p-6 max-w-md mx-4">
          <div className="flex items-center gap-3 mb-4">
            <AlertCircle className="h-8 w-8 text-red-600" />
            <h3 className="text-xl font-semibold">Kamera İzni Gerekli</h3>
          </div>
          <p className="text-gray-600 mb-4">{error}</p>
          <div className="flex gap-3">
            <button
              onClick={initScanner}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Tekrar Dene
            </button>
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              İptal
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      {/* Header */}
      <div className="bg-black/80 backdrop-blur-sm p-4 flex items-center justify-between">
        <h2 className="text-white font-semibold">Barkod/QR Kod Tara</h2>
        <button
          onClick={() => {
            stopScanner();
            onClose();
          }}
          className="p-2 text-white hover:bg-white/10 rounded-lg"
        >
          <X className="h-6 w-6" />
        </button>
      </div>

      {/* Camera View */}
      <div className="flex-1 relative overflow-hidden bg-black">
        <div
          ref={scannerDivRef}
          className="w-full h-full"
          style={{ 
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        />

        {/* Scanning Overlay */}
        <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 10 }}>
          {/* Top shadow */}
          <div className="absolute top-0 left-0 right-0 h-1/4 bg-gradient-to-b from-black/60 to-transparent" />
          
          {/* Scanning frame */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 max-w-[80vw] max-h-[40vh]">
            {/* Corner borders */}
            <div className="absolute top-0 left-0 w-12 h-12 border-t-4 border-l-4 border-white rounded-tl-lg" />
            <div className="absolute top-0 right-0 w-12 h-12 border-t-4 border-r-4 border-white rounded-tr-lg" />
            <div className="absolute bottom-0 left-0 w-12 h-12 border-b-4 border-l-4 border-white rounded-bl-lg" />
            <div className="absolute bottom-0 right-0 w-12 h-12 border-b-4 border-r-4 border-white rounded-br-lg" />
            
            {/* Scanning line animation */}
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-blue-500 to-transparent animate-[scan_2s_ease-in-out_infinite]" />
          </div>

          {/* Bottom shadow */}
          <div className="absolute bottom-0 left-0 right-0 h-1/4 bg-gradient-to-t from-black/60 to-transparent" />
        </div>

        {/* Last scan indicator */}
        {lastScan && (
          <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-green-500 text-white px-4 py-2 rounded-full flex items-center gap-2 animate-[slideDown_0.3s_ease-out]" style={{ zIndex: 11 }}>
            <Check className="h-4 w-4" />
            <span className="text-sm font-medium">{lastScan}</span>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="bg-black/80 backdrop-blur-sm p-6">
        <div className="flex items-center justify-center gap-6">
          {/* Switch Camera */}
          <button
            onClick={switchCamera}
            className="p-4 bg-white/10 text-white rounded-full"
            title="Kamerayı Değiştir"
          >
            <RotateCcw className="h-6 w-6" />
          </button>
        </div>

        {/* Instructions */}
        <div className="mt-4 text-center text-white/70 text-sm">
          Barkod veya QR kodu kamera görüntüsüne yerleştirin ve bekleyin
        </div>
      </div>

      {/* CSS for animations */}
      <style>{`
        @keyframes scan {
          0%, 100% { top: 0%; }
          50% { top: 100%; }
        }
        @keyframes slideDown {
          from { transform: translate(-50%, -100%); opacity: 0; }
          to { transform: translate(-50%, 0); opacity: 1; }
        }
        /* Style html5-qrcode elements - use wildcard for dynamic IDs */
        div[id^="barcode-scanner-"] video {
          width: 100% !important;
          height: 100% !important;
          object-fit: cover !important;
          position: absolute !important;
          top: 0 !important;
          left: 0 !important;
        }
        div[id^="barcode-scanner-"] {
          width: 100% !important;
          height: 100% !important;
        }
        /* Hide html5-qrcode default button/UI */
        div[id^="barcode-scanner-"] > div:last-child {
          display: none !important;
        }
        div[id^="barcode-scanner-"] button {
          display: none !important;
        }
      `}</style>
    </div>
  );
}

/**
 * Compact Barcode Scanner Button (for POS)
 */
export function BarcodeScannerButton({ 
  onScan 
}: { 
  onScan: (result: BarcodeScanResult) => void 
}) {
  const [showScanner, setShowScanner] = useState(false);

  return (
    <>
      <button
        onClick={() => setShowScanner(true)}
        data-scanner-trigger
        className="p-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        title="Barkod Tara"
      >
        <Camera className="h-5 w-5" />
      </button>

      {showScanner && (
        <BarcodeScanner
          onScan={(result) => {
            onScan(result);
            setShowScanner(false);
          }}
          onClose={() => setShowScanner(false)}
          vibrate={true}
          playSound={true}
        />
      )}
    </>
  );
}
