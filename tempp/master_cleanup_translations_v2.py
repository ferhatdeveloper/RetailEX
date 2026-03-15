import re

def extract_translations():
    path = 'd:/RetailEX/src/locales/translations.ts'
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Extract SidebarTranslations interface keys
    sidebar_int_match = re.search(r'export interface SidebarTranslations \{(.*?)\}', content, re.DOTALL)
    sidebar_int_keys = []
    if sidebar_int_match:
        sidebar_int_keys = [k.strip() for k in re.findall(r'^\s+([a-zA-Z0-9_]+)\s*:', sidebar_int_match.group(1), re.MULTILINE)]

    # Extract MenuTranslations interface keys
    menu_int_match = re.search(r'export interface MenuTranslations \{(.*?)\}', content, re.DOTALL)
    menu_int_keys = []
    if menu_int_match:
        menu_int_keys = [k.strip() for k in re.findall(r'^\s+([a-zA-Z0-9_]+)\s*:', menu_int_match.group(1), re.MULTILINE)]

    # Extract Translations interface keys
    trans_int_match = re.search(r'export interface Translations \{(.*?)\}', content, re.DOTALL)
    trans_int_keys = []
    if trans_int_match:
        trans_int_keys = [k.strip() for k in re.findall(r'^\s+([a-zA-Z0-9_]+)\s*:', trans_int_match.group(1), re.MULTILINE)]

    # Improved Regex for values: handles escaped quotes and internal quotes of different types
    val_regex = r'([a-zA-Z0-9_]+)\s*:\s*((["\'])(?:(?!\3).|\\\3)*\3)'

    # Language Extraction
    langs = ['tr', 'en', 'ar', 'ku']
    lang_data = {l: {'menu': {}, 'sidebar': {}, 'root': {}} for l in langs}

    for lang in langs:
        match = re.search(rf'^\s+{lang}: \{{(.*?)\n  }},', content, re.MULTILINE | re.DOTALL)
        if match:
            block = match.group(1)
            
            # Sidebar
            sidebar_match = re.search(r'sidebar: \{(.*?)\s+\},', block, re.DOTALL)
            if sidebar_match:
                sidebar_items = re.findall(val_regex, sidebar_match.group(1))
                for k, v, _ in sidebar_items:
                    lang_data[lang]['sidebar'][k] = v

            # Menu
            menu_match = re.search(r'menu: \{(.*?)\s+\},', block, re.DOTALL)
            if menu_match:
                menu_items = re.findall(val_regex, menu_match.group(1))
                for k, v, _ in menu_items:
                    lang_data[lang]['menu'][k] = v
            
            # Root
            root_part = re.sub(r'sidebar: \{.*?\s+\},', '', block, flags=re.DOTALL)
            root_part = re.sub(r'menu: \{.*?\s+\},', '', root_part, flags=re.DOTALL)
            root_items = re.findall(val_regex, root_part, re.MULTILINE)
            for k, v, _ in root_items:
                lang_data[lang]['root'][k] = v

    # Standardize keys
    all_sidebar_keys = sorted(list(set(sidebar_int_keys + [k for l in langs for k in lang_data[l]['sidebar']])))
    all_menu_keys = sorted(list(set(menu_int_keys + [k for l in langs for k in lang_data[l]['menu']])))
    all_root_keys = sorted(list(set([k for k in trans_int_keys if k not in ['menu', 'sidebar']] + [k for l in langs for k in lang_data[l]['root']])))
    all_root_keys = [k for k in all_root_keys if k not in ['menu', 'sidebar']]

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
            val = lang_data[lang]['sidebar'].get(k)
            if not val: val = lang_data['en']['sidebar'].get(k) or f'"{k}"'
            new_content.append(f"      {k}: {val},")
        new_content.append("    },")
        
        # Menu
        new_content.append("    menu: {")
        for k in all_menu_keys:
            val = lang_data[lang]['menu'].get(k)
            if not val: val = lang_data['en']['menu'].get(k) or f'"{k}"'
            new_content.append(f"      {k}: {val},")
        new_content.append("    },")
        
        # Root
        for k in all_root_keys:
            val = lang_data[lang]['root'].get(k)
            if not val: val = lang_data['en']['root'].get(k) or f'"{k}"'
            new_content.append(f"    {k}: {val},")
        
        new_content.append("  },")
        
    new_content.append("};")

    with open(path, 'w', encoding='utf-8') as f:
        f.write("\n".join(new_content))

if __name__ == "__main__":
    extract_translations()
