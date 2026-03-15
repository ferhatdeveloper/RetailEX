import os, sys, subprocess
sys.stdout.reconfigure(encoding='utf-8')

intentional = {
    'src/services/postgres.ts','src/services/voiceService.ts','src/services/api/kasa.ts',
    'src/services/websocket.ts','src/App.tsx',
    'src/components/accounting/bank-ops/BankRegisterManagement.tsx',
    'src/services/fieldSalesService.ts','src/components/system/Login.tsx',
    'src/components/system/ManagementModule.tsx','src/components/system/RoleManagement.tsx',
    'src/components/pos/MarketPOS.tsx','src/components/trading/invoices/InvoiceListModule.tsx',
    'src/components/inventory/products/ProductAnalyticsDashboard.tsx',
    'src/components/scale/CashierScale.tsx','src/components/shared/AppFooter.tsx',
    'src/components/system/CentralDashboard.tsx','src/components/system/DashboardModule.tsx',
    'src/components/system/RemoteControlGrid.tsx','src/components/system/RemoteViewer.tsx',
    'src/components/system/SettingsPanel.tsx','src/components/system/SetupWizard.tsx',
    'src/components/system/SystemMonitoringModule.tsx',
}

def is_broken(path):
    with open(path, 'rb') as f:
        data = f.read()
    if b'\xef\xbf\xbd' in data:
        return True
    try:
        data.decode('utf-8')
        return False
    except:
        return True

to_restore = []
for root, dirs, files in os.walk('src'):
    for fname in files:
        if not fname.endswith(('.ts', '.tsx', '.css')):
            continue
        full = os.path.join(root, fname)
        path = full.replace(os.sep, '/')
        if path in intentional:
            continue
        if is_broken(full):
            to_restore.append(path)

print(f'Restore edilecek: {len(to_restore)} dosya')
failed = []
for p in to_restore:
    r = subprocess.run(['git', 'checkout', 'HEAD', '--', p], capture_output=True)
    if r.returncode != 0:
        failed.append((p, r.stderr.decode(errors='replace')))

if failed:
    print(f'Basarisiz: {len(failed)}')
    for p, err in failed[:5]:
        print(f'  {p}: {err}')
else:
    print('Tum dosyalar basariyla restore edildi')
