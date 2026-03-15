import re

def add_sidebar_keys():
    path = 'd:/RetailEX/src/locales/translations.ts'
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Define sidebar interface
    sidebar_interface = """export interface SidebarTranslations {
  searchPlaceholderShort: string;
  searchPlaceholderFull: string;
  clearSearch: string;
  resultsFound: string;
  noResultsFound: string;
  tryDifferentSearch: string;
  languageSelection: string;
  lightMode: string;
  darkMode: string;
  dbMenu: string;
  staticMenu: string;
}
"""
    # Insert SidebarTranslations interface before Translations interface
    if 'export interface SidebarTranslations' not in content:
        content = content.replace('export interface Translations', sidebar_interface + '\nexport interface Translations')

    # Add to Translations interface
    if 'sidebar: SidebarTranslations;' not in content:
        content = content.replace('export interface Translations {', 'export interface Translations {\n  sidebar: SidebarTranslations;')

    # Data for each language
    data = {
        'tr': {
            'searchPlaceholderShort': '"Ara..."',
            'searchPlaceholderFull': '"Menüde hızlı ara... (Ctrl+K)"',
            'clearSearch': '"Temizle (ESC)"',
            'resultsFound': '"sonuç bulundu"',
            'noResultsFound': '"Sonuç bulunamadı"',
            'tryDifferentSearch': '"Farklı bir arama terimi deneyin"',
            'languageSelection': '"Dil Seçimi"',
            'lightMode': '"Açık Tema"',
            'darkMode': '"Koyu Tema"',
            'dbMenu': '"📊 DB Menü"',
            'staticMenu': '"📋 Statik Menü"'
        },
        'en': {
            'searchPlaceholderShort': '"Search..."',
            'searchPlaceholderFull': '"Quick search in menu... (Ctrl+K)"',
            'clearSearch': '"Clear (ESC)"',
            'resultsFound': '"results found"',
            'noResultsFound': '"No results found"',
            'tryDifferentSearch': '"Try a different search term"',
            'languageSelection': '"Language Selection"',
            'lightMode': '"Light Mode"',
            'darkMode': '"Dark Mode"',
            'dbMenu': '"📊 DB Menu"',
            'staticMenu': '"📋 Static Menu"'
        },
        'ar': {
            'searchPlaceholderShort': '"بحث..."',
            'searchPlaceholderFull': '"بحث سريع في القائمة... (Ctrl+K)"',
            'clearSearch': '"مسح (ESC)"',
            'resultsFound': '"نتائج وجدت"',
            'noResultsFound': '"لم يتم العثور على نتائج"',
            'tryDifferentSearch': '"جرب مصطلح بحث مختلف"',
            'languageSelection': '"اختيار اللغة"',
            'lightMode': '"الوضع الفاتح"',
            'darkMode': '"الوضع الداكن"',
            'dbMenu': '"📊 قائمة قاعدة البيانات"',
            'staticMenu': '"📋 قائمة ثابتة"'
        },
        'ku': {
            'searchPlaceholderShort': '"گەڕان..."',
            'searchPlaceholderFull': '"گەڕانی خێرا لە لیستەکە... (Ctrl+K)"',
            'clearSearch': '"پاککردنەوە (ESC)"',
            'resultsFound': '"ئەنجام دۆزرایەوە"',
            'noResultsFound': '"هیچ ئەنجامێک نەدۆزرایەوە"',
            'tryDifferentSearch': '"زاراوەیەکی تری گەڕان تاقیبکەرەوە"',
            'languageSelection': '"هەڵبژاردنی زمان"',
            'lightMode': '"دۆخی ڕووناک"',
            'darkMode': '"دۆخی تاریک"',
            'dbMenu': '"📊 لیستی داتابەیس"',
            'staticMenu': '"📋 لیستی جێگیر"'
        }
    }

    # Add to each language object
    for lang in ['tr', 'en', 'ar', 'ku']:
        lang_pattern = rf'{lang}: \{{(.*?)\n  }},'
        lang_match = re.search(lang_pattern, content, re.DOTALL)
        if lang_match:
            block = lang_match.group(1)
            skeys = data[lang]
            sidebar_block = '    sidebar: {\n' + '\n'.join([f'      {k}: {v},' for k, v in skeys.items()]) + '\n    },'
            # Insert at the beginning of the block
            new_block = sidebar_block + block
            content = content.replace(block, new_block, 1)

    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

if __name__ == "__main__":
    add_sidebar_keys()
