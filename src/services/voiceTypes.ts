// src/services/voiceTypes.ts

export enum VoiceServiceProvider {
    TAURI_WHISPER = 'tauri_whisper',      // Desktop: Tauri + OpenAI Whisper
    WEB_SPEECH_API = 'web_speech_api',    // Web/Mobile: Browser Web Speech API
    CAPACITOR = 'capacitor',              // Mobile: Capacitor plugin
}

export interface VoiceCommandResult {
    transcript: string;
    intent: string;
    action: string;
    parameters: Record<string, string>;
    response_text: string;
    response_audio: string;
    success: boolean;
    navigation_path?: string;
    pub_intent?: string; // Original intention if modified by context
    form_data?: Record<string, any>;
}

export interface VoiceContext {
    lastIntent: string;
    lastAction: string;
    lastEntities: Record<string, string>;
    lastTarget?: string; // 'customer', 'product', etc.
    timestamp: number;
}
