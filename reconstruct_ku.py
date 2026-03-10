import re

def extract_obj(content, lang):
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
    # Extract top level keys
    keys_vals = re.findall(r'^\s+([a-zA-Z0-9_]+)\s*:\s*(.*?),?$', obj_content, re.MULTILINE)
    res = {}
    for k, v in keys_vals:
        if k == lang: continue
        res[k] = v.strip()
    
    # Extract menu content specifically
    menu_match = re.search(r'menu: \{(.*?)\}', obj_content, re.DOTALL)
    if menu_match:
        menu_content = menu_match.group(1)
        menu_keys_vals = re.findall(r'^\s+([a-zA-Z0-9_]+)\s*:\s*(.*?),?$', menu_content, re.MULTILINE)
        res['menu_obj'] = {k: v.strip() for k, v in menu_keys_vals}
        
    return res

def main():
    file_path = 'd:/RetailEX/src/locales/translations.ts'
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    en_obj = extract_obj(content, 'en')
    ku_obj = extract_obj(content, 'ku')
    
    # Reconstruct ku
    final_ku_lines = ["  ku: {"]
    
    # Get all interface keys from en_obj (except menu_obj)
    # Actually, let's just use the list of keys we saw in the view_file for en
    # or use all keys from en_obj.
    
    # Sort keys to maintain some order, but ideally follow en's order
    # Let's get the order from en
    en_lines = content.splitlines()
    en_start = -1
    for i, line in enumerate(en_lines):
        if 'en: {' in line:
            en_start = i
            break
    
    brace_count = 0
    en_keys_ordered = []
    for line in en_lines[en_start:]:
        m = re.match(r'^\s+([a-zA-Z0-9_]+)\s*:', line)
        if m:
            k = m.group(1)
            if k != 'en' and k not in en_keys_ordered:
                en_keys_ordered.append(k)
        brace_count += line.count('{')
        brace_count -= line.count('}')
        if brace_count == 0: break

    for k in en_keys_ordered:
        if k == 'menu':
            final_ku_lines.append("    menu: {")
            # Merge menu keys
            en_menu = en_obj.get('menu_obj', {})
            ku_menu = ku_obj.get('menu_obj', {})
            # Use tr menu as better base for names if available? No, en is fine.
            # But let's actually get ALL keys from tr menu too since it might have more.
            # For simplicity, use en_menu keys as master list.
            for mk in en_menu.keys():
                val = ku_menu.get(mk, en_menu[mk])
                final_ku_lines.append(f"      {mk}: {val},")
            final_ku_lines.append("    },")
        else:
            val = ku_obj.get(k, en_obj.get(k, "'TODO'"))
            # Special case for selfEmployedReceiptGiven which I know exists in ku
            if k == 'selfEmployedReceiptGiven' and 'پسووڵەی کاری سەربەخۆ' not in val:
                # Search for it in ku_obj if it moved
                pass
            final_ku_lines.append(f"    {k}: {val},")
            
    final_ku_lines.append("  }")
    
    output = "\n".join(final_ku_lines)
    print(output)

if __name__ == "__main__":
    main()
