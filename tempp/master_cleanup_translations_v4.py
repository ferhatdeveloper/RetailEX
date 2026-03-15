import re

def parse_string(content, start_idx):
    """Parses a string starting at start_idx and returns (string_content, next_idx)."""
    quote = content[start_idx]
    if quote not in ('"', "'"):
        return None, start_idx
    
    idx = start_idx + 1
    result = [quote]
    escaped = False
    
    while idx < len(content):
        char = content[idx]
        result.append(char)
        if escaped:
            escaped = False
        elif char == '\\':
            escaped = True
        elif char == quote:
            return "".join(result), idx + 1
        idx += 1
    return "".join(result), idx

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

    # Language Extraction
    langs = ['tr', 'en', 'ar', 'ku']
    lang_data = {l: {'menu': {}, 'sidebar': {}, 'root': {}} for l in langs}

    for lang in langs:
        lang_start_pattern = rf'^\s+{lang}: \{{'
        lang_start_match = re.search(lang_start_pattern, content, re.MULTILINE)
        if lang_start_match:
            start_index = lang_start_match.end()
            depth = 1
            idx = start_index
            while depth > 0 and idx < len(content):
                if content[idx] == '{': depth += 1
                elif content[idx] == '}': depth -= 1
                idx += 1
            block = content[start_index:idx-1]
            
            # Helper to extract from block using parse_string
            def extract_from_subblock(sub_content):
                results = {}
                i = 0
                while i < len(sub_content):
                    # Find key: [a-zA-Z0-9_]+ followed by :
                    key_match = re.search(r'([a-zA-Z0-9_]+)\s*:', sub_content[i:])
                    if not key_match:
                        break
                    key = key_match.group(1)
                    val_start = i + key_match.end()
                    # Skip whitespace
                    while val_start < len(sub_content) and sub_content[val_start].isspace():
                        val_start += 1
                    
                    if val_start < len(sub_content) and sub_content[val_start] in ('"', "'"):
                        val, next_i = parse_string(sub_content, val_start)
                        results[key] = val
                        i = next_i
                    else:
                        i = val_start + 1
                return results

            # Sidebar
            sidebar_match = re.search(r'sidebar: \{(.*?)\s+\},', block, re.DOTALL)
            if sidebar_match:
                lang_data[lang]['sidebar'] = extract_from_subblock(sidebar_match.group(1))

            # Menu
            menu_match = re.search(r'menu: \{(.*?)\s+\},', block, re.DOTALL)
            if menu_match:
                lang_data[lang]['menu'] = extract_from_subblock(menu_match.group(1))
            
            # Root
            root_part = re.sub(r'sidebar: \{.*?\n\s+\},', '', block, flags=re.DOTALL)
            root_part = re.sub(r'menu: \{.*?\n\s+\},', '', root_part, flags=re.DOTALL)
            lang_data[lang]['root'] = extract_from_subblock(root_part)

    # Standardize keys
    all_sidebar_keys = sorted(list(set(sidebar_int_keys + [k for l in langs for k in lang_data[l]['sidebar']])))
    all_menu_keys = sorted(list(set(menu_int_keys + [k for l in langs for k in lang_data[l]['menu']])))
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
