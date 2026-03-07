// src/services/voiceService.ts
// Platform-agnostic voice service that works on web, mobile, and desktop

const isTauri = typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;
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
        if (isTauri) {
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
                reject(new Error('Web Speech API baï¿½latï¿½lamadï¿½. Lï¿½tfen tarayï¿½cï¿½nï¿½zï¿½ kontrol edin.'));
                return;
            }

            let hasResult = false;

            this.recognition.onresult = (event: any) => {
                hasResult = true;
                const transcript = event.results[0][0].transcript;
                console.log('?? Ses tanï¿½ndï¿½:', transcript);
                resolve(transcript);
            };

            this.recognition.onerror = (event: any) => {
                console.error('?? Ses tanï¿½ma hatasï¿½:', event.error);

                // Kullanï¿½cï¿½ dostu hata mesajlarï¿½
                let errorMessage = '';
                switch (event.error) {
                    case 'no-speech':
                        errorMessage = 'Ses algï¿½lanamadï¿½. Lï¿½tfen daha yï¿½ksek sesle konuï¿½un ve tekrar deneyin.';
                        break;
                    case 'audio-capture':
                        errorMessage = 'Mikrofon eriï¿½imi saï¿½lanamadï¿½. Lï¿½tfen mikrofon baï¿½lantï¿½nï¿½zï¿½ kontrol edin.';
                        break;
                    case 'not-allowed':
                        errorMessage = 'Mikrofon izni reddedildi. Lï¿½tfen tarayï¿½cï¿½ ayarlarï¿½ndan mikrofon iznini verin.';
                        break;
                    case 'network':
                        errorMessage = 'ï¿½nternet baï¿½lantï¿½sï¿½ gerekli. Lï¿½tfen baï¿½lantï¿½nï¿½zï¿½ kontrol edin.';
                        break;
                    case 'aborted':
                        errorMessage = 'Ses tanï¿½ma iptal edildi.';
                        break;
                    case 'service-not-allowed':
                        errorMessage = 'Ses tanï¿½ma servisi bu sayfada kullanï¿½lamï¿½yor. HTTPS baï¿½lantï¿½sï¿½ gerekebilir.';
                        break;
                    default:
                        errorMessage = `Ses tanï¿½ma hatasï¿½: ${event.error}`;
                }

                reject(new Error(errorMessage));
            };

            this.recognition.onend = () => {
                if (!hasResult) {
                    console.warn('?? Ses tanï¿½ma bitti ama sonuï¿½ yok');
                }
            };

            try {
                this.recognition.start();
                console.log('?? Ses tanï¿½ma baï¿½latï¿½ldï¿½ (Web Speech API)');
            } catch (err: any) {
                console.error('?? Ses tanï¿½ma baï¿½latma hatasï¿½:', err);
                reject(new Error('Ses tanï¿½ma baï¿½latï¿½lamadï¿½. Lï¿½tfen tekrar deneyin.'));
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
                            if (isTauri) {
                                const { invoke } = await import('@tauri-apps/api/core');
                                const result: VoiceCommandResult = await invoke('process_voice_command', {
                                    audioBase64: base64,
                                    language: this.language
                                });
                                this.lastTauriResult = result;
                                resolve(result.transcript);
                            } else {
                                resolve('Web ses tanï¿½ma simï¿½lasyonu');
                            }
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
                console.log('?? Dynamic Route Matched (Global Fallback):', matchedRoute.intent);
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
        const pronouns = ['o', 'onu', 'onun', 'ona', 'fiyatï¿½', 'fiyati', 'bilgileri'];
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
                console.log('?? Dynamic Route Matched:', matchedRoute.intent);
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
        if (/(?:(?:aï¿½|gï¿½ster|git|getir).*(satï¿½ï¿½|satiï¿½).*(fatura|invoice))|(?:(satï¿½ï¿½|satiï¿½).*(fatura|invoice).*(aï¿½|gï¿½ster|git|getir))/.test(lower)) {
            intent = 'open_sales_invoice';
            action = 'navigate';
        } else if (/(?:(?:aï¿½|gï¿½ster|git|getir).*(alï¿½ï¿½|aliï¿½|purchase).*(fatura|invoice))|(?:(alï¿½ï¿½|aliï¿½|purchase).*(fatura|invoice).*(aï¿½|gï¿½ster|git|getir))/.test(lower)) {
            intent = 'open_purchase_invoice';
            action = 'navigate';
        } else if (/(?:(malzeme|ï¿½rï¿½n|urun|product)(leri|larï¿½)?.*?(aï¿½|gï¿½ster|listele|list))|(?:(aï¿½|gï¿½ster|listele|list).*(malzeme|ï¿½rï¿½n|urun|product)(leri|larï¿½)?)/.test(lower)) {
            intent = 'open_products';
            action = 'navigate';
        } else if (/(?:(mï¿½ï¿½teri|musteri|customer|cari)(leri|larï¿½)?.*?(aï¿½|gï¿½ster|listele|ekran))|(?:(aï¿½|gï¿½ster|listele|ekran).*(mï¿½ï¿½teri|musteri|customer|cari)(leri|larï¿½)?)/.test(lower)) {
            intent = 'open_customers';
            action = 'navigate';
        } else if (/(?:(stok|stock|envanter)(leri|larï¿½)?.*?(aï¿½|gï¿½ster|yï¿½netim|management))|(?:(aï¿½|gï¿½ster|yï¿½netim|management).*(stok|stock|envanter)(leri|larï¿½)?)/.test(lower)) {
            intent = 'open_stock';
            action = 'navigate';
        } else if (/(?:(rapor|report)(lar|leri)?.*?(aï¿½|gï¿½ster))|(?:(aï¿½|gï¿½ster).*(rapor|report)(lar|leri)?)/.test(lower)) {
            intent = 'open_reports';
            action = 'navigate';
        } else if (/(?:(dashboard|panel|ana.*?ekran).*?(aï¿½|gï¿½ster|git))|(?:(aï¿½|gï¿½ster|git).*(dashboard|panel|ana.*?ekran))/.test(lower)) {
            intent = 'open_dashboard';
            action = 'navigate';
        }
        // Search patterns
        if (/(ara|bul|search|biger|lï¿½gerï¿½n|ibhash).*(mï¿½ï¿½teri|musteri|customer|cari|krï¿½yar|emï¿½l)/i.test(lower)) {
            intent = 'search_customer';
            action = 'query';
            const match = transcript.match(/(ara|bul|search|biger|lï¿½gerï¿½n|ibhash).*(mï¿½ï¿½teri|musteri|customer|cari|krï¿½yar|emï¿½l)\s+(.+)/i);
            if (match) parameters.name = match[3].trim();
        } else if (/(ara|bul|search|biger|lï¿½gerï¿½n|ibhash).*(ï¿½rï¿½n|urun|product|malzeme|kelï¿½pel|muntec)/i.test(lower)) {
            intent = 'search_product';
            action = 'query';
            const match = transcript.match(/(ara|bul|search|biger|lï¿½gerï¿½n|ibhash).*(ï¿½rï¿½n|urun|product|malzeme|kelï¿½pel|muntec)\s+(.+)/i);
            if (match) parameters.name = match[3].trim();
        } else if (/.*?(stok|stock|envanter|maxzen).*(var.*?mï¿½|kontrol|check|durumu|heye|mevcud)/i.test(lower)) {
            intent = 'check_stock';
            action = 'query';
            const match = transcript.match(/(.+?)\s+(?:stok|var|heye|mevcud)/i);
            if (match) parameters.product = match[1].trim();
        } else if (/(bugï¿½n|today|bugï¿½nkï¿½|ï¿½ro|alyawm).*(satï¿½ï¿½|satiï¿½|sales|frotin|mabï¿½at)/i.test(lower)) {
            intent = 'show_today_sales';
            action = 'query';
        }

        // Create patterns
        else if (/yeni.*(ï¿½rï¿½n|urun|product|malzeme).*(ekle|add|kaydet|save)/.test(lower)) {
            intent = 'add_product';
            action = 'create';
            this.extractProductParams(transcript, parameters);
        } else if (/yeni.*(mï¿½ï¿½teri|musteri|customer|cari).*(ekle|add|kaydet|save)/.test(lower)) {
            intent = 'add_customer';
            action = 'create';
            this.extractCustomerParams(transcript, parameters);
        }

        return { intent, action, parameters };
    }

    private extractProductParams(transcript: string, params: Record<string, string>): void {
        const nameMatch = transcript.match(/ekle:?\s*(.+?)(?:,|fiyat|$)/i);
        if (nameMatch) params.name = nameMatch[1].trim();

        const priceMatch = transcript.match(/fiyat\s*(\d+(?:[.,]\d+)?)\s*(tl|lira)?/i);
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
        if (!success) return 'Komutu anlayamadï¿½m. Lï¿½tfen tekrar deneyin.';

        const responses: Record<string, string> = {
            open_sales_invoice: 'Satï¿½ï¿½ faturasï¿½ ekranï¿½ aï¿½ï¿½lï¿½yor...',
            open_purchase_invoice: 'Alï¿½ï¿½ faturasï¿½ ekranï¿½ aï¿½ï¿½lï¿½yor...',
            open_products: 'ï¿½rï¿½nler listesi aï¿½ï¿½lï¿½yor...',
            open_customers: 'Mï¿½ï¿½teri listesi aï¿½ï¿½lï¿½yor...',
            open_stock: 'Stok yï¿½netimi ekranï¿½ aï¿½ï¿½lï¿½yor...',
            open_reports: 'Raporlar ekranï¿½ aï¿½ï¿½lï¿½yor...',
            open_dashboard: 'Ana panel aï¿½ï¿½lï¿½yor...',
            show_today_sales: 'Bugï¿½nkï¿½ satï¿½ï¿½lar gï¿½steriliyor...',
        };

        if (intent === 'search_customer' && params.name) {
            return `'${params.name}' mï¿½ï¿½terisi aranï¿½yor...`;
        }
        if (intent === 'search_product' && params.name) {
            return `'${params.name}' ï¿½rï¿½nï¿½ aranï¿½yor...`;
        }
        if (intent === 'add_product') {
            return params.name ? `Yeni ï¿½rï¿½n ekleniyor: ${params.name}...` : 'Yeni ï¿½rï¿½n ekleme formu aï¿½ï¿½lï¿½yor...';
        }
        if (intent === 'add_customer') {
            return params.name ? `Yeni mï¿½ï¿½teri ekleniyor: ${params.name}...` : 'Yeni mï¿½ï¿½teri ekleme formu aï¿½ï¿½lï¿½yor...';
        }

        return responses[intent] || 'ï¿½ï¿½lem gerï¿½ekleï¿½tiriliyor...';
    }

    /**
     * Check if voice service is available
     */
    isAvailable(): boolean {
        switch (this.provider) {
            case VoiceServiceProvider.WEB_SPEECH_API:
                return !!(window as any).SpeechRecognition || !!(window as any).webkitSpeechRecognition;

            case VoiceServiceProvider.TAURI_WHISPER:
                return isTauri;

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




