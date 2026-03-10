import fs from 'fs';

const translationsPath = 'D:/RetailEX/src/locales/translations.ts';
let content = fs.readFileSync(translationsPath, 'utf8');

const keysToAdd = {
    bankDepositDesc: { tr: 'Bankaya para yatırma işlemi', en: 'Cash deposit to bank', ar: 'إيداع نقدي في البنك', ku: 'پاره دانان لە بانک' },
    bankTransferDesc: { tr: 'Bankadan bankaya veya kasaya transfer', en: 'Transfer between banks or registers', ar: 'تحويل بين البنوك أو الخزائن', ku: 'گواستنەوە لە نێوان بانکەکان' },
    bankWithdrawalDesc: { tr: 'Bankadan para çekme işlemi', en: 'Cash withdrawal from bank', ar: 'سحب نقدي من البنك', ku: 'پاره کێشانەوە لە بانک' },
    baseCurrency: { tr: 'Ana Para Birimi', en: 'Base Currency', ar: 'العملة الأساسية', ku: 'دراوی سەرەکی' },
    baseCurrencyShort: { tr: 'ANA', en: 'BASE', ar: 'أساس', ku: 'سەرەکی' },
    buyRate: { tr: 'Alış Kuru', en: 'Buy Rate', ar: 'سعر الشراء', ku: 'نرخی کڕین' },
    cashInDesc: { tr: 'Kasaya nakit girişi', en: 'Cash inflow to register', ar: 'دخول نقد إلى الصندوق', ku: 'هاتنە ناوەوەی نەختینە بۆ سندوق' },
    cashOutDesc: { tr: 'Kasadan nakit çıkışı', en: 'Cash outflow from register', ar: 'خروج نقد من الصندوق', ku: 'چوونە دەرەوەی نەختینە لە سندوق' },
    chCollectionDesc: { tr: 'Cari hesaptan tahsilat işlemi', en: 'Collection from current account', ar: 'تحصيل من الحساب الجاري', ku: 'وەرگرتن لە هەژماری هەنووکەیی' },
    chPaymentDesc: { tr: 'Cari hesaba ödeme işlemi', en: 'Payment to current account', ar: 'دفع للحساب الجاري', ku: 'پارەدان بۆ هەژماری هەنووکەیی' },
    chartsTab: { tr: 'Grafikler', en: 'Charts', ar: 'رسوم بيانية', ku: 'چارته‌کان' },
    createTransaction: { tr: 'İşlem Oluştur', en: 'Create Transaction', ar: 'إنشاء معاملة', ku: 'دروستکردنی کردار' },
    currenciesTab: { tr: 'Para Birimleri', en: 'Currencies', ar: 'العملات', ku: 'دراوەکان' },
    currencyCode: { tr: 'Para Birimi Kodu', en: 'Currency Code', ar: 'رمز العملة', ku: 'کۆدی دراو' },
    currencyLabel: { tr: 'Para Birimi', en: 'Currency', ar: 'العملة', ku: 'دراو' },
    currencyManagement: { tr: 'Para Birimi Yönetimi', en: 'Currency Management', ar: 'إدارة العملات', ku: 'بەڕێوەبردنی دراوەکان' },
    currencyManagementDesc: { tr: 'Para birimleri ve döviz kurları yönetimi', en: 'Manage currencies and exchange rates', ar: 'إدارة العملات وأسعار الصرف', ku: 'بەڕێوەبردنی دراوەکان و نرخی گۆڕینەوە' },
    currencyName: { tr: 'Para Birimi Adı', en: 'Currency Name', ar: 'اسم العملة', ku: 'ناوی دراو' },
    currencySymbol: { tr: 'Sembol', en: 'Symbol', ar: 'رمز', ku: 'هێما' },
    dailyRatesTab: { tr: 'Günlük Kurlar', en: 'Daily Rates', ar: 'أسعار يومية', ku: 'نرخە ڕۆژانەکان' },
    deleteComingSoon: { tr: 'Silme yakında eklenecek', en: 'Deletion coming soon', ar: 'الحذف قريبا', ku: 'سڕینەوە بەم زووانە' },
    editComingSoon: { tr: 'Düzenleme yakında eklenecek', en: 'Editing coming soon', ar: 'التعديل قريبا', ku: 'دەستکاریکردن بەم زووانە' },
    enterRate: { tr: 'Kur Girişi', en: 'Enter Rate', ar: 'إدخال السعر', ku: 'نرخ داخل بکە' },
    enteredBy: { tr: 'Giren', en: 'Entered By', ar: 'أدخلت بواسطة', ku: 'تۆمارکراوە لەلایەن' },
    exchangeDifferenceCreditDesc: { tr: 'Kur farkı alacak kaydı', en: 'Exchange difference credit entry', ar: 'قيد دائن لفرق العملة', ku: 'تۆماری قیستی جیاوازی دراو' },
    exchangeDifferenceDebitDesc: { tr: 'Kur farkı borç kaydı', en: 'Exchange difference debit entry', ar: 'قيد مدين لفرق العملة', ku: 'تۆماری قەرزی جیاوازی دراو' },
    expenseVoucherDesc: { tr: 'Gider pusulası ile ödeme', en: 'Payment via expense voucher', ar: 'دفع عبر قسيمة نفقات', ku: 'پارەدان لە ڕێگەی پسوڵەی خەرجی' },
    issuedSelfEmployedReceipt: { tr: 'S.G. Makbuzu (Verilen)', en: 'Issued Self-Employed Receipt', ar: 'إيصال عمل حر صادر', ku: 'پسوڵەی کاری سەربەخۆ دراو' },
    issuedSelfEmployedReceiptDesc: { tr: 'Verilen serbest meslek makbuzu', en: 'Issued self-employed receipt', ar: 'إيصال عمل حر صادر', ku: 'پسوڵەی کاری سەربەخۆ دراوە' },
    newCurrency: { tr: 'Yeni Para Birimi', en: 'New Currency', ar: 'عملة جديدة', ku: 'دراوی نوێ' },
    openingCreditDesc: { tr: 'Açılış fişi alacak kaydı', en: 'Opening slip credit entry', ar: 'قيد دائن للافتتاح', ku: 'تۆماری قیستی پسوڵەی کردنەوە' },
    openingDebitDesc: { tr: 'Açılış fişi borç kaydı', en: 'Opening slip debit entry', ar: 'قيد مدين للافتتاح', ku: 'تۆماری قەرزی پسوڵەی کردنەوە' },
    printComingSoon: { tr: 'Yazdırma yakında eklenecek', en: 'Printing coming soon', ar: 'الطباعة قريبا', ku: 'چاپکردن بەم زووانە' },
    producerReceipt: { tr: 'Müstahsil Makbuzu', en: 'Producer Receipt', ar: 'إيصال منتج', ku: 'پسوڵەی بەرهەمهێنەر' },
    producerReceiptDesc: { tr: 'Müstahsil makbuzu ile ödeme', en: 'Payment via producer receipt', ar: 'دفع عبر إيصال منتج', ku: 'پارەدان لە ڕێگەی پسوڵەی بەرهەمهێنەر' },
    rateChartsPlaceholder: { tr: 'Kur grafikleri burada', en: 'Rate charts will appear here', ar: 'رسوم العملات هنا', ku: 'چارتەکانی دراو لێرە' },
    rateHistoryPlaceholder: { tr: 'Geçmiş kur bilgileri burada', en: 'Rate history will appear here', ar: 'تاريخ الأسعار هنا', ku: 'مێژووی نرخەکان لێرە' },
    rateHistoryTab: { tr: 'Kur Geçmişi', en: 'Rate History', ar: 'تاريخ الأسعار', ku: 'مێژووی نرخەکان' },
    receivedSelfEmployedReceipt: { tr: 'S.G. Makbuzu (Alınan)', en: 'Received Self-Employed Receipt', ar: 'إيصال عمل حر مستلم', ku: 'پسوڵەی کاری سەربەخۆ وەرگیراو' },
    receivedSelfEmployedReceiptDesc: { tr: 'Alınan serbest meslek makbuzu', en: 'Received self-employed receipt', ar: 'إيصال عمل حر مستلم', ku: 'پسوڵەی کاری سەربەخۆ وەرگیراو' },
    reportingCurrency: { tr: 'Raporlama Para Birimi', en: 'Reporting Currency', ar: 'عملة التقارير', ku: 'دراوی ڕاپۆرت' },
    reportingCurrencyShort: { tr: 'RAPOR', en: 'REP', ar: 'تقرير', ku: 'ڕاپۆرت' },
    safesCode: { tr: 'Kasalar', en: 'Cash Registers', ar: 'الخزائن', ku: 'سندوقەکان' },
    selectDate: { tr: 'Tarih Seçin', en: 'Select Date', ar: 'اختر التاريخ', ku: 'بەروار هەڵبژێرە' },
    sellRate: { tr: 'Satış Kuru', en: 'Sell Rate', ar: 'سعر البيع', ku: 'نرخی فرۆشتن' },
    updateRates: { tr: 'Kurları Güncelle', en: 'Update Rates', ar: 'تحديث الأسعار', ku: 'نوێکردنەوەی نرخەکان' }
};

// Insert into interface
let interfaceEdits = '';
for (const key in keysToAdd) {
    interfaceEdits += `  ${key}: string;\n`;
}
content = content.replace(/(export interface Translations \{[\s\S]*?)(  menu: MenuTranslations;)/, `$1${interfaceEdits}$2`);

// Insert into tr
let trEdits = '';
for (const key in keysToAdd) {
    trEdits += `    ${key}: '${keysToAdd[key].tr.replace(/'/g, "\\'")}',\n`;
}
content = content.replace(/(export const translations: Record<Language, Translations> = \{\s*tr: \{[\s\S]*?)(    menuManagement: 'Menü Yönetimi',)/, `$1${trEdits}$2`);

// Insert into en
let enEdits = '';
for (const key in keysToAdd) {
    enEdits += `    ${key}: '${keysToAdd[key].en.replace(/'/g, "\\'")}',\n`;
}
content = content.replace(/(\s+en: \{[\s\S]*?)(    menuManagement: 'Menu Management',)/, `$1${enEdits}$2`);

// Insert into ar
let arEdits = '';
for (const key in keysToAdd) {
    arEdits += `    ${key}: '${keysToAdd[key].ar.replace(/'/g, "\\'")}',\n`;
}
content = content.replace(/(\s+ar: \{[\s\S]*?)(    menuManagement: 'إدارة القوائم',)/, `$1${arEdits}$2`);

// Insert into ku
let kuEdits = '';
for (const key in keysToAdd) {
    kuEdits += `    ${key}: '${keysToAdd[key].ku.replace(/'/g, "\\'")}',\n`;
}
// For ku, menuManagement might not have a specific translation or it's 'بەڕێوەبردنی مینیو'. 
// We will replace before 'menuManagement:' dynamically for ku
content = content.replace(/(\s+ku: \{[\s\S]*?)(    menuManagement:)/, `$1${kuEdits}$2`);

fs.writeFileSync(translationsPath, content);
console.log('Successfully injected the translation keys!');
