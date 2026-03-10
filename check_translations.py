import re

def get_keys_from_interface(file_content):
    match = re.search(r'export interface Translations \{(.*?)\n\}', file_content, re.DOTALL)
    if not match:
        return []
    interface_content = match.group(1)
    # This is a bit naive but should work for simple interfaces
    keys = re.findall(r'^\s+([a-zA-Z0-9_]+)\s*:', interface_content, re.MULTILINE)
    return keys

def get_keys_from_object(file_content, lang):
    # Find the object for the language
    pattern = rf'{lang}: \{{(.*?)\n  \}},'
    match = re.search(pattern, file_content, re.DOTALL)
    if not match:
        # Try without trailing comma or with different indentation
        pattern = rf'{lang}: \{{(.*?)\n\s+\}}'
        match = re.search(pattern, file_content, re.DOTALL)
        if not match:
            return []
    obj_content = match.group(1)
    keys = re.findall(r'^\s+([a-zA-Z0-9_]+)\s*:', obj_content, re.MULTILINE)
    return keys

def main():
    with open('d:/RetailEX/src/locales/translations.ts', 'r', encoding='utf-8') as f:
        content = f.read()
    
    interface_keys = set(get_keys_from_interface(content))
    print(f"Total interface keys: {len(interface_keys)}")
    
    for lang in ['tr', 'en', 'ar', 'ku']:
        lang_keys = set(get_keys_from_object(content, lang))
        missing = interface_keys - lang_keys
        extra = lang_keys - interface_keys
        print(f"\nLanguage: {lang}")
        print(f"Missing keys: {len(missing)}")
        if missing:
            print(f"Sample missing: {list(missing)[:10]}")
        print(f"Extra keys: {len(extra)}")
        if extra:
            print(f"Sample extra: {list(extra)[:10]}")

if __name__ == "__main__":
    main()
