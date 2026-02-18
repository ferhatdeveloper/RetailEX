// src/services/voiceService.ts
// Platform-agnostic voice service that works on web, mobile, and desktop

import { invoke } from '@tauri-apps/api/tauri';
import { findRouteCommand } from './routeCommandGenerator';
import { SupportedLanguage } from '../config/voiceCommandDefinitions';
import { VoiceCommandResult, VoiceContext, VoiceServiceProvider } from './voiceTypes';

export class VoiceService {
    private provider: VoiceServiceProvider;
    private recognition: any = null;
    private language: string = 'tr-TR';
    private lastTauriResult: VoiceCommandResult | null = null;
    private context: VoiceContext | null = null;
    private ttsEnabled: boolean = true;

    constructor() {
        this.provider = this.detectProvider();
        this.initializeProvider();
        (window as any).voiceService = this;
    }

    /**
     * Detect which voice service provider to use
     */
    private detectProvider(): VoiceServiceProvider {
        // Check if running in Tauri
        if (window.__TAURI__) {
            return VoiceServiceProvider.TAURI_WHISPER;
        }

        // Check if running in Capacitor (mobile)
        if ((window as any).Capacitor) {
            return VoiceServiceProvider.CAPACITOR;
        }

        // Default to Web Speech API (browser)
        return VoiceServiceProvider.WEB_SPEECH_API;
    }

    /**
     * Initialize the selected provider
     */
    private initializeProvider(): void {
        if (this.provider === VoiceServiceProvider.WEB_SPEECH_API) {
            this.initializeWebSpeechAPI();
        }
    }

    /**
     * Initialize Web Speech API for browser/mobile
     */
    private initializeWebSpeechAPI(): void {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

        if (!SpeechRecognition) {
            console.warn('Web Speech API not supported in this browser');
            return;
        }

        this.recognition = new SpeechRecognition();
        this.recognition.continuous = false;
        this.recognition.interimResults = false;
        this.recognition.lang = this.language;
    }

    /**
     * Start listening for voice input
     */
    async startListening(): Promise<string> {
        switch (this.provider) {
            case VoiceServiceProvider.WEB_SPEECH_API:
                return this.listenWithWebSpeechAPI();

            case VoiceServiceProvider.TAURI_WHISPER:
                // For Tauri, we'll use MediaRecorder and send to backend
                return this.listenWithMediaRecorder();

            case VoiceServiceProvider.CAPACITOR:
                return this.listenWithCapacitor();

            default:
                throw new Error('No voice service provider available');
        }
    }

    /**
     * Listen using Web Speech API (browser/mobile)
     */
    private listenWithWebSpeechAPI(): Promise<string> {
        return new Promise((resolve, reject) => {
            if (!this.recognition) {
                reject(new Error('Web Speech API başlatılamadı. Lütfen tarayıcınızı kontrol edin.'));
                return;
            }

            let hasResult = false;

            this.recognition.onresult = (event: any) => {
                hasResult = true;
                const transcript = event.results[0][0].transcript;
                console.log('🎤 Ses tanındı:', transcript);
                resolve(transcript);
            };

            this.recognition.onerror = (event: any) => {
                console.error('🔴 Ses tanıma hatası:', event.error);

                // Kullanıcı dostu hata mesajları
                let errorMessage = '';
                switch (event.error) {
                    case 'no-speech':
                        errorMessage = 'Ses algılanamadı. Lütfen daha yüksek sesle konuşun ve tekrar deneyin.';
                        break;
                    case 'audio-capture':
                        errorMessage = 'Mikrofon erişimi sağlanamadı. Lütfen mikrofon bağlantınızı kontrol edin.';
                        break;
                    case 'not-allowed':
                        errorMessage = 'Mikrofon izni reddedildi. Lütfen tarayıcı ayarlarından mikrofon iznini verin.';
                        break;
                    case 'network':
                        errorMessage = 'İnternet bağlantısı gerekli. Lütfen bağlantınızı kontrol edin.';
                        break;
                    case 'aborted':
                        errorMessage = 'Ses tanıma iptal edildi.';
                        break;
                    case 'service-not-allowed':
                        errorMessage = 'Ses tanıma servisi bu sayfada kullanılamıyor. HTTPS bağlantısı gerekebilir.';
                        break;
                    default:
                        errorMessage = `Ses tanıma hatası: ${event.error}`;
                }

                reject(new Error(errorMessage));
            };

            this.recognition.onend = () => {
                if (!hasResult) {
                    console.warn('⚠️ Ses tanıma bitti ama sonuç yok');
                }
            };

            try {
                this.recognition.start();
                console.log('🎤 Ses tanıma başlatıldı (Web Speech API)');
            } catch (err: any) {
                console.error('🔴 Ses tanıma başlatma hatası:', err);
                reject(new Error('Ses tanıma başlatılamadı. Lütfen tekrar deneyin.'));
            }
        });
    }

    /**
     * Listen using MediaRecorder (for Tauri/desktop)
     */
    private async listenWithMediaRecorder(): Promise<string> {
        return new Promise(async (resolve, reject) => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true,
                        sampleRate: 44100, // Standard quality
                        channelCount: 1    // Mono is better for voice commands
                    }
                });
                const mediaRecorder = new MediaRecorder(stream);
                const audioChunks: Blob[] = [];

                mediaRecorder.ondataavailable = (event) => {
                    audioChunks.push(event.data);
                };

                mediaRecorder.onstop = async () => {
                    const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
                    const reader = new FileReader();

                    reader.onloadend = async () => {
                        const base64 = (reader.result as string).split(',')[1];
                        try {
                            const result: VoiceCommandResult = await invoke('process_voice_command', {
                                audioBase64: base64,
                                language: this.language
                            });
                            this.lastTauriResult = result;
                            resolve(result.transcript);
                        } catch (err) {
                            reject(err);
                        }
                    };

                    reader.readAsDataURL(audioBlob);
                    stream.getTracks().forEach(track => track.stop());
                };

                mediaRecorder.start();

                // Auto-stop after 10 seconds
                setTimeout(() => {
                    if (mediaRecorder.state === 'recording') {
                        mediaRecorder.stop();
                    }
                }, 10000);

                // Return a function to manually stop
                (window as any).__stopRecording = () => mediaRecorder.stop();
            } catch (err) {
                reject(err);
            }
        });
    }

    /**
     * Listen using Capacitor (mobile)
     */
    private async listenWithCapacitor(): Promise<string> {
        // Placeholder for Capacitor implementation
        // You would use @capacitor-community/speech-recognition plugin
        throw new Error('Capacitor voice recognition not yet implemented');
    }

    /**
     * Stop listening
     */
    stopListening(): void {
        switch (this.provider) {
            case VoiceServiceProvider.WEB_SPEECH_API:
                if (this.recognition) {
                    this.recognition.stop();
                }
                break;

            case VoiceServiceProvider.TAURI_WHISPER:
                if ((window as any).__stopRecording) {
                    (window as any).__stopRecording();
                }
                break;
        }
    }

    /**
     * Process voice command and get result
     */
    async processCommand(transcript: string): Promise<VoiceCommandResult> {
        let result: VoiceCommandResult;

        // For Tauri, if we already have the result from the listen call, use it
        if (this.provider === VoiceServiceProvider.TAURI_WHISPER && this.lastTauriResult) {
            result = this.lastTauriResult;
            this.lastTauriResult = null; // Clear after use
        } else {
            // For Web Speech API and Capacitor, or if Tauri result missing, process locally
            result = await this.processCommandLocally(transcript);
        }

        // GLOBAL FALLBACK: If intent is still unknown (from Rust or Local), try dynamic routes
        if (result.intent === 'unknown') {
            const langCode = (this.language.split('-')[0] as SupportedLanguage) || 'tr';
            const matchedRoute = findRouteCommand(transcript, langCode);

            if (matchedRoute) {
                console.log('📝 Dynamic Route Matched (Global Fallback):', matchedRoute.intent);
                result.intent = matchedRoute.intent;
                result.action = 'navigate';
                result.navigation_path = (matchedRoute as any)._route;
                result.success = true;
                // Generate a simple response text if missing
                result.response_text = matchedRoute.description[langCode] || matchedRoute.description['en'];
            }
        }

        // Apply context-aware logic
        result = this.applyContext(result);

        // Update memory
        this.updateContext(result);

        return result;
    }

    /**
     * Update contextual memory
     */
    private updateContext(result: VoiceCommandResult): void {
        this.context = {
            lastIntent: result.intent,
            lastAction: result.action,
            lastEntities: { ...result.parameters },
            lastTarget: result.intent.includes('product') ? 'product' :
                result.intent.includes('customer') ? 'customer' : undefined,
            timestamp: Date.now()
        };
    }

    /**
     * Apply context to the current result (e.g., resolving 'it' or 'him')
     */
    private applyContext(result: VoiceCommandResult): VoiceCommandResult {
        // If context is old (more than 2 mins), ignore it
        if (!this.context || (Date.now() - this.context.timestamp > 120000)) {
            return result;
        }

        const transcript = result.transcript.toLowerCase();

        // Handle "it", "him", "her" (Turkish: "o", "onu", "onun", "ona")
        const pronouns = ['o', 'onu', 'onun', 'ona', 'fiyatı', 'fiyati', 'bilgileri'];
        const hasPronoun = pronouns.some(p => transcript.includes(p));

        if (hasPronoun && result.intent === 'unknown') {
            // Try to infer intent based on previous target
            if (this.context.lastTarget === 'product' && transcript.includes('fiyat')) {
                result.intent = 'query_price';
                result.action = 'query';
                result.parameters = { ...this.context.lastEntities, ...result.parameters };
                result.response_text = this.formatResponse(result.intent, result.parameters, true);
                result.success = true;
            } else if (this.context.lastTarget === 'customer' && (transcript.includes('ara') || transcript.includes('bilgi'))) {
                result.intent = 'search_customer';
                result.action = 'query';
                result.parameters = { ...this.context.lastEntities, ...result.parameters };
                result.response_text = this.formatResponse(result.intent, result.parameters, true);
                result.success = true;
            }
        }

        return result;
    }

    /**
     * Speak text using SpeechSynthesis
     */
    speak(text: string): void {
        if (!this.ttsEnabled || !text) return;

        // Stop any current speech
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = this.language;
        utterance.rate = 1.0;
        utterance.pitch = 1.0;

        window.speechSynthesis.speak(utterance);
    }

    setMute(mute: boolean): void {
        this.ttsEnabled = !mute;
        if (mute) window.speechSynthesis.cancel();
    }

    /**
     * Process command locally (client-side intent parsing)
     */
    private async processCommandLocally(transcript: string): Promise<VoiceCommandResult> {
        let { intent, action, parameters } = this.parseIntent(transcript);
        let navigation_path = this.getNavigationPath(intent);

        // Dynamic Route Fallback: Check if it matches any screen in the menu
        if (intent === 'unknown') {
            const langCode = (this.language.split('-')[0] as SupportedLanguage) || 'tr';
            const matchedRoute = findRouteCommand(transcript, langCode);

            if (matchedRoute) {
                console.log('📝 Dynamic Route Matched:', matchedRoute.intent);
                intent = matchedRoute.intent;
                action = 'navigate';

                // Extract path from the custom property we added in generator
                navigation_path = (matchedRoute as any)._route;
            }
        }

        const form_data = this.createFormData(intent, parameters);
        const success = intent !== 'unknown';
        const response_text = this.formatResponse(intent, parameters, success);

        return {
            transcript,
            intent,
            action,
            parameters,
            response_text,
            response_audio: '',
            success,
            navigation_path,
            form_data,
        };
    }

    /**
     * Parse intent from transcript (client-side)
     */
    private parseIntent(transcript: string): { intent: string; action: string; parameters: Record<string, string> } {
        const lower = transcript.toLowerCase();
        let intent = 'unknown';
        let action = 'unknown';
        const parameters: Record<string, string> = {};

        // Navigation patterns
        if (/(?:(?:aç|göster|git|getir).*(satış|satiş).*(fatura|invoice))|(?:(satış|satiş).*(fatura|invoice).*(aç|göster|git|getir))/.test(lower)) {
            intent = 'open_sales_invoice';
            action = 'navigate';
        } else if (/(?:(?:aç|göster|git|getir).*(alış|aliş|purchase).*(fatura|invoice))|(?:(alış|aliş|purchase).*(fatura|invoice).*(aç|göster|git|getir))/.test(lower)) {
            intent = 'open_purchase_invoice';
            action = 'navigate';
        } else if (/(?:(malzeme|ürün|urun|product)(leri|ları)?.*?(aç|göster|listele|list))|(?:(aç|göster|listele|list).*(malzeme|ürün|urun|product)(leri|ları)?)/.test(lower)) {
            intent = 'open_products';
            action = 'navigate';
        } else if (/(?:(müşteri|musteri|customer|cari)(leri|ları)?.*?(aç|göster|listele|ekran))|(?:(aç|göster|listele|ekran).*(müşteri|musteri|customer|cari)(leri|ları)?)/.test(lower)) {
            intent = 'open_customers';
            action = 'navigate';
        } else if (/(?:(stok|stock|envanter)(leri|ları)?.*?(aç|göster|yönetim|management))|(?:(aç|göster|yönetim|management).*(stok|stock|envanter)(leri|ları)?)/.test(lower)) {
            intent = 'open_stock';
            action = 'navigate';
        } else if (/(?:(rapor|report)(lar|leri)?.*?(aç|göster))|(?:(aç|göster).*(rapor|report)(lar|leri)?)/.test(lower)) {
            intent = 'open_reports';
            action = 'navigate';
        } else if (/(?:(dashboard|panel|ana.*?ekran).*?(aç|göster|git))|(?:(aç|göster|git).*(dashboard|panel|ana.*?ekran))/.test(lower)) {
            intent = 'open_dashboard';
            action = 'navigate';
        }
        // Search patterns
        if (/(ara|bul|search|biger|lêgerîn|ibhash).*(müşteri|musteri|customer|cari|krîyar|emîl)/i.test(lower)) {
            intent = 'search_customer';
            action = 'query';
            const match = transcript.match(/(ara|bul|search|biger|lêgerîn|ibhash).*(müşteri|musteri|customer|cari|krîyar|emîl)\s+(.+)/i);
            if (match) parameters.name = match[3].trim();
        } else if (/(ara|bul|search|biger|lêgerîn|ibhash).*(ürün|urun|product|malzeme|kelûpel|muntec)/i.test(lower)) {
            intent = 'search_product';
            action = 'query';
            const match = transcript.match(/(ara|bul|search|biger|lêgerîn|ibhash).*(ürün|urun|product|malzeme|kelûpel|muntec)\s+(.+)/i);
            if (match) parameters.name = match[3].trim();
        } else if (/.*?(stok|stock|envanter|maxzen).*(var.*?mı|kontrol|check|durumu|heye|mevcud)/i.test(lower)) {
            intent = 'check_stock';
            action = 'query';
            const match = transcript.match(/(.+?)\s+(?:stok|var|heye|mevcud)/i);
            if (match) parameters.product = match[1].trim();
        } else if (/(bugün|today|bugünkü|îro|alyawm).*(satış|satiş|sales|frotin|mabîat)/i.test(lower)) {
            intent = 'show_today_sales';
            action = 'query';
        }

        // Create patterns
        else if (/yeni.*(ürün|urun|product|malzeme).*(ekle|add|kaydet|save)/.test(lower)) {
            intent = 'add_product';
            action = 'create';
            this.extractProductParams(transcript, parameters);
        } else if (/yeni.*(müşteri|musteri|customer|cari).*(ekle|add|kaydet|save)/.test(lower)) {
            intent = 'add_customer';
            action = 'create';
            this.extractCustomerParams(transcript, parameters);
        }

        return { intent, action, parameters };
    }

    private extractProductParams(transcript: string, params: Record<string, string>): void {
        const nameMatch = transcript.match(/ekle:?\s*(.+?)(?:,|fiyat|$)/i);
        if (nameMatch) params.name = nameMatch[1].trim();

        const priceMatch = transcript.match(/fiyat\s*(\d+(?:[.,]\d+)?)\s*(tl|lira|₺)?/i);
        if (priceMatch) params.price = priceMatch[1].replace(',', '.');

        const stockMatch = transcript.match(/(?:stok|adet)\s*(\d+)/i);
        if (stockMatch) params.stock = stockMatch[1];
    }

    private extractCustomerParams(transcript: string, params: Record<string, string>): void {
        const nameMatch = transcript.match(/ekle:?\s*(.+?)(?:,|telefon|$)/i);
        if (nameMatch) params.name = nameMatch[1].trim();

        const phoneMatch = transcript.match(/telefon\s*([\d\s\-]+)/i);
        if (phoneMatch) params.phone = phoneMatch[1].trim();
    }

    private getNavigationPath(intent: string): string | undefined {
        const paths: Record<string, string> = {
            open_sales_invoice: '/sales-invoice',
            open_purchase_invoice: '/purchase-invoice',
            open_products: '/products',
            open_customers: '/customers',
            open_stock: '/stock',
            open_reports: '/reports',
            open_dashboard: '/dashboard',
            add_product: '/products/new',
            add_customer: '/customers/new',
        };
        return paths[intent];
    }

    private createFormData(intent: string, params: Record<string, string>): Record<string, any> | undefined {
        if (intent === 'add_product' && Object.keys(params).length > 0) {
            const data: any = {};
            if (params.name) data.name = params.name;
            if (params.price) data.price = parseFloat(params.price);
            if (params.stock) data.stock = parseInt(params.stock);
            return data;
        }
        if (intent === 'add_customer' && Object.keys(params).length > 0) {
            const data: any = {};
            if (params.name) data.name = params.name;
            if (params.phone) data.phone = params.phone;
            return data;
        }
        if ((intent === 'search_customer' || intent === 'search_product') && params.name) {
            return { searchQuery: params.name };
        }
        return undefined;
    }

    private formatResponse(intent: string, params: Record<string, string>, success: boolean): string {
        if (!success) return 'Komutu anlayamadım. Lütfen tekrar deneyin.';

        const responses: Record<string, string> = {
            open_sales_invoice: 'Satış faturası ekranı açılıyor...',
            open_purchase_invoice: 'Alış faturası ekranı açılıyor...',
            open_products: 'Ürünler listesi açılıyor...',
            open_customers: 'Müşteri listesi açılıyor...',
            open_stock: 'Stok yönetimi ekranı açılıyor...',
            open_reports: 'Raporlar ekranı açılıyor...',
            open_dashboard: 'Ana panel açılıyor...',
            show_today_sales: 'Bugünkü satışlar gösteriliyor...',
        };

        if (intent === 'search_customer' && params.name) {
            return `'${params.name}' müşterisi aranıyor...`;
        }
        if (intent === 'search_product' && params.name) {
            return `'${params.name}' ürünü aranıyor...`;
        }
        if (intent === 'add_product') {
            return params.name ? `Yeni ürün ekleniyor: ${params.name}...` : 'Yeni ürün ekleme formu açılıyor...';
        }
        if (intent === 'add_customer') {
            return params.name ? `Yeni müşteri ekleniyor: ${params.name}...` : 'Yeni müşteri ekleme formu açılıyor...';
        }

        return responses[intent] || 'İşlem gerçekleştiriliyor...';
    }

    /**
     * Check if voice service is available
     */
    isAvailable(): boolean {
        switch (this.provider) {
            case VoiceServiceProvider.WEB_SPEECH_API:
                return !!(window as any).SpeechRecognition || !!(window as any).webkitSpeechRecognition;

            case VoiceServiceProvider.TAURI_WHISPER:
                return !!window.__TAURI__;

            case VoiceServiceProvider.CAPACITOR:
                return !!(window as any).Capacitor;

            default:
                return false;
        }
    }

    /**
     * Get current provider name
     */
    getProviderName(): string {
        return this.provider;
    }

    /**
     * Set language
     */
    setLanguage(lang: string): void {
        this.language = lang;
        if (this.recognition) {
            this.recognition.lang = lang;
        }
    }
}

// Singleton instance
let voiceServiceInstance: VoiceService | null = null;

export function getVoiceService(): VoiceService {
    if (!voiceServiceInstance) {
        voiceServiceInstance = new VoiceService();
    }
    return voiceServiceInstance;
}

