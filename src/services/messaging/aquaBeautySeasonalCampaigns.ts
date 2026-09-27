/**
 * Aqua Beauty Center — sezonluk WhatsApp kampanya metinleri ve gönderim planı.
 * Mesajlar kullanıcı onaylı; UTF-8 (KU Sorani + AR) bozulmamalı.
 */

import type { WhatsAppMessageLang } from './whatsappMessageLang';

export type AquaSeasonalCampaignId = 'valentine_promo' | 'student_day';

export interface AquaSeasonalCampaignPlan {
  id: AquaSeasonalCampaignId;
  /** UI / özel gün adı */
  nameTr: string;
  /** Etkinlik ay/gün (özel gün takvimi) */
  eventMonth: number;
  eventDay: number;
  /** Gönderim: etkinlikten kaç gün önce (KU / AR ayrı satırlar seed'de) */
  sendDaysBefore: { ku: number; ar: number };
  /** Saat (AR genelde +1 saat — aynı günde çift dil) */
  sendTime: { ku: string; ar: string };
  audience: 'bulk_all';
  discountNoteTr: string;
  messages: Record<WhatsAppMessageLang, string>;
}

const VALENTINE_KU = `بە بۆنەی ڕۆژی ڤاڵانتاین ١٤/٢، ئەکوا بیوتی سەنتەر داشكانيكي تایبەتی بۆ ئێوەی خۆشەویست ئامادە کردووە.
بۆ ماوەیەکی سنووردار، بە ڕێژەی ٪٣٠ داشکاندن لەسەر خزمەتگوزارییەکانمان.
لەگەڵ ئێمە ڤاڵانتاینێکی جوانتر بەسەر ببەن.
ئەکوا بیوتی سەنتەر`;

const VALENTINE_AR = `بمناسبة عيد الحب 14/2، يقدم لكم أكوا بيوتي سنتر عرضًا خاصًا لكم.
لفترة محدودة، خصم 30٪ على خدماتنا.
احتفلوا معنا بعيد حب أجمل.
أكوا بيوتي سنتر`;

const STUDENT_KU = `بە بۆنەی ڕۆژی قوتابی ١٨/٢، ئەکوا بیوتی سەنتەر داشكانيكي تایبەتی بۆ قوتابییە خۆشەویستەکانمان ئامادە کردووە.
٪٥٠ داشکاندن لەسەر خزمەتگوزارییەکانمان، بە مەرجی هەبوونی کارتی قوتابی.
ڕۆژی قوتابییەکانتان پیرۆز بێت.
ئەکوا بیوتی سەنتەر`;

const STUDENT_AR = `بمناسبة يوم الطالب 18/2، يقدم لكم أكوا بيوتي سنتر عرضًا خاصًا للطلاب.
خصم 50٪ على خدماتنا، بشرط إبراز بطاقة الطالب.
كل عام وطلابنا الأعزاء بألف خير.
أكوا بيوتي سنتر`;

/** Valentine: 14/2 etkinlik → gönderim 30 Ocak (KU, −15g) / 31 Ocak (AR, −14g) */
export const AQUA_VALENTINE_CAMPAIGN: AquaSeasonalCampaignPlan = {
  id: 'valentine_promo',
  nameTr: 'Aqua Sevgililer Günü %30',
  eventMonth: 2,
  eventDay: 14,
  sendDaysBefore: { ku: 15, ar: 14 },
  sendTime: { ku: '10:00', ar: '10:00' },
  audience: 'bulk_all',
  discountNoteTr: '%30 indirim, sınırlı süre (14/2 Sevgililer Günü)',
  messages: {
    ku: VALENTINE_KU,
    ar: VALENTINE_AR,
    tr: VALENTINE_KU,
    en: VALENTINE_AR,
  },
};

/**
 * Öğrenci Günü: 18/2 etkinlik → gönderim 14 Şubat (−4g).
 * KU 10:00, AR 11:00 (aynı gün çift dil, toplu gönderim).
 */
export const AQUA_STUDENT_DAY_CAMPAIGN: AquaSeasonalCampaignPlan = {
  id: 'student_day',
  nameTr: 'Aqua Öğrenci Günü %50',
  eventMonth: 2,
  eventDay: 18,
  sendDaysBefore: { ku: 4, ar: 4 },
  sendTime: { ku: '10:00', ar: '11:00' },
  audience: 'bulk_all',
  discountNoteTr: '%50 indirim, öğrenci kartı şartı (18/2 Öğrenci Günü)',
  messages: {
    ku: STUDENT_KU,
    ar: STUDENT_AR,
    tr: STUDENT_KU,
    en: STUDENT_AR,
  },
};

export const AQUA_SEASONAL_CAMPAIGNS: AquaSeasonalCampaignPlan[] = [
  AQUA_VALENTINE_CAMPAIGN,
  AQUA_STUDENT_DAY_CAMPAIGN,
];

export function getAquaSeasonalCampaign(
  id: AquaSeasonalCampaignId,
): AquaSeasonalCampaignPlan | undefined {
  return AQUA_SEASONAL_CAMPAIGNS.find((c) => c.id === id);
}

export function getAquaSeasonalMessage(
  id: AquaSeasonalCampaignId,
  lang: WhatsAppMessageLang,
): string {
  const c = getAquaSeasonalCampaign(id);
  if (!c) return '';
  return c.messages[lang] || c.messages.ku;
}
