import re

def add_keys():
    path = 'd:/RetailEX/src/locales/translations.ts'
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Add to MenuTranslations interface
    menu_int_match = re.search(r'export interface MenuTranslations \{(.*?)\}', content, re.DOTALL)
    if menu_int_match:
        old_menu_int = menu_int_match.group(1)
        new_keys = [
            'cashCards: string;',
            'generalReport: string;',
            'designCenter: string;',
            'labelDesigner: string;',
            'newBadge: string;'
        ]
        new_menu_int = old_menu_int.rstrip() + '\n  ' + '\n  '.join(new_keys) + '\n'
        content = content.replace(old_menu_int, new_menu_int)
    
    # Add to Translations interface
    trans_int_match = re.search(r'export interface Translations \{(.*?)\}', content, re.DOTALL)
    if trans_int_match:
        old_trans_int = trans_int_match.group(1)
        new_keys = [
            'loading: string;',
            'moduleLoadError: string;',
            'moduleLoadErrorMessage: string;',
            'backToDashboard: string;',
            'preparingModule: string;',
            'moduleUnderDevelopment: string;'
        ]
        new_trans_int = old_trans_int.rstrip() + '\n  ' + '\n  '.join(new_keys) + '\n'
        content = content.replace(old_trans_int, new_trans_int)

    # Data for each language
    data = {
        'tr': {
            'menu': {
                'cashCards': '"Kasa Kartları"',
                'generalReport': '"Genel Rapor"',
                'designCenter': '"Dizayn Merkezi"',
                'labelDesigner': '"Etiket Tasarımcı"',
                'newBadge': '"YENİ"'
            },
            'loading': '"Yükleniyor..."',
            'moduleLoadError': '"Modül Yükleme Hatası"',
            'moduleLoadErrorMessage': '"\\"{screenName}\\" ekranı yüklenirken bir hata oluştu."',
            'backToDashboard': '"Ana Panele Dön"',
            'preparingModule': '"\\"{screenName}\\" Modülü Hazırlanıyor"',
            'moduleUnderDevelopment': '"Bu modül şu anda geliştirme aşamasındadır ve yakında EX-ROSERP ekosistemine dahil edilecektir."'
        },
        'en': {
            'menu': {
                'cashCards': '"Cash Cards"',
                'generalReport': '"General Report"',
                'designCenter': '"Design Center"',
                'labelDesigner': '"Label Designer"',
                'newBadge': '"NEW"'
            },
            'loading': '"Loading..."',
            'moduleLoadError': '"Module Loading Error"',
            'moduleLoadErrorMessage': '"An error occurred while loading \\"{screenName}\\" screen."',
            'backToDashboard': '"Back to Dashboard"',
            'preparingModule': '"\\"{screenName}\\" Module is Being Prepared"',
            'moduleUnderDevelopment': '"This module is currently under development and will be included in the EX-ROSERP ecosystem soon."'
        },
        'ar': {
            'menu': {
                'cashCards': '"بطاقات الخزينة"',
                'generalReport': '"تقرير عام"',
                'designCenter': '"مركز التصميم"',
                'labelDesigner': '"مصمم الملصقات"',
                'newBadge': '"جديد"'
            },
            'loading': '"جاري التحميل..."',
            'moduleLoadError': '"خطأ في تحميل الوحدة"',
            'moduleLoadErrorMessage': '"حدث خطأ أثناء تحميل شاشة \\"{screenName}\\". Primetime"',
            'backToDashboard': '"العودة إلى لوحة القيادة"',
            'preparingModule': '"وحدة \\"{screenName}\\" قيد التحضير"',
            'moduleUnderDevelopment': '"هذه الوحدة قيد التطوير حاليًا وستدرج في نظام EX-ROSERP قريبًا."'
        },
        'ku': {
            'menu': {
                'cashCards': '"کارتەکانی کۆگا"',
                'generalReport': '"ڕاپۆرتی گشتی"',
                'designCenter': '"سەنتەری دیزاین"',
                'labelDesigner': '"دیزاینەری لێبڵ"',
                'newBadge': '"نوێ"'
            },
            'loading': '"خەریکی بارکردنە..."',
            'moduleLoadError': '"هەڵەی بارکردنی مۆدیۆل"',
            'moduleLoadErrorMessage': '"هەڵەیەک ڕوویدا لە کاتی بارکردنی شاشەی \\"{screenName}\\". "',
            'backToDashboard': '"بگەڕێرەوە بۆ داشبورد"', # Corrected spelling
            'preparingModule': '"مۆدیۆلی \\"{screenName}\\" لە ئامادەکردندایە"',
            'moduleUnderDevelopment': '"ئەم مۆدیۆلە ئێستا لە ژێر گەشەپێداندایە و بەم زووانە دەخرێتە ناو کۆمەڵەی EX-ROSERP."'
        }
    }

    # Add to each language object
    for lang in ['tr', 'en', 'ar', 'ku']:
        # Match the language block
        # lang: { ... }
        lang_pattern = rf'{lang}: \{{(.*?)\n  }},'
        lang_match = re.search(lang_pattern, content, re.DOTALL)
        if lang_match:
            block = lang_match.group(1)
            
            # Add to menu inside the block
            menu_pattern = r'menu: \{(.*?)\s+\},'
            menu_match = re.search(menu_pattern, block, re.DOTALL)
            if menu_match:
                old_menu = menu_match.group(1)
                mkeys = data[lang]['menu']
                new_menu = old_menu.rstrip() + '\n      ' + '\n      '.join([f'{k}: {v},' for k, v in mkeys.items()]) + '\n    '
                content = content.replace(old_menu, new_menu)
            
            # Add general keys to base of block
            gkeys = {k: v for k, v in data[lang].items() if k != 'menu'}
            new_block_end = '\n    ' + '\n    '.join([f'{k}: {v},' for k, v in gkeys.items()]) + '\n  '
            content = content.replace('\n  },', new_block_end + '},', 1) # This is risky with replacement, let's be more specific
            # Better: append before the closing brace of the lang block
            # Actually, I'll just use the lang_match.end()
            
    # Redoing lang block insertion for safety
    for lang in ['tr', 'en', 'ar', 'ku']:
        lang_match = re.search(rf'{lang}: \{{(.*?)\n  \}},', content, re.DOTALL)
        if lang_match:
            block = lang_match.group(1)
            gkeys = {k: v for k, v in data[lang].items() if k != 'menu'}
            insert_content = '\n    ' + '\n    '.join([f'{k}: {v},' for k, v in gkeys.items()]) + '\n  '
            # Find the LAST comma/newline before the final }
            content = content.replace(block + '\n  },', block + insert_content + '},')

    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

if __name__ == "__main__":
    add_keys()
