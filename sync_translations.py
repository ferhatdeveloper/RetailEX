import re
import os

def get_interface_keys(content):
    match = re.search(r'export interface Translations \{(.*?)\n\}', content, re.DOTALL)
    if not match: return []
    return re.findall(r'^\s+([a-zA-Z0-9_]+)\s*:', match.group(1), re.MULTILINE)

def get_menu_keys(content):
    match = re.search(r'export interface MenuTranslations \{(.*?)\n\}', content, re.DOTALL)
    if not match: return []
    return re.findall(r'^\s+([a-zA-Z0-9_]+)\s*:', match.group(1), re.MULTILINE)

def extract_lang_obj(content, lang):
    start_pattern = rf'^\s+{lang}: \{{'
    lines = content.splitlines()
    start_index = -1
    for i, line in enumerate(lines):
        if re.match(start_pattern, line):
            start_index = i
            break
    if start_index == -1: return {}
    
    brace_count = 0
    obj_lines = []
    for line in lines[start_index:]:
        brace_count += line.count('{')
        brace_count -= line.count('}')
        obj_lines.append(line)
        if brace_count == 0: break
            
    obj_content = "\n".join(obj_lines)
    res = {}
    # Top level keys
    keys_vals = re.findall(r'^\s+([a-zA-Z0-9_]+)\s*:\s*(.*?),?$', obj_content, re.MULTILINE)
    for k, v in keys_vals:
        if k == lang: continue
        res[k] = v.strip()
    
    # Menu object
    menu_match = re.search(r'menu: \{(.*?)\}', obj_content, re.DOTALL)
    if menu_match:
        menu_content = menu_match.group(1)
        m_keys_vals = re.findall(r'^\s+([a-zA-Z0-9_]+)\s*:\s*(.*?),?$', menu_content, re.MULTILINE)
        res['menu'] = {k: v.strip() for k, v in m_keys_vals}
    return res

def main():
    file_path = 'd:/RetailEX/src/locales/translations.ts'
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    interface_keys = get_interface_keys(content)
    menu_keys = get_menu_keys(content)
    
    trs = {l: extract_lang_obj(content, l) for l in ['tr', 'en', 'ar', 'ku']}
    
    new_content = []
    # Keep everything before 'export const translations'
    meta_match = re.search(r'(.*?export const translations: any = \{)', content, re.DOTALL)
    if meta_match:
        new_content.append(meta_match.group(1))
    
    for lang in ['tr', 'en', 'ar', 'ku']:
        new_content.append(f"  {lang}: {{")
        obj = trs[lang]
        
        # We want to maintain some order, let's use interface_keys order
        # for top level, except menu which we handle specifically
        for k in interface_keys:
            if k == 'menu':
                new_content.append("    menu: {")
                m_obj = obj.get('menu', {})
                for mk in menu_keys:
                    # Find any translation for this subkey in other languages if missing
                    val = m_obj.get(mk)
                    if not val:
                        # Search in others
                        for o_lang in ['tr', 'en', 'ar', 'ku']:
                            if mk in trs[o_lang].get('menu', {}):
                                val = trs[o_lang]['menu'][mk]
                                break
                    if not val: val = f"'{mk}'" 
                    new_content.append(f"      {mk}: {val},")
                new_content.append("    },")
            else:
                val = obj.get(k)
                if not val:
                    # Search in others
                    for o_lang in ['tr', 'en', 'ar', 'ku']:
                        if k in trs[o_lang]:
                            val = trs[o_lang][k]
                            break
                if not val: val = f"'{k}'"
                new_content.append(f"    {k}: {val},")
        new_content.append("  },")
    
    new_content.append("};")
    
    with open('d:/RetailEX/synced_translations.ts', 'w', encoding='utf-8') as f:
        f.write("\n".join(new_content))

if __name__ == "__main__":
    main()
