import os, sys, subprocess
from difflib import SequenceMatcher
sys.stdout.reconfigure(encoding='utf-8')

repl = '\ufffd'

# Bu dosyalarda sadece __TAURI__ -> __TAURI_INTERNALS__ degisikligi yapilmisti
tauri_fix_files = [
    'src/services/postgres.ts',
    'src/components/system/SettingsPanel.tsx',
    'src/components/system/DashboardModule.tsx',
    'src/components/system/CentralDashboard.tsx',
    'src/components/scale/CashierScale.tsx',
    'src/components/inventory/products/ProductAnalyticsDashboard.tsx',
]

for path in tauri_fix_files:
    with open(path, 'rb') as f:
        data = f.read()
    try:
        data.decode('utf-8')
        print(f'OK (zaten temiz): {path}')
        continue
    except:
        pass
    # HEAD'den al ve __TAURI__ -> __TAURI_INTERNALS__ uygula
    r = subprocess.run(['git', 'show', f'HEAD:{path}'], capture_output=True)
    if r.returncode != 0:
        print(f'FAIL (git): {path}')
        continue
    head_content = r.stdout.decode('utf-8', errors='replace')
    fixed = head_content.replace('__TAURI__', '__TAURI_INTERNALS__')
    with open(path, 'w', encoding='utf-8') as f:
        f.write(fixed)
    print(f'FIXED: {path}')

# MarketPOS.tsx ve InvoiceListModule.tsx - fuzzy fix
fuzzy_files = [
    'src/components/pos/MarketPOS.tsx',
    'src/components/trading/invoices/InvoiceListModule.tsx',
]

def similarity(a, b):
    return SequenceMatcher(None, a, b).ratio()

for path in fuzzy_files:
    with open(path, 'r', encoding='utf-8', errors='replace') as f:
        current = f.readlines()

    r = subprocess.run(['git', 'show', f'HEAD:{path}'], capture_output=True)
    head_lines = r.stdout.decode('utf-8', errors='replace').splitlines(keepends=True)

    fixed = 0
    for i, cur in enumerate(current):
        if repl not in cur:
            continue
        cur_stripped = cur.replace(repl, '').strip()
        best_score = 0.0
        best_line = None
        for hl in head_lines:
            sc = similarity(cur_stripped, hl.strip())
            if sc > best_score:
                best_score = sc
                best_line = hl
        if best_score > 0.55 and best_line:
            current[i] = best_line.replace('__TAURI__', '__TAURI_INTERNALS__')
            fixed += 1

    with open(path, 'w', encoding='utf-8') as f:
        f.writelines(current)

    remaining = sum(1 for l in current if repl in l)
    print(f'FIXED {path}: {fixed} satir, kalan bozuk: {remaining}')
