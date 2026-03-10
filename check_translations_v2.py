import re

def get_keys_from_interface(file_content):
    match = re.search(r'export interface Translations \{(.*?)\n\}', file_content, re.DOTALL)
    if not match:
        return []
    interface_content = match.group(1)
    keys = re.findall(r'^\s+([a-zA-Z0-9_]+)\s*:', interface_content, re.MULTILINE)
    return keys

def get_keys_from_object(file_content, lang):
    # Find the object for the language
    # Language objects are like '  tr: {'
    start_pattern = rf'^\s+{lang}: \{{'
    lines = file_content.splitlines()
    start_index = -1
    for i, line in enumerate(lines):
        if re.match(start_pattern, line):
            start_index = i
            break
    
    if start_index == -1:
        return []
    
    # Find the closing brace for this specific object
    brace_count = 0
    obj_lines = []
    for line in lines[start_index:]:
        brace_count += line.count('{')
        brace_count -= line.count('}')
        obj_lines.append(line)
        if brace_count == 0:
            break
            
    obj_content = "\n".join(obj_lines)
    keys = re.findall(r'^\s+([a-zA-Z0-9_]+)\s*:', obj_content, re.MULTILINE)
    # Exclude the language key itself
    if keys and keys[0] == lang:
        keys = keys[1:]
    return keys

def main():
    with open('d:/RetailEX/src/locales/translations.ts', 'r', encoding='utf-8') as f:
        content = f.read()
    
    interface_keys = set(get_keys_from_interface(content))
    print(f"Total interface keys: {len(interface_keys)}")
    
    for lang in ['tr', 'en', 'ar', 'ku']:
        lang_keys = set(get_keys_from_object(content, lang))
        missing = sorted(list(interface_keys - lang_keys))
        extra = sorted(list(lang_keys - interface_keys))
        print(f"\nLanguage: {lang}")
        print(f"Missing keys ({len(missing)}): {missing}")
        print(f"Extra keys ({len(extra)}): {extra}")

if __name__ == "__main__":
    main()
