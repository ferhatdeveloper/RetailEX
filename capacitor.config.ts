import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.retailex.app',
  appName: 'RetailEX',
  webDir: 'build',
  server: {
    androidScheme: 'https',
  },
};

export default config;
