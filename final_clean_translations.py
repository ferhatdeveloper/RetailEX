import re

def clean_translations():
    path = 'd:/RetailEX/src/locales/translations.ts'
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Split into meta and translations object
    match = re.search(r'(.*?export const translations: any = \{)(.*?)(\};$)', content, re.DOTALL)
    if not match:
        print("Could not find translations object")
        return
    
    meta = match.group(1)
    body = match.group(2)
    footer = match.group(3)
    
    # Separate languages
    langs = ['tr', 'en', 'ar', 'ku']
    lang_blocks = {}
    
    for i, lang in enumerate(langs):
        start_pattern = rf'^\s+{lang}: \{{'
        match_start = re.search(start_pattern, body, re.MULTILINE)
        if not match_start: continue
        
        # Find the matching closing brace for the language object
        start_idx = match_start.start()
        brace_count = 0
        end_idx = -1
        for j in range(start_idx, len(body)):
            if body[j] == '{': brace_count += 1
            elif body[j] == '}': 
                brace_count -= 1
                if brace_count == 0:
                    end_idx = j + 1
                    break
        if end_idx != -1:
            lang_blocks[lang] = body[start_idx:end_idx]
            
    new_body = ""
    for lang in langs:
        if lang not in lang_blocks: continue
        block = lang_blocks[lang]
        
        # Inside each block, we might have multiple 'menu: {'
        # and duplicate keys.
        
        # Strategy: Extract all keys (including the FIRST menu object)
        # and rebuild.
        
        lines = block.splitlines()
        kv = {}
        menu_kv = {}
        in_menu = False
        
        for line in lines:
            # Check for top level key
            m = re.match(r'^\s+([a-zA-Z0-9_]+)\s*:\s*(.*?),?$', line)
            if m:
                k, v = m.group(1), m.group(2).strip()
                if k == lang: continue
                if k == 'menu':
                    in_menu = True
                    continue
                if not in_menu:
                    kv[k] = v
                else:
                    # We are inside a menu, but is it the first or second?
                    # The parser here is simple, let's just keep track of keys.
                    pass
            
            # Check for menu key
            if in_menu:
                mm = re.match(r'^\s+([a-zA-Z0-9_]+)\s*:\s*(.*?),?$', line)
                if mm:
                    mk, mv = mm.group(1), mm.group(2).strip()
                    if mk not in menu_kv:
                        menu_kv[mk] = mv
            
            if '}' in line and in_menu:
                # Assuming simple structure where menu has no nested objs
                if line.strip() == '},' or line.strip() == '}':
                    in_menu = False
        
        # Now rebuild lang block
        new_lang_block = [f"  {lang}: {{"]
        # Add menu first (as per interface)
        new_lang_block.append("    menu: {")
        for mk in sorted(menu_kv.keys()):
            new_lang_block.append(f"      {mk}: {menu_kv[mk]},")
        new_lang_block.append("    },")
        
        # Add other keys
        for k in sorted(kv.keys()):
            new_lang_block.append(f"    {k}: {kv[k]},")
        new_lang_block.append("  },")
        
        new_body += "\n".join(new_lang_block) + "\n"
        
    with open(path, 'w', encoding='utf-8') as f:
        f.write(meta + "\n" + new_body + footer)

if __name__ == "__main__":
    clean_translations()
