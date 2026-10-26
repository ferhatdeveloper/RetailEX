import type { Language } from '../../locales/translations';

export interface LocaleFilesCopy {
  title: string;
  folder: string;
  search: string;
  key: string;
  current: string;
  draft: string;
  save: string;
  download: string;
  add: string;
  remove: string;
  language: string;
  file: string;
  emptyList: string;
  loading: string;
  saved: string;
  writeFailed: string;
  localOnly: string;
  denied: string;
  invalid: string;
  exists: string;
  badPath: string;
  emptyKeeps: string;
  deleteTitle: string;
  deleteBody: string;
  cancel: string;
  confirmDelete: string;
  newTitle: string;
  newPath: string;
  newText: string;
  newHint: string;
  addAction: string;
  unsavedTitle: string;
  unsavedBody: string;
  discard: string;
  pickLocal: string;
  noFile: string;
  dirty: string;
}

const COPY: Record<Language, LocaleFilesCopy> = {
  tr: {
    title: 'Dil dosyaları',
    folder: 'Yazılan klasör',
    search: 'Anahtar veya metin ara',
    key: 'Anahtar',
    current: 'Mevcut metin',
    draft: 'Yeni metin',
    save: 'Kaydet',
    download: 'JSON indir',
    add: 'Yeni anahtar',
    remove: 'Sil',
    language: 'Dil',
    file: 'Dosya',
    emptyList: 'Dil dosyası bulunamadı',
    loading: 'Yükleniyor…',
    saved: 'Seçilen dosya yazıldı',
    writeFailed: 'Dosyaya yazılamadı',
    localOnly: 'Bu ortamda dosyaya yazılamadı. Düzenleyip JSON indirebilirsiniz.',
    denied: 'Bu sayfa yalnızca yönetici yetkisiyle açılır.',
    invalid: 'Geçersiz JSON yazılmadı',
    exists: 'Bu anahtar zaten var. Üzerine yazılmadı.',
    badPath: 'Anahtar yolu geçersiz',
    emptyKeeps: 'Boş metin anahtarı silmez. Silmek için Sil kullanın.',
    deleteTitle: 'Anahtarı sil',
    deleteBody: 'Bu anahtar kaydedildiğinde dosyadan düşer. Kardeş anahtarlar durur.',
    cancel: 'Vazgeç',
    confirmDelete: 'Sil',
    newTitle: 'Yeni anahtar',
    newPath: 'Anahtar yolu',
    newText: 'Metin',
    newHint: 'İç içe yol nokta ile yazılır. Örnek: menu.cash.title',
    addAction: 'Ekle',
    unsavedTitle: 'Kaydedilmemiş değişiklik',
    unsavedBody: 'Bu dosyadaki değişiklikler duruyor. Yine de başka dosyaya geçilsin mi?',
    discard: 'Geç',
    pickLocal: 'JSON aç',
    noFile: 'Düzenlemek için bir dil dosyası seçin',
    dirty: 'Kaydedilmedi',
  },
  en: {
    title: 'Language files',
    folder: 'Folder written',
    search: 'Search key or text',
    key: 'Key',
    current: 'Current text',
    draft: 'New text',
    save: 'Save',
    download: 'Download JSON',
    add: 'New key',
    remove: 'Delete',
    language: 'Language',
    file: 'File',
    emptyList: 'No language file found',
    loading: 'Loading…',
    saved: 'Selected file was written',
    writeFailed: 'Could not write the file',
    localOnly: 'This environment cannot write the file. You can still edit and download JSON.',
    denied: 'This page opens only with administrator access.',
    invalid: 'Invalid JSON was not written',
    exists: 'This key already exists. It was not overwritten.',
    badPath: 'Key path is invalid',
    emptyKeeps: 'Empty text does not delete the key. Use Delete to remove it.',
    deleteTitle: 'Delete key',
    deleteBody: 'This key is removed from the file when you save. Sibling keys stay.',
    cancel: 'Cancel',
    confirmDelete: 'Delete',
    newTitle: 'New key',
    newPath: 'Key path',
    newText: 'Text',
    newHint: 'Nested path uses dots. Example: menu.cash.title',
    addAction: 'Add',
    unsavedTitle: 'Unsaved changes',
    unsavedBody: 'This file still has changes. Switch to another file anyway?',
    discard: 'Switch',
    pickLocal: 'Open JSON',
    noFile: 'Select a language file to edit',
    dirty: 'Unsaved',
  },
  ar: {
    title: 'ملفات اللغة',
    folder: 'المجلد المكتوب',
    search: 'ابحث في المفتاح أو النص',
    key: 'المفتاح',
    current: 'النص الحالي',
    draft: 'النص الجديد',
    save: 'حفظ',
    download: 'تنزيل JSON',
    add: 'مفتاح جديد',
    remove: 'حذف',
    language: 'اللغة',
    file: 'الملف',
    emptyList: 'لا يوجد ملف لغة',
    loading: 'جارٍ التحميل…',
    saved: 'تم كتابة الملف المحدد',
    writeFailed: 'تعذر كتابة الملف',
    localOnly: 'لا يمكن الكتابة في هذا الوسط. يمكن التعديل ثم تنزيل JSON.',
    denied: 'تُفتح هذه الصفحة لصلاحية المدير فقط.',
    invalid: 'لم يُكتب JSON غير الصالح',
    exists: 'هذا المفتاح موجود. لم يُستبدل.',
    badPath: 'مسار المفتاح غير صالح',
    emptyKeeps: 'النص الفارغ لا يحذف المفتاح. استخدم حذف.',
    deleteTitle: 'حذف المفتاح',
    deleteBody: 'يُزال هذا المفتاح عند الحفظ. المفاتيح الشقيقة تبقى.',
    cancel: 'إلغاء',
    confirmDelete: 'حذف',
    newTitle: 'مفتاح جديد',
    newPath: 'مسار المفتاح',
    newText: 'النص',
    newHint: 'المسار المتداخل بالنقطة. مثال: menu.cash.title',
    addAction: 'إضافة',
    unsavedTitle: 'تغييرات غير محفوظة',
    unsavedBody: 'ما زالت هناك تغييرات. الانتقال إلى ملف آخر؟',
    discard: 'انتقال',
    pickLocal: 'فتح JSON',
    noFile: 'اختر ملف لغة للتعديل',
    dirty: 'غير محفوظ',
  },
  ku: {
    title: 'فایلەکانی زمان',
    folder: 'بوخچەی نووسراو',
    search: 'لە کلیل یان دەق بگەڕێ',
    key: 'کلیل',
    current: 'دەقی ئێستا',
    draft: 'دەقی نوێ',
    save: 'پاشەکەوت',
    download: 'JSON دابەزێنە',
    add: 'کلیلی نوێ',
    remove: 'سڕینەوە',
    language: 'زمان',
    file: 'فایل',
    emptyList: 'فایلی زمان نەدۆزرایەوە',
    loading: 'بارکردن…',
    saved: 'فایلی هەڵبژێردراو نووسرا',
    writeFailed: 'فایل نەنووسرا',
    localOnly: 'لەم ژینگەیەدا فایل نانوسرێت. دەتوانیت دەستکاری بکەیت و JSON دابەزێنیت.',
    denied: 'ئەم پەڕەیە تەنها بە مۆڵەتی بەڕێوەبەر دەکرێتەوە.',
    invalid: 'JSONی نادروست نەنووسرا',
    exists: 'ئەم کلیلیە هەیە. لەسەری نەنووسرا.',
    badPath: 'ڕێڕەوی کلیل نادروستە',
    emptyKeeps: 'دەقی بەتاڵ کلیل ناسڕێتەوە. بۆ سڕینەوە دوگمەی سڕینەوە بەکاربهێنە.',
    deleteTitle: 'کلیل بسڕەوە',
    deleteBody: 'لە پاشەکەوتدا ئەم کلیلیە لە فایل دەکەوێت. کلیلی هاوشێوە دەمێنن.',
    cancel: 'پاشگەزبوونەوە',
    confirmDelete: 'سڕینەوە',
    newTitle: 'کلیلی نوێ',
    newPath: 'ڕێڕەوی کلیل',
    newText: 'دەق',
    newHint: 'ڕێڕەوی ناوەکی بە خاڵ. نموونە: menu.cash.title',
    addAction: 'زیادکردن',
    unsavedTitle: 'گۆڕانکاری پاشەکەوتنەکراو',
    unsavedBody: 'گۆڕانکاری ماوە. بڕۆیتە فایلێکی تر؟',
    discard: 'بڕۆ',
    pickLocal: 'JSON بکەرەوە',
    noFile: 'بۆ دەستکاری فایلێکی زمان هەڵبژێرە',
    dirty: 'پاشەکەوتنەکراو',
  },
};

export function localeFilesCopy(language: Language): LocaleFilesCopy {
  return COPY[language] ?? COPY.tr;
}
