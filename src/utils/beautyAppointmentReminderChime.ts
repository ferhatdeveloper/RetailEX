/**
 * Yakın güzellik hatırlatmaları (giriş toast’u vb.) için kısa bildirim sesi.
 * Aynı takvim gününde en fazla 3 kez çalar (localStorage); yoksa oturum belleği.
 * Tarayıcı ses politikası izin vermezse çalmaz ve kota artmaz.
 */
import { formatLocalYmd } from './dateLocal';

const LS_DAY = 'retailex_beauty_reminder_chime_day';
const LS_COUNT = 'retailex_beauty_reminder_chime_count';
const MAX_PLAYS_PER_DAY = 3;

let memoryPlayCount = 0;

function readQuota(): number {
    if (typeof window === 'undefined') return MAX_PLAYS_PER_DAY;
    const today = formatLocalYmd(new Date());
    try {
        if (window.localStorage) {
            const storedDay = String(window.localStorage.getItem(LS_DAY) ?? '').trim();
            let count = Math.max(0, Math.round(Number(window.localStorage.getItem(LS_COUNT) || '0')));
            if (storedDay !== today) {
                count = 0;
                window.localStorage.setItem(LS_DAY, today);
                window.localStorage.setItem(LS_COUNT, '0');
            }
            return count;
        }
    } catch {
        /* private mode vb. */
    }
    return memoryPlayCount;
}

function bumpQuota(): void {
    try {
        if (window.localStorage) {
            const today = formatLocalYmd(new Date());
            const c = readQuota() + 1;
            window.localStorage.setItem(LS_DAY, today);
            window.localStorage.setItem(LS_COUNT, String(c));
            return;
        }
    } catch {
        /* ignore */
    }
    memoryPlayCount = Math.min(MAX_PLAYS_PER_DAY, memoryPlayCount + 1);
}

/**
 * Kota ve tarayıcı politikası uygunsa kısa çift ton çalar.
 * @returns Ses fiilen çalındıysa true (kota bu durumda artar).
 */
export async function tryPlayBeautyFollowUpReminderChime(): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    if (readQuota() >= MAX_PLAYS_PER_DAY) return false;

    try {
        const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return false;
        const ctx = new Ctor();
        try {
            await ctx.resume();
        } catch {
            try {
                void ctx.close();
            } catch {
                /* ignore */
            }
            return false;
        }
        if (ctx.state !== 'running') {
            try {
                void ctx.close();
            } catch {
                /* ignore */
            }
            return false;
        }

        const playTone = (freq: number, startAt: number, durationSec: number) => {
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            osc.connect(g);
            g.connect(ctx.destination);
            osc.type = 'sine';
            osc.frequency.value = freq;
            const t0 = startAt;
            g.gain.setValueAtTime(0, t0);
            g.gain.linearRampToValueAtTime(0.11, t0 + 0.025);
            g.gain.exponentialRampToValueAtTime(0.0008, t0 + durationSec);
            osc.start(t0);
            osc.stop(t0 + durationSec + 0.03);
        };
        const t = ctx.currentTime;
        playTone(784, t, 0.11);
        playTone(1048, t + 0.13, 0.13);
        bumpQuota();
        window.setTimeout(() => {
            try {
                void ctx.close();
            } catch {
                /* ignore */
            }
        }, 900);
        return true;
    } catch {
        return false;
    }
}
