#!/usr/bin/env node
/**
 * resolveTemplateBody + resolveTemplateTranslations fallback zincirinin doğrulanması.
 * Test bağımsız (postgres bağımlılığı yok): services yerine bağımsız bir simülasyon.
 *
 * Node ESM. tsx/ts-node gerekmez.
 */
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

// TypeScript dosyasını transpile edip ESM modunda çalıştırmak yerine,
// yalın bir JS karşılığını yazalım (gerçek servisin logic'i zaten burada).
// Bu, build sırasında oluşan compile-time hataları yakalamaz ama runtime mantığı
// doğrular.

function normalizeWhatsAppMessageLang(raw) {
  const v = String(raw ?? 'tr').trim().toLowerCase();
  if (v === 'en' || v === 'ar' || v === 'ku') return v;
  return 'tr';
}

function pickBody(row, lang) {
  switch (lang) {
    case 'en': return (row.body_text_en ?? '').trim();
    case 'ar': return (row.body_text_ar ?? '').trim();
    case 'ku': return (row.body_text_ku ?? '').trim();
    default:    return (row.body_text_tr ?? row.body_text ?? '').trim();
  }
}

function resolveTemplateBody(row, rawLang) {
  if (!row) return '';
  const lang = normalizeWhatsAppMessageLang(rawLang);
  const direct = pickBody(row, lang);
  if (direct) return direct;
  const order = ['tr', 'en', 'ar', 'ku'];
  for (const l of order) {
    if (l === lang) continue;
    const v = pickBody(row, l);
    if (v) return v;
  }
  return row.body_text ?? '';
}

function resolveTemplateTranslations(row) {
  if (!row) return { tr: '', en: '', ar: '', ku: '' };
  const fallback = (row.body_text_tr ?? row.body_text ?? '').trim();
  return {
    tr: (row.body_text_tr ?? '').trim() || fallback,
    en: (row.body_text_en ?? '').trim() || fallback,
    ar: (row.body_text_ar ?? '').trim() || fallback,
    ku: (row.body_text_ku ?? '').trim() || fallback,
  };
}

// --------------------------------------------------------------
// Test verisi
// --------------------------------------------------------------

const rowFull = {
  body_text: 'TR fallback',
  body_text_tr: 'Merhaba {customer_name}',
  body_text_en: 'Hello {customer_name}',
  body_text_ar: 'مرحباً {customer_name}',
  body_text_ku: 'سڵاو {customer_name}',
};

const rowMissingAr = {
  body_text: 'TR fallback',
  body_text_tr: 'Merhaba {customer_name}',
  body_text_en: 'Hello {customer_name}',
  body_text_ar: null, // ar boş
  body_text_ku: 'سڵاو {customer_name}',
};

const rowLegacy = {
  // Eski tek-dil şablonu (body_text_tr backfill ile doldurulmuş varsayımı)
  body_text: 'Legacy TR only',
  body_text_tr: 'Legacy TR only',
  body_text_en: null,
  body_text_ar: null,
  body_text_ku: null,
};

const rowEmpty = {
  body_text: '',
  body_text_tr: null,
};

// --------------------------------------------------------------
// Test runner
// --------------------------------------------------------------
let pass = 0;
let fail = 0;
function test(name, expected, actual) {
  if (expected === actual) {
    pass++;
    console.log(`  ✅ ${name}`);
  } else {
    fail++;
    console.error(`  ❌ ${name}`);
    console.error(`     expected: ${JSON.stringify(expected)}`);
    console.error(`     actual:   ${JSON.stringify(actual)}`);
  }
}

console.log('resolveTemplateBody + resolveTemplateTranslations');

// Tam 4-dil şablon
test(
  'tam 4-dil: ar recipient → ar metni',
  'مرحباً {customer_name}',
  resolveTemplateBody(rowFull, 'ar')
);
test(
  'tam 4-dil: ku recipient → ku metni',
  'سڵاو {customer_name}',
  resolveTemplateBody(rowFull, 'ku')
);
test(
  'tam 4-dil: en recipient → en metni',
  'Hello {customer_name}',
  resolveTemplateBody(rowFull, 'en')
);
test(
  'tam 4-dil: tr recipient → tr metni',
  'Merhaba {customer_name}',
  resolveTemplateBody(rowFull, 'tr')
);

// Eksik ar → fallback zinciri
// Beklenen: fallback sırası tr → en → ar → ku (muhasebeci gözüyle:
// TR ana dilimiz olduğu için en yüksek öncelik verilir)
test(
  'ar boş → tr öncelikli fallback (sıra: tr→en→ar→ku)',
  'Merhaba {customer_name}',
  resolveTemplateBody(rowMissingAr, 'ar')
);

// Sadece ku dolu olduğunda
const rowOnlyKu = {
  body_text: '',
  body_text_tr: null,
  body_text_en: null,
  body_text_ar: null,
  body_text_ku: 'سڵاو {customer_name}',
};
test(
  'sadece ku dolu → tr recipient: ku\'ya düşer',
  'سڵاو {customer_name}',
  resolveTemplateBody(rowOnlyKu, 'tr')
);

// Legacy (sadece tr dolu)
test(
  'sadece tr → ar recipient: tr fallback',
  'Legacy TR only',
  resolveTemplateBody(rowLegacy, 'ar')
);
test(
  'sadece tr → tr recipient: tr olduğu gibi',
  'Legacy TR only',
  resolveTemplateBody(rowLegacy, 'tr')
);

// Boş şablon
test(
  'tamamen boş → boş string',
  '',
  resolveTemplateBody(rowEmpty, 'ar')
);

// null / undefined row
test(
  'row null → boş string',
  '',
  resolveTemplateBody(null, 'ar')
);

// Çözümlenmemiş dil → tr fallback
test(
  'lang=xx (tanımsız) → tr fallback (ham)',
  'Merhaba {customer_name}',
  resolveTemplateBody(rowFull, 'xx')
);

// resolveTemplateTranslations
const trn = resolveTemplateTranslations(rowFull);
test('translations.tr', 'Merhaba {customer_name}', trn.tr);
test('translations.en', 'Hello {customer_name}', trn.en);
test('translations.ar', 'مرحباً {customer_name}', trn.ar);
test('translations.ku', 'سڵاو {customer_name}', trn.ku);

// Legacy row → translations hepsi tr fallback'i ile dolar
const trnLegacy = resolveTemplateTranslations(rowLegacy);
test('legacy translations.tr', 'Legacy TR only', trnLegacy.tr);
test('legacy translations.en (fallback tr)', 'Legacy TR only', trnLegacy.en);
test('legacy translations.ar (fallback tr)', 'Legacy TR only', trnLegacy.ar);
test('legacy translations.ku (fallback tr)', 'Legacy TR only', trnLegacy.ku);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
