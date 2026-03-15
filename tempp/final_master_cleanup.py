import re
import os

def parse_kv_from_block(content):
    """Extracts key-value pairs from a flat block of JS/TS code."""
    # This regex handles escaped quotes and different types of quotes
    val_regex = r'([a-zA-Z0-9_]+)\s*:\s*("(?:\\.|[^"])*"|\'(?:\\.|[^\'])*\')'
    items = re.findall(val_regex, content)
    return {k: v for k, v in items}

def get_block(content, start_marker):
    """Finds a bracketed block starting with start_marker."""
    match = re.search(start_marker, content, re.MULTILINE)
    if not match:
        return None, None
    
    start_idx = match.end()
    depth = 1
    idx = start_idx
    while depth > 0 and idx < len(content):
        if content[idx] == '{': depth += 1
        elif content[idx] == '}': depth -= 1
        idx += 1
    
    if depth == 0:
        return content[start_idx:idx-1], idx
    return None, None

def main():
    path = 'd:/RetailEX/src/locales/translations.ts'
    if not os.path.exists(path):
        print("File not found.")
        return
        
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    langs = ['tr', 'en', 'ar', 'ku']
    lang_data = {l: {'menu': {}, 'sidebar': {}, 'root': {}} for l in langs}

    # Extract all data from the file for each language
    for lang in langs:
        # Since there might be duplicate blocks, we find ALL occurrences
        search_idx = 0
        while True:
            block, next_idx = get_block(content[search_idx:], rf'^\s+{lang}: \{{')
            if block is None:
                break
            
            # Extract sidebar
            s_block, _ = get_block(block, r'sidebar:\s*\{')
            if s_block:
                lang_data[lang]['sidebar'].update(parse_kv_from_block(s_block))
            
            # Extract menu
            m_block, _ = get_block(block, r'menu:\s*\{')
            if m_block:
                lang_data[lang]['menu'].update(parse_kv_from_block(m_block))
                
            # Extract root (everything else)
            # Remove objects to parse flat keys
            root_text = re.sub(r'sidebar:\s*\{.*?\}', '', block, flags=re.DOTALL)
            root_text = re.sub(r'menu:\s*\{.*?\}', '', root_text, flags=re.DOTALL)
            lang_data[lang]['root'].update(parse_kv_from_block(root_text))
            
            search_idx += next_idx

    # Define the interfaces based on what's needed
    # (Keys gathered from previous steps and current file)
    sidebar_keys = [
        'searchPlaceholderShort', 'searchPlaceholderFull', 'clearSearch', 
        'resultsFound', 'noResultsFound', 'tryDifferentSearch', 
        'languageSelection', 'lightMode', 'darkMode', 'dbMenu', 'staticMenu'
    ]
    
    # Missing root keys we added
    new_root_keys = [
        'loading', 'moduleLoadError', 'moduleLoadErrorMessage', 
        'backToDashboard', 'preparingModule', 'moduleUnderDevelopment'
    ]
    
    # Missing menu keys we added
    new_menu_keys = ['cashCards', 'generalReport', 'designCenter', 'labelDesigner', 'newBadge']

    # Merge our new data into lang_data
    # Sidebar data
    s_data = {
        'tr': {'searchPlaceholderShort': '"Ara..."', 'searchPlaceholderFull': '"Menüde hızlı ara... (Ctrl+K)"', 'clearSearch': '"Temizle (ESC)"', 'resultsFound': '"sonuç bulundu"', 'noResultsFound': '"Sonuç bulunamadı"', 'tryDifferentSearch': '"Farklı bir arama terimi deneyin"', 'languageSelection': '"Dil Seçimi"', 'lightMode': '"Açık Tema"', 'darkMode': '"Koyu Tema"', 'dbMenu': '"📊 DB Menü"', 'staticMenu': '"📋 Statik Menü"'},
        'en': {'searchPlaceholderShort': '"Search..."', 'searchPlaceholderFull': '"Quick search in menu... (Ctrl+K)"', 'clearSearch': '"Clear (ESC)"', 'resultsFound': '"results found"', 'noResultsFound': '"No results found"', 'tryDifferentSearch': '"Try a different search term"', 'languageSelection': '"Language Selection"', 'lightMode': '"Light Mode"', 'darkMode': '"Dark Mode"', 'dbMenu': '"📊 DB Menu"', 'staticMenu': '"📋 Static Menu"'},
        'ar': {'searchPlaceholderShort': '"بحث..."', 'searchPlaceholderFull': '"بحث سريع في القائمة... (Ctrl+K)"', 'clearSearch': '"مسح (ESC)"', 'resultsFound': '"نتائج وجدت"', 'noResultsFound': '"لم يتم العثور على نتائج"', 'tryDifferentSearch': '"جرب مصطلح بحث مختلف"', 'languageSelection': '"اختيار اللغة"', 'lightMode': '"الوضع الفاتح"', 'darkMode': '"الوضع الداكن"', 'dbMenu': '"📊 قائمة قاعدة البيانات"', 'staticMenu': '"📋 قائمة ثابتة"'},
        'ku': {'searchPlaceholderShort': '"گەڕان..."', 'searchPlaceholderFull': '"گەڕانی خێرا لە لیستەکە... (Ctrl+K)"', 'clearSearch': '"پاککردنەوە (ESC)"', 'resultsFound': '"ئەنجام دۆزرایەوە"', 'noResultsFound': '"هیچ ئەنجامێک نەدۆزرایەوە"', 'tryDifferentSearch': '"زاراوەیەکی تری گەڕان تاقیبکەرەوە"', 'languageSelection': '"هەڵبژاردنی زمان"', 'lightMode': '"دۆخی ڕووناک"', 'darkMode': '"دۆخی تاریک"', 'dbMenu': '"📊 لیستی داتابەیس"', 'staticMenu': '"📋 لیستی جێگیر"'}
    }
    for l in langs: lang_data[l]['sidebar'].update(s_data[l])

    # Root additions
    r_data = {
        'tr': {'loading': '"Yükleniyor..."', 'moduleLoadError': '"Modül Yükleme Hatası"', 'moduleLoadErrorMessage': '"\\"{screenName}\\" ekranı yüklenirken bir hata oluştu."', 'backToDashboard': '"Ana Panele Dön"', 'preparingModule': '"\\"{screenName}\\" Modülü Hazırlanıyor"', 'moduleUnderDevelopment': '"Bu modül şu anda geliştirme aşamasındadır ve yakında EX-ROSERP ekosistemine dahil edilecektir."'},
        'en': {'loading': '"Loading..."', 'moduleLoadError': '"Module Loading Error"', 'moduleLoadErrorMessage': '"An error occurred while loading \\"{screenName}\\" screen."', 'backToDashboard': '"Back to Dashboard"', 'preparingModule': '"\\"{screenName}\\" Module is Being Prepared"', 'moduleUnderDevelopment': '"This module is currently under development and will be included in the EX-ROSERP ecosystem soon."'},
        'ar': {'loading': '"جاري التحميل..."', 'moduleLoadError': '"خطأ في تحميل الوحدة"', 'moduleLoadErrorMessage': '"حدث خطأ أثناء تحميل شاشة \\"{screenName}\\". Primetime"', 'backToDashboard': '"العودة إلى لوحة القيادة"', 'preparingModule': '"وحدة \\"{screenName}\\" قيد التحضير"', 'moduleUnderDevelopment': '"هذه الوحدة قيد التطوير حاليًا وستدرج في نظام EX-ROSERP قريبًا."'},
        'ku': {'loading': '"خەریکی بارکردنە..."', 'moduleLoadError': '"هەڵەی بارکردنی مۆدیۆل"', 'moduleLoadErrorMessage': '"هەڵەیەک ڕوویدا لە کاتی بارکردنی شاشەی \\"{screenName}\\". "', 'backToDashboard': '"بگەڕێرەوە بۆ داشبورد"', 'preparingModule': '"مۆدیۆلی \\"{screenName}\\" لە ئامادەکردندایە"', 'moduleUnderDevelopment': '"ئەم مۆدیۆلە ئێستا لە ژێر گەشەپێداندایە و بەم زووانە دەخرێتە ناو کۆمەڵەی EX-ROSERP."'}
    }
    for l in langs: lang_data[l]['root'].update(r_data[l])

    # Menu additions
    m_data = {
        'tr': {'cashCards': '"Kasa Kartları"', 'generalReport': '"Genel Rapor"', 'designCenter': '"Dizayn Merkezi"', 'labelDesigner': '"Etiket Tasarımcı"', 'newBadge': '"YENİ"'},
        'en': {'cashCards': '"Cash Cards"', 'generalReport': '"General Report"', 'designCenter': '"Design Center"', 'labelDesigner': '"Label Designer"', 'newBadge': '"NEW"'},
        'ar': {'cashCards': '"بطاقات الخزينة"', 'generalReport': '"تقرير عام"', 'designCenter': '"مركز التصميم"', 'labelDesigner': '"مصمم الملصقات"', 'newBadge': '"جديد"'},
        'ku': {'cashCards': '"کارتەکانی کۆگا"', 'generalReport': '"ڕاپۆرتی گشتی"', 'designCenter': '"سەنتەري ديزاين"', 'labelDesigner': '"دیزاینەری لێبڵ"', 'newBadge': '"نوێ"'}
    }
    for l in langs: lang_data[l]['menu'].update(m_data[l])

    # Standardize keys
    all_sidebar_keys = sorted(list(set(lang_data['en']['sidebar'].keys())))
    all_menu_keys = sorted(list(set(lang_data['en']['menu'].keys())))
    # For root, take everything that isn't in menu or sidebar
    all_root_keys = sorted(list(set(lang_data['en']['root'].keys())))

    # Rebuild file
    new_content = [
        "export type Language = 'tr' | 'en' | 'ar' | 'ku';",
        "",
        "export interface MenuTranslations {"
    ]
    for k in all_menu_keys: new_content.append(f"  {k}: string;")
    new_content.append("}")
    new_content.append("")
    
    new_content.append("export interface SidebarTranslations {")
    for k in all_sidebar_keys: new_content.append(f"  {k}: string;")
    new_content.append("}")
    new_content.append("")
    
    new_content.append("export interface Translations {")
    new_content.append("  sidebar: SidebarTranslations;")
    new_content.append("  menu: MenuTranslations;")
    for k in all_root_keys: new_content.append(f"  {k}: string;")
    new_content.append("}")
    new_content.append("")
    
    new_content.append("export const translations: any = {")
    
    for lang in langs:
        new_content.append(f"  {lang}: {{")
        
        # Sidebar
        new_content.append("    sidebar: {")
        for k in all_sidebar_keys:
            val = lang_data[lang]['sidebar'].get(k) or lang_data['en']['sidebar'].get(k) or f'"{k}"'
            new_content.append(f"      {k}: {val},")
        new_content.append("    },")
        
        # Menu
        new_content.append("    menu: {")
        for k in all_menu_keys:
            val = lang_data[lang]['menu'].get(k) or lang_data['en']['menu'].get(k) or f'"{k}"'
            new_content.append(f"      {k}: {val},")
        new_content.append("    },")
        
        # Root
        for k in all_root_keys:
            val = lang_data[lang]['root'].get(k) or lang_data['en']['root'].get(k) or f'"{k}"'
            new_content.append(f"    {k}: {val},")
        
        new_content.append("  },")
    new_content.append("};")

    with open(path, 'w', encoding='utf-8') as f:
        f.write("\n".join(new_content))
    print("Cleanup complete.")

if __name__ == "__main__":
    main()
local_path = 'd:/RetailEX/final_master_cleanup.py'
