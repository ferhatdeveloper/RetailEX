import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
    Mic, MicOff, Sparkles, Send, X, History, Lightbulb, Loader2,
    Smartphone, Monitor, Globe, RefreshCw, Volume2, VolumeX,
    Image as ImageIcon, Paperclip, MessageSquare, ArrowRight,
    ClipboardPen, ShoppingCart, FilePlus, PenTool, Check, Crop
} from 'lucide-react';
import { supplierAPI } from '../../services/api/suppliers';
import { productAPI } from '../../services/api/products';
import { UserPlus, PackagePlus } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useVoiceCommandRouter } from '../../services/voiceCommandRouter';
import { getPopularCommands, getAllCommandExamples } from '../../config/voiceCommandDefinitions';
import { getVoiceService } from '../../services/voiceService';
import { VoiceServiceProvider } from '../../services/voiceTypes';
import { visionService, type VisionResult } from '../../services/visionService';

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    type: 'text' | 'image' | 'action' | 'action_verification';
    image?: string;
    data?: any;
    timestamp: number;
}

export function VoiceAssistantWeb({ hideFloatingButton = false }: { hideFloatingButton?: boolean }) {
    const [listening, setListening] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputText, setInputText] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [isMuted, setIsMuted] = useState(() => localStorage.getItem('voice_assistant_muted') === 'true');
    const [error, setError] = useState<string | null>(null);
    const [audioLevel, setAudioLevel] = useState(0);
    const [isDetectingAudio, setIsDetectingAudio] = useState(false);
    const [visionResult, setVisionResult] = useState<VisionResult | null>(null);
    const [showVisionModal, setShowVisionModal] = useState(false);

    // ROI / Drawing State
    const [drawingImage, setDrawingImage] = useState<string | null>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const drawingStartRef = useRef<{ x: number, y: number } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const animationFrameRef = useRef<number | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const location = useLocation();
    const voiceService = getVoiceService();

    const {
        routeCommand,
        getSuggestedCommands,
        getCommandHistory,
        saveCommandToHistory
    } = useVoiceCommandRouter();

    const commandHistory = getCommandHistory();
    const popularCommands = getPopularCommands('tr');
    const isVoiceAvailable = voiceService.isAvailable();
    const providerName = voiceService.getProviderName();

    // Auto-scroll to bottom
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    // Helpers
    const addMessage = useCallback((role: 'user' | 'assistant', content: string, type: 'text' | 'image' | 'action' | 'action_verification' = 'text', image?: string, data?: any) => {
        const newMessage: Message = {
            id: Math.random().toString(36).substring(7),
            role,
            content,
            type,
            image,
            data,
            timestamp: Date.now()
        };
        setMessages(prev => [...prev, newMessage]);
        return newMessage;
    }, []);

    // Effects
    useEffect(() => {
        voiceService.setMute(isMuted);
    }, [isMuted, voiceService]);

    // Cleanup audio monitoring on unmount
    useEffect(() => {
        return () => {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
            if (audioContextRef.current) {
                audioContextRef.current.close();
            }
        };
    }, []);

    useEffect(() => {
        const handleKeyPress = (e: KeyboardEvent) => {
            if (e.ctrlKey && e.shiftKey && e.key === 'V') {
                e.preventDefault();
                setIsOpen(prev => !prev);
            }
        };

        const handleShowHelp = () => setShowSuggestions(true);
        const handleDataResult = (e: CustomEvent<{ response: string }>) => {
            if (e.detail.response) {
                addMessage('assistant', e.detail.response);
            }
        };

        const handleToggle = () => setIsOpen(prev => !prev);

        window.addEventListener('voiceCommandShowHelp', handleShowHelp);
        window.addEventListener('voiceCommandDataResult', handleDataResult as EventListener);
        window.addEventListener('keydown', handleKeyPress);
        window.addEventListener('voiceAssistantToggle', handleToggle);
        return () => {
            window.removeEventListener('voiceCommandShowHelp', handleShowHelp);
            window.removeEventListener('voiceCommandDataResult', handleDataResult as EventListener);
            window.removeEventListener('keydown', handleKeyPress);
            window.removeEventListener('voiceAssistantToggle', handleToggle);
        };
    }, [addMessage]);

    // Audio Monitoring
    const startAudioMonitoring = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
            });
            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            const analyser = audioContext.createAnalyser();
            const microphone = audioContext.createMediaStreamSource(stream);
            analyser.fftSize = 256;
            microphone.connect(analyser);
            audioContextRef.current = audioContext;
            analyserRef.current = analyser;
            const dataArray = new Uint8Array(analyser.frequencyBinCount);
            const updateLevel = () => {
                if (!analyserRef.current) return;
                analyserRef.current.getByteFrequencyData(dataArray);
                const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
                const normalizedLevel = Math.min(100, (average / 128) * 100);
                setAudioLevel(normalizedLevel);
                setIsDetectingAudio(normalizedLevel > 5);
                animationFrameRef.current = requestAnimationFrame(updateLevel);
            };
            updateLevel();
            return stream;
        } catch (err) {
            console.error('Audio monitoring error:', err);
            return null;
        }
    };

    const stopAudioMonitoring = () => {
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
        }
        if (audioContextRef.current) {
            audioContextRef.current.close();
            audioContextRef.current = null;
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
        setAudioLevel(0);
        setIsDetectingAudio(false);
    };

    // Command Processing logic
    const processCommand = async (transcript: string) => {
        setIsProcessing(true);
        setError(null);

        try {
            const result = await voiceService.processCommand(transcript);
            addMessage('assistant', result.response_text);
            voiceService.speak(result.response_text);
            saveCommandToHistory(result.transcript);
            if (result.success) {
                await routeCommand(result);
            }
        } catch (err: any) {
            console.error('Processing error:', err);
            setError('Komut işlenirken bir hata oluştu.');
            addMessage('assistant', 'Üzgünüm, bir hata oluştu.');
        } finally {
            setIsProcessing(false);
        }
    };

    const startListening = async () => {
        try {
            setError(null);
            setListening(true);
            addMessage('assistant', 'Dinliyorum...');
            setShowHistory(false);
            setShowSuggestions(false);
            streamRef.current = await startAudioMonitoring();
            const transcript = await voiceService.startListening();
            setListening(false);
            stopAudioMonitoring();
            if (transcript) {
                addMessage('user', transcript);
                await processCommand(transcript);
            }
        } catch (err: any) {
            console.error('Voice error:', err);
            setListening(false);
            stopAudioMonitoring();
            const msg = err.message || '';
            if (msg.includes('no-speech')) {
                setError('Ses algılanamadı. Lütfen tekrar deneyin.');
            } else if (msg.includes('not-allowed')) {
                setError('Mikrofon izni reddedildi. Lütfen tarayıcı ayarlarından izin verin.');
            } else {
                setError(err.message || 'Bir hata oluştu. Tekrar deneyin.');
            }
        }
    };

    const stopListening = () => {
        voiceService.stopListening();
        setListening(false);
        stopAudioMonitoring();
    };

    const executeTextCommand = async (text: string) => {
        if (!text.trim()) return;
        addMessage('user', text);
        setInputText('');
        setIsProcessing(true);
        setError(null);
        try {
            const result = await voiceService.processCommand(text);
            addMessage('assistant', result.response_text);
            saveCommandToHistory(text);
            if (result.success) await routeCommand(result);
        } catch (err) {
            console.error('Text command error:', err);
            setError('Komut işlenirken bir hata oluştu.');
        } finally {
            setIsProcessing(false);
        }
    };

    // Vision Upload
    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (event) => {
            const base64 = event.target?.result as string;
            addMessage('user', 'Resim üzerinden işlem yapmak istiyorum.', 'image', base64);
            setIsProcessing(true);
            try {
                const result = await visionService.analyzeImage(base64);
                setVisionResult(result);

                if (result.success) {
                    // SMART VERIFICATION: Check if entities exist
                    await checkAndPromptMissingEntities(result);
                } else {
                    addMessage('assistant', 'Üzgünüm, resimden veri çıkaramadım.');
                }
            } catch (err) {
                console.error('Vision error:', err);
                addMessage('assistant', 'Hata oluştu.');
            } finally {
                setIsProcessing(false);
            }
        };
        reader.readAsDataURL(file);
    };

    // ROI Drawing Logic
    const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const x = ('touches' in e ? e.touches[0].clientX : e.clientX) - rect.left;
        const y = ('touches' in e ? e.touches[0].clientY : e.clientY) - rect.top;

        setIsDrawing(true);
        drawingStartRef.current = { x, y };

        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.strokeStyle = 'rgba(255, 255, 0, 0.5)'; // Highlighter yellow
            ctx.lineWidth = 20;
            ctx.lineCap = 'round';
        }
    };

    const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
        if (!isDrawing || !drawingStartRef.current) return;
        const canvas = canvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const x = ('touches' in e ? e.touches[0].clientX : e.clientX) - rect.left;
        const y = ('touches' in e ? e.touches[0].clientY : e.clientY) - rect.top;

        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.lineTo(x, y);
            ctx.stroke();
        }
    };

    const stopDrawing = () => {
        setIsDrawing(false);
        drawingStartRef.current = null;
    };

    const analyzeSelection = async () => {
        if (!drawingImage || !canvasRef.current) return;

        setIsProcessing(true);
        addMessage('assistant', 'Seçilen alan analiz ediliyor...');
        setDrawingImage(null); // Close drawing view

        try {
            // Convert canvas to image (crop is implicit in what was drawn? No, user highlights.)
            // Actually, complex crop from highlight is hard. 
            // Simplified: We just send the WHOLE canvas content effectively masking?
            // BETTER STRATEGY for "Highlight":
            // 1. Get bounding box of all non-transparent pixels in canvas?
            // 2. Or just send the original image but urge user to "Crop" instead of "Highlight"?
            // Let's assume user highlights the text they want.
            // For Tesseract, simple cropping is best.
            // Let's grab the bounding box of the highlighted stroke.

            // Getting bounding box from canvas pixel data
            const canvas = canvasRef.current;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            const w = canvas.width;
            const h = canvas.height;
            // Create a temp canvas to hold the original image
            const img = new Image();
            img.src = drawingImage;
            await new Promise(r => img.onload = r);

            // For now, simpler approach: Just send the original image AGAIN but marked as ROI?
            // Or actually crop it.
            // Let's try simple cropping to the drawn bounds. 
            // Since we didn't track min/max during draw for simplicity, let's scan pixels.
            // Scanning 420x600 pixels is fast enough.
            const pixels = ctx.getImageData(0, 0, w, h).data;
            let minX = w, minY = h, maxX = 0, maxY = 0;
            let found = false;

            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    const alpha = pixels[(y * w + x) * 4 + 3];
                    if (alpha > 0) { // Highlighted
                        if (x < minX) minX = x;
                        if (x > maxX) maxX = x;
                        if (y < minY) minY = y;
                        if (y > maxY) maxY = y;
                        found = true;
                    }
                }
            }

            if (!found) {
                // If nothing drawn, analyze whole image
                minX = 0; minY = 0; maxX = w; maxY = h;
            } else {
                // Add padding
                const pad = 10;
                minX = Math.max(0, minX - pad);
                minY = Math.max(0, minY - pad);
                maxX = Math.min(w, maxX + pad);
                maxY = Math.min(h, maxY + pad);
            }

            // Create crop canvas
            const cropCanvas = document.createElement('canvas');
            cropCanvas.width = maxX - minX;
            cropCanvas.height = maxY - minY;
            const cropCtx = cropCanvas.getContext('2d');

            if (cropCtx) {
                // Draw the ORIGINAL image, but clipped to the rect
                cropCtx.drawImage(img, minX, minY, cropCanvas.width, cropCanvas.height, 0, 0, cropCanvas.width, cropCanvas.height);
                const croppedBase64 = cropCanvas.toDataURL('image/jpeg');

                const result = await visionService.analyzeImage(croppedBase64);
                setVisionResult(result);
                if (result.success) {
                    await checkAndPromptMissingEntities(result);
                } else {
                    addMessage('assistant', 'Seçili alandan veri çıkaramadım.');
                }
            }

        } catch (err) {
            console.error('ROI Error:', err);
            addMessage('assistant', 'Analiz hatası.');
        } finally {
            setIsProcessing(false);
        }
    };

    /**
     * Smart Entity Verification
     * Checks if extracted supplier/products exist in the DB
     */
    const checkAndPromptMissingEntities = async (result: any) => {
        // 1. Check Supplier
        if (result.supplier) {
            const suppliers = await supplierAPI.search(result.supplier);
            const exists = suppliers.length > 0;

            if (!exists) {
                // Determine missing name for friendly message
                const missingName = result.supplier;

                addMessage('assistant', `"${missingName}" tedarikçisini sistemde bulamadım.Eklemek ister misiniz ? `, 'action_verification', undefined, {
                    type: 'missing_supplier',
                    name: missingName,
                    data: result // Pass full result to resume after addition
                });
                return; // Stop flow to wait for user decision
            }
        }

        // If all verified (or skipped), proceed to normal flow
        addMessage('assistant', `Resmi analiz ettim.İçerisinde ${result.items.length} kalem buldum.Ne yapmak istersiniz ? `, 'action', undefined, result);
        setShowVisionModal(true);
    };

    const handleAddMissingEntity = async (type: string, name: string) => {
        addMessage('assistant', `${name} sisteme ekleniyor...`);
        // Simulate quick add (in real app, show modal or form)
        // Here we just mock the addition and continue
        try {
            if (type === 'missing_supplier') {
                await supplierAPI.create({
                    code: 'TED-' + Math.floor(Math.random() * 10000),
                    name: name,
                    phone: '',
                    email: '',
                    address: '',
                    city: '',
                    is_active: true
                } as any);
                addMessage('assistant', `✅ ${name} başarıyla eklendi.İşleme devam ediliyor...`);

                // Resume flow
                if (visionResult) {
                    addMessage('assistant', `Resmi analiz ettim.İçerisinde ${visionResult.items.length} kalem buldum.Ne yapmak istersiniz ? `, 'action', undefined, visionResult);
                    setShowVisionModal(true);
                }
            }
        } catch (err) {
            addMessage('assistant', 'Ekleme sırasında hata oluştu.');
        }
    };

    const handleCreateInvoice = (type: string) => {
        if (!visionResult) return;
        setShowVisionModal(false);
        addMessage('assistant', `${type} oluşturuluyor...`);
        const path = type === 'Alış Faturası' ? '/purchase-invoice' : '/sales-invoice';
        routeCommand({
            transcript: 'image_upload',
            intent: 'create_invoice',
            action: 'navigate',
            parameters: {},
            response_text: '',
            response_audio: '',
            success: true,
            navigation_path: path,
            form_data: {
                items: visionResult.items,
                supplier_name: visionResult.supplier,
                customer_name: visionResult.customer,
                total_amount: visionResult.totalAmount,
                notes: 'Vision OCR ile otomatik oluşturuldu.'
            }
        });
        setTimeout(() => setIsOpen(false), 1500);
    };

    if (drawingImage) {
        return (
            <div className="fixed bottom-6 right-6 w-[420px] h-[600px] bg-slate-900 rounded-3xl shadow-2xl overflow-hidden border border-slate-700 z-50 flex flex-col animate-in slide-in-from-bottom-5">
                <div className="p-4 bg-slate-800 text-white flex justify-between items-center">
                    <span className="font-bold flex items-center gap-2"><PenTool className="w-4 h-4" /> Alan Seçimi</span>
                    <button onClick={() => setDrawingImage(null)} className="p-1 hover:bg-white/10 rounded-full"><X className="w-5 h-5" /></button>
                </div>
                <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden touch-none">
                    {/* Image & Canvas Stack */}
                    <div className="relative">
                        <img src={drawingImage} alt="Reference" className="max-w-full max-h-full pointer-events-none opacity-80" />
                        <canvas
                            ref={canvasRef}
                            className="absolute top-0 left-0 w-full h-full cursor-crosshair touch-none"
                            onMouseDown={startDrawing}
                            onMouseMove={draw}
                            onMouseUp={stopDrawing}
                            onMouseLeave={stopDrawing}
                            onTouchStart={startDrawing}
                            onTouchMove={draw}
                            onTouchEnd={stopDrawing}
                        // Important: Set width/height to match image natural size after load logic
                        // For simplicity, we assume generic fit. JS effect below handles sizing.
                        />
                    </div>
                </div>
                <div className="p-4 bg-slate-800 flex justify-between gap-4">
                    <p className="text-xs text-slate-400 self-center">Okunacak alanı sarı kalemle çizin.</p>
                    <button
                        onClick={analyzeSelection}
                        className="flex items-center gap-2 px-4 py-2 bg-yellow-500 text-black font-bold rounded-xl hover:bg-yellow-400 transition-colors"
                    >
                        <Crop className="w-4 h-4" /> Kırp ve Oku
                    </button>
                </div>
                {/* Canvas Sizer Effect */}
                <CanvasResizer imageSrc={drawingImage} canvasRef={canvasRef} />
            </div>
        );
    }

    if (hideFloatingButton) return null;

    return (
        <button
            onClick={() => setIsOpen(true)}
            className="fixed bottom-6 right-6 p-4 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full shadow-2xl hover:scale-110 transition-transform z-50 group"
            title="Sesli Asistan (Ctrl+Shift+V)"
        >
            <Mic className="w-6 h-6 text-white" />
            <span className="absolute right-full mr-4 top-1/2 -translate-y-1/2 px-3 py-1 bg-white text-blue-600 text-sm font-bold rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                Sesli Asistan (Ctrl+Shift+V)
            </span>
        </button>
    );

    return (
        <div className="fixed bottom-6 right-6 w-[380px] h-[550px] bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100 z-50 flex flex-col animate-in slide-in-from-bottom-5 font-sans">
            {/* Header */}
            <div className="px-4 py-3 bg-white border-b border-gray-100 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-blue-50 rounded-lg">
                        <Sparkles className="w-4 h-4 text-blue-600" />
                    </div>
                    <span className="font-semibold text-gray-800">Asistan</span>
                </div>
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => setShowHistory(!showHistory)}
                        className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-md transition-colors"
                        title="Geçmiş"
                    >
                        <History className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => {
                            const newMuteStatus = !isMuted;
                            setIsMuted(newMuteStatus);
                            localStorage.setItem('voice_assistant_muted', String(newMuteStatus));
                        }}
                        className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-md transition-colors"
                    >
                        {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                    </button>
                    <button
                        onClick={() => {
                            setIsOpen(false);
                            setMessages([]);
                        }}
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Platform Indicator (Simplified) */}
            {isVoiceAvailable && (
                <div className="px-4 py-1.5 bg-gray-50/50 flex items-center justify-between text-[10px] text-gray-400">
                    <div className="flex items-center gap-1.5">
                        {providerName === VoiceServiceProvider.TAURI_WHISPER ? <Monitor className="w-3 h-3" /> :
                            providerName === VoiceServiceProvider.CAPACITOR ? <Smartphone className="w-3 h-3" /> :
                                <Globe className="w-3 h-3" />}
                        <span>{providerName === VoiceServiceProvider.TAURI_WHISPER ? 'Whisper AI' : 'Web Modu'}</span>
                    </div>
                    <span className="text-green-500 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                        Aktif
                    </span>
                </div>
            )}

            {!isVoiceAvailable && (
                <div className="px-4 py-2 bg-yellow-50 border-b border-yellow-100">
                    <p className="text-xs text-yellow-600">⚠️ Sesli asistan bu platformda desteklenmiyor</p>
                </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 bg-gray-50/30">
                {error && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                        <p className="text-sm text-red-600">{error}</p>
                    </div>
                )}

                {showHistory && commandHistory.length > 0 && (
                    <div className="p-4 border-b bg-slate-50">
                        <h4 className="text-xs font-bold text-slate-600 uppercase mb-2">Son Komutlar</h4>
                        <div className="space-y-1 max-h-32 overflow-y-auto">
                            {commandHistory.slice(0, 5).map((cmd, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => executeTextCommand(cmd)}
                                    className="w-full text-left px-3 py-1.5 text-sm text-slate-700 hover:bg-white rounded-lg transition-colors"
                                >
                                    {cmd}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {showSuggestions && (
                    <div className="p-4 border-b bg-blue-50">
                        <h4 className="text-xs font-bold text-blue-600 uppercase mb-2">Popüler Komutlar</h4>
                        <div className="space-y-1">
                            {popularCommands.slice(0, 4).map((cmd, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => executeTextCommand(cmd)}
                                    className="w-full text-left px-3 py-1.5 text-sm text-blue-700 hover:bg-blue-100 rounded-lg transition-colors flex items-center gap-2"
                                >
                                    <Lightbulb className="w-3 h-3" />
                                    {cmd}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {messages.length === 0 && !showHistory && !showSuggestions && (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 text-center">
                        <MessageSquare className="w-12 h-12 opacity-20 mb-2" />
                        <p>Merhaba! Size nasıl yardımcı olabilirim?</p>
                        <p className="text-xs mt-2">Örnek: "Satış faturası aç" veya "Ürünleri göster"</p>
                    </div>
                )}
                {messages.map((msg) => (
                    <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} `}>
                        <div className={`max - w - [85 %] p - 3 rounded - 2xl ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-white text-slate-800 shadow-sm border rounded-tl-none'
                            } `}>
                            {msg.type === 'image' && msg.image && (
                                <img src={msg.image} alt="Uploaded" className="w-full rounded-lg mb-2 max-h-48 object-cover" />
                            )}
                            <p className="text-sm whitespace-pre-line">{msg.content}</p>
                            {msg.type === 'action' && msg.data && msg.role === 'assistant' && (
                                <div className="mt-3 pt-3 border-t border-slate-100 flex gap-2 overflow-x-auto">
                                    <button
                                        onClick={() => handleCreateInvoice('Alış Faturası')}
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-xs font-bold hover:bg-blue-100 whitespace-nowrap"
                                    >
                                        <ShoppingCart className="w-3.5 h-3.5" /> Alış Faturası
                                    </button>
                                    <button
                                        onClick={() => handleCreateInvoice('Satış Faturası')}
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 text-green-600 rounded-lg text-xs font-bold hover:bg-green-100 whitespace-nowrap"
                                    >
                                        <FilePlus className="w-3.5 h-3.5" /> Satış Faturası
                                    </button>
                                </div>
                            )}
                            {/* ROI Button Helper */}
                            {msg.type === 'image' && msg.image && (
                                <button
                                    onClick={() => setDrawingImage(msg.image || null)}
                                    className="absolute bottom-2 right-2 p-1.5 bg-black/50 text-white rounded-lg hover:bg-black/70 backdrop-blur-sm transition-colors"
                                    title="Seçili Alanı Oku (ROI)"
                                >
                                    <PenTool className="w-3.5 h-3.5" />
                                </button>
                            )}
                            {msg.type === 'action_verification' && msg.data && msg.role === 'assistant' && (
                                <div className="mt-3 pt-3 border-t border-slate-100 flex gap-2 overflow-x-auto">
                                    <button
                                        onClick={() => handleAddMissingEntity(msg.data.type, msg.data.name)}
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-xs font-bold hover:bg-blue-100 whitespace-nowrap"
                                    >
                                        <UserPlus className="w-3.5 h-3.5" /> Evet, Ekle
                                    </button>
                                    <button
                                        onClick={() => {
                                            // Skip adding
                                            if (visionResult) {
                                                addMessage('assistant', `Resmi analiz ettim. İçerisinde ${visionResult.items.length} kalem buldum. Ne yapmak istersiniz?`, 'action', undefined, visionResult);
                                                setShowVisionModal(true);
                                            }
                                        }}
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 text-slate-600 rounded-lg text-xs font-bold hover:bg-slate-100 whitespace-nowrap"
                                    >
                                        <X className="w-3.5 h-3.5" /> Hayır, Devam Et
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-3 border-t border-gray-100 bg-white shrink-0">
                {error && <p className="text-xs text-red-500 mb-2">{error}</p>}

                {listening && (
                    <div className="flex items-end justify-center gap-1 h-8 mb-3">
                        {[...Array(8)].map((_, i) => (
                            <div key={i} className="w-1 bg-blue-500 rounded-full animate-pulse" style={{ height: `${20 + Math.random() * 60}% ` }} />
                        ))}
                    </div>
                )}

                <div className="flex items-center gap-3">
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors"
                        title="Resim Yükle"
                    >
                        <ImageIcon className="w-5 h-5" />
                    </button>
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleImageUpload}
                        accept="image/*"
                        className="hidden"
                    />

                    <div className="flex-1 relative">
                        <input
                            type="text"
                            value={inputText}
                            onChange={(e) => setInputText(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && executeTextCommand(inputText)}
                            placeholder="Mesajınızı yazın..."
                            className="w-full pl-4 pr-12 py-2.5 bg-slate-100 border-none rounded-2xl text-sm focus:ring-2 focus:ring-blue-500 transition-all"
                        />
                        <button
                            onClick={() => executeTextCommand(inputText)}
                            disabled={!inputText.trim() || isProcessing}
                            className={`absolute right-2 top-1.5 p-1.5 rounded-xl transition-all ${inputText.trim() ? 'text-blue-600 hover:bg-blue-50' : 'text-slate-300'} `}
                        >
                            <Send className="w-4 h-4" />
                        </button>
                    </div>

                    <button
                        onClick={listening ? stopListening : startListening}
                        disabled={isProcessing}
                        className={`p-3 rounded-2xl transition-all ${listening ? 'bg-red-500' : 'bg-blue-600'} text-white shadow-lg relative`}
                    >
                        {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Mic className="w-5 h-5" />}
                    </button>
                </div>
            </div>
        </div>
    );
}
// Helper Component to sync canvas size with image
function CanvasResizer({ imageSrc, canvasRef }: { imageSrc: string, canvasRef: React.RefObject<HTMLCanvasElement | null> }) {
    useEffect(() => {
        const img = new Image();
        img.src = imageSrc;
        img.onload = () => {
            if (canvasRef.current) {
                // Set internal resolution to match image
                canvasRef.current.width = img.width;
                canvasRef.current.height = img.height;
            }
        };
    }, [imageSrc, canvasRef]);
    return null;
}

