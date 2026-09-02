#!/usr/bin/env python3
"""Append restaurant/delivery/takeaway i18n blocks to all 4 locale files.

Input: the existing locale file path + the locale code (tr, en, ar, ku).
Output: appends the JSON chunk as a sibling property after the parent object closes.
"""
import json
import sys

TRANSLATIONS = {
    'restaurant': None,  # will be filled per-locale
    'delivery': None,
    'takeaway': None,
}

# Helper to load translations file from the same dir as script
RESTAURANT_FILE = 'restaurant-i18n.json'

def main():
    for locale in ['tr', 'en', 'ar', 'ku']:
        target = f'src/i18n/locales/{locale}.json'
        with open(target, 'r', encoding='utf-8') as f:
            data = json.load(f)
        with open(RESTAURANT_FILE, 'r', encoding='utf-8') as f:
            blocks = json.load(f)
        # Merge
        for key in ['restaurant', 'delivery', 'takeaway']:
            if key in blocks:
                data[key] = blocks[key]
        with open(target, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.write('\n')
        # Validate
        with open(target, 'r', encoding='utf-8') as f:
            json.load(f)
        print(f'{target}: written OK')

if __name__ == '__main__':
    main()
