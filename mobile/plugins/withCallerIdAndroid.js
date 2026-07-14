/**
 * Expo config plugin — Android Caller ID CallStateReceiver + RN bridge modülü.
 * Expo Go'da çalışmaz; `npx expo prebuild` / EAS dev|preview|production gerekir.
 *
 * @param {import('expo/config-plugins').ExpoConfig} config
 */
const {
  withAndroidManifest,
  withMainApplication,
  withDangerousMod,
  AndroidConfig,
} = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const PERMS = [
  'android.permission.READ_PHONE_STATE',
  'android.permission.READ_CALL_LOG',
  'android.permission.READ_CONTACTS',
];

function copyKotlinSources(projectRoot) {
  const srcDir = path.join(projectRoot, 'native-modules', 'caller-id', 'android');
  const destDir = path.join(
    projectRoot,
    'android',
    'app',
    'src',
    'main',
    'java',
    'app',
    'retailex',
    'mobile',
    'callerid',
  );
  if (!fs.existsSync(srcDir)) {
    console.warn('[withCallerIdAndroid] native sources missing:', srcDir);
    return;
  }
  fs.mkdirSync(destDir, { recursive: true });
  for (const file of fs.readdirSync(srcDir)) {
    if (!file.endsWith('.kt')) continue;
    fs.copyFileSync(path.join(srcDir, file), path.join(destDir, file));
  }
}

function withCallerIdPermissions(config) {
  return AndroidConfig.Permissions.withPermissions(config, PERMS);
}

function withCallerIdManifest(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults;
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
    app.receiver = app.receiver || [];
    const exists = app.receiver.some(
      (r) => r.$?.['android:name'] === '.callerid.CallStateReceiver',
    );
    if (!exists) {
      app.receiver.push({
        $: {
          'android:name': '.callerid.CallStateReceiver',
          'android:exported': 'true',
          'android:enabled': 'true',
        },
        'intent-filter': [
          {
            action: [{ $: { 'android:name': 'android.intent.action.PHONE_STATE' } }],
          },
        ],
      });
    }
    return cfg;
  });
}

function withCallerIdMainApplication(config) {
  return withMainApplication(config, (cfg) => {
    let contents = cfg.modResults.contents;
    const pkgImport = 'import app.retailex.mobile.callerid.RetailExCallerIdPackage';
    if (!contents.includes(pkgImport)) {
      contents = contents.replace(
        /^(package\s+[\w.]+)/m,
        `$1\n\n${pkgImport}`,
      );
    }
    if (!contents.includes('RetailExCallerIdPackage()')) {
      if (contents.includes('PackageList(this).packages.apply')) {
        contents = contents.replace(
          /PackageList\(this\)\.packages\.apply\s*\{/,
          `PackageList(this).packages.apply {\n              add(RetailExCallerIdPackage())`,
        );
      } else if (contents.includes('packages.add(')) {
        contents = contents.replace(
          /packages\.add\(/,
          `packages.add(RetailExCallerIdPackage())\n            packages.add(`,
        );
      } else {
        console.warn(
          '[withCallerIdAndroid] could not inject RetailExCallerIdPackage — add manually in MainApplication',
        );
      }
    }
    cfg.modResults.contents = contents;
    return cfg;
  });
}

function withCallerIdSources(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      copyKotlinSources(cfg.modRequest.projectRoot);
      return cfg;
    },
  ]);
}

function withCallerIdAndroid(config) {
  config = withCallerIdPermissions(config);
  config = withCallerIdManifest(config);
  config = withCallerIdMainApplication(config);
  config = withCallerIdSources(config);
  return config;
}

module.exports = withCallerIdAndroid;
