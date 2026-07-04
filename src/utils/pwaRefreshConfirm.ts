/** PWA üstten çekerek yenileme — onay metni (main.tsx, LanguageContext öncesi) */

export function pwaRefreshConfirmMessage(): string {
  const lang = (typeof localStorage !== 'undefined' && localStorage.getItem('retailos_language')) || 'tr';
  const messages: Record<string, string> = {
    tr: 'Sayfayı yenilemek ister misiniz?',
    en: 'Do you want to refresh the page?',
    ar: 'هل تريد تحديث الصفحة؟',
    ku: 'دەتەوێت پەڕە نوێ بکەیتەوە؟',
  };
  return messages[lang] ?? messages.tr;
}
