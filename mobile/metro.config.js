const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

/** Yapı süzgeci kök `src/utils` içindedir; APK paketi bu dosyayı da alır. */
config.watchFolders = [path.resolve(projectRoot, '../src/utils')];

module.exports = config;
