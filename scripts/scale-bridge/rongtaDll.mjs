/**
 * Windows: rtslabelscale.dll köprüsü (TeraziRongta / RongtaDllBridge.exe).
 * C# Form1 ile aynı akış: Connect → (Clear) → DownLoadPLU (4/paket) → DownLoadHotkey → Disconnect
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function bridgeExeCandidates() {
  const root = join(__dirname, '..', '..');
  return [
    join(__dirname, 'rongta-dll-bridge', 'bin', 'x86', 'Release', 'RongtaDllBridge.exe'),
    join(__dirname, 'rongta-dll-bridge', 'bin', 'x86', 'Debug', 'RongtaDllBridge.exe'),
    join(root, 'TeraziRongta', 'WindowsFormsApplication1', 'bin', 'x86', 'Release', 'RongtaDllBridge.exe'),
    join(process.env.ProgramFiles || 'C:\\Program Files', 'RetailEX', 'ScaleBridge', 'scale-bridge', 'rongta-dll-bridge', 'RongtaDllBridge.exe'),
    join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'RetailEX', 'ScaleBridge', 'scale-bridge', 'rongta-dll-bridge', 'RongtaDllBridge.exe'),
    join(process.env.ProgramFiles || 'C:\\Program Files', 'RetailEX', 'ScaleBridge', 'rongta-dll-bridge', 'RongtaDllBridge.exe'),
  ].filter(Boolean);
}

export function resolveRongtaDllBridgeExe() {
  if (process.platform !== 'win32') return null;
  return bridgeExeCandidates().find((p) => existsSync(p)) || null;
}

export function resolveRongtaSystemCfg() {
  const exe = resolveRongtaDllBridgeExe();
  if (!exe) return null;
  const cfg = join(dirname(exe), 'SYSTEM.CFG');
  return existsSync(cfg) ? cfg : null;
}

export function isRongtaDllBridgeAvailable() {
  return !!resolveRongtaDllBridgeExe();
}

export function shouldUseRongtaDll(config = {}) {
  if (process.platform !== 'win32') return false;
  const mode = String(config.scaleBackend || process.env.SCALE_BRIDGE_BACKEND || 'auto').toLowerCase();
  if (mode === 'tcp') return false;
  if (mode === 'dll') return isRongtaDllBridgeAvailable();
  return isRongtaDllBridgeAvailable();
}

function invokeBridge(payload, timeoutMs = 120000) {
  const exe = resolveRongtaDllBridgeExe();
  if (!exe) {
    return Promise.reject(new Error('RongtaDllBridge.exe bulunamadi (Windows + rtslabelscale.dll gerekli)'));
  }

  return new Promise((resolve, reject) => {
    const child = spawn(exe, [], {
      windowsHide: true,
      cwd: dirname(exe),
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('RongtaDllBridge zaman asimi'));
    }, timeoutMs);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (c) => { stdout += c; });
    child.stderr.on('data', (c) => { stderr += c; });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      try {
        const trimmed = stdout.trim();
        const json = trimmed ? JSON.parse(trimmed) : {};
        if (code !== 0 && json.success === undefined && json.ok === undefined) {
          json.success = false;
          json.ok = false;
          json.message = json.message || stderr || `RongtaDllBridge cikis kodu ${code}`;
        }
        resolve(json);
      } catch (e) {
        reject(new Error(stderr || stdout || (e instanceof Error ? e.message : 'JSON parse hatasi')));
      }
    });

    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}

export async function rongtaDllPing() {
  return invokeBridge({ command: 'ping' }, 15000);
}

export async function rongtaDllTest(ipAddress) {
  const json = await invokeBridge({ command: 'test', ipAddress });
  return {
    ok: !!(json.ok ?? json.success),
    success: !!(json.ok ?? json.success),
    message: json.message,
    displayText: json.displayText,
    weight: json.weight,
    backend: 'rtslabelscale.dll',
  };
}

export async function rongtaDllClearPlu(ipAddress) {
  const json = await invokeBridge({ command: 'clear-plu', ipAddress });
  return {
    success: !!json.success,
    message: json.message || '',
    backend: 'rtslabelscale.dll',
  };
}

export async function rongtaDllSendPlu(ipAddress, records, options = {}) {
  const json = await invokeBridge({
    command: 'send-plu',
    ipAddress,
    records,
    clearBeforeSend: options.clearBeforeSend === true,
    sendHotkeys: options.sendHotkeys !== false,
    hotkeyMode: options.hotkeyMode || 'auto',
  });
  return {
    success: !!json.success,
    message: json.message || '',
    sentCount: json.sentCount,
    failedCount: json.failedCount,
    hotkeysSent: json.hotkeysSent,
    errors: json.errors,
    backend: 'rtslabelscale.dll',
  };
}

export async function rongtaDllFetchSales(ipAddress, options = {}) {
  const json = await invokeBridge({
    command: 'upload-sales',
    ipAddress,
    clearData: options.clearData === true,
  }, Number(options.timeoutMs) || 120000);
  return {
    success: !!json.success,
    message: json.message || '',
    count: json.count,
    records: json.records,
    backend: 'rtslabelscale.dll',
  };
}
