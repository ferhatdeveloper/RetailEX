import re

def extract_translations():
    path = 'd:/RetailEX/src/locales/translations.ts'
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Improved Regex for values: handles escaped quotes better
    # Matches "..." or '...' and handles backslash escapes
    val_regex = r'([a-zA-Z0-9_]+)\s*:\s*("(?:\\.|[^"])*"|\'(?:\\.|[^\'])*\')'

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

    # Language Extraction
    langs = ['tr', 'en', 'ar', 'ku']
    lang_data = {l: {'menu': {}, 'sidebar': {}, 'root': {}} for l in langs}

    for lang in langs:
        # Match language block - more robust matching
        # lang: { ... }, but skipping nested curly braces
        # We find the lang start and then find the matching closing brace
        lang_start_pattern = rf'^\s+{lang}: \{{'
        lang_start_match = re.search(lang_start_pattern, content, re.MULTILINE)
        if lang_start_match:
            start_index = lang_start_match.end()
            # Find the matching closing brace
            depth = 1
            idx = start_index
            while depth > 0 and idx < len(content):
                if content[idx] == '{': depth += 1
                elif content[idx] == '}': depth -= 1
                idx += 1
            block = content[start_index:idx-1]
            
            # Sidebar
            sidebar_match = re.search(r'sidebar: \{(.*?)\s+\},', block, re.DOTALL)
            if sidebar_match:
                sidebar_items = re.findall(val_regex, sidebar_match.group(1))
                for k, v in sidebar_items:
                    lang_data[lang]['sidebar'][k] = v

            # Menu
            menu_match = re.search(r'menu: \{(.*?)\s+\},', block, re.DOTALL)
            if menu_match:
                menu_items = re.findall(val_regex, menu_match.group(1))
                for k, v in menu_items:
                    lang_data[lang]['menu'][k] = v
            
            # Root - removing menu and sidebar blocks first
            root_part = re.sub(r'sidebar: \{.*?\n\s+\},', '', block, flags=re.DOTALL)
            root_part = re.sub(r'menu: \{.*?\n\s+\},', '', root_part, flags=re.DOTALL)
            root_items = re.findall(val_regex, root_part, re.MULTILINE)
            for k, v in root_items:
                lang_data[lang]['root'][k] = v

    # Standardize keys
    all_sidebar_keys = sorted(list(set(sidebar_int_keys + [k for l in langs for k in lang_data[l]['sidebar']])))
    all_menu_keys = sorted(list(set(menu_int_keys + [k for l in langs for k in lang_data[l]['menu']])))
    
    # Root keys should be all keys in Translations interface minus sidebar/menu, plus any extra found ones
    interface_root_keys = [k for k in trans_int_keys if k not in ['menu', 'sidebar']]
    extra_root_keys = [k for l in langs for k in lang_data[l]['root'] if k not in interface_root_keys]
    all_root_keys = sorted(interface_root_keys + extra_root_keys)

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
            # Default to English if missing, otherwise use key itself
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
local_path = 'd:/RetailEX/master_cleanup_translations_v3.py'
