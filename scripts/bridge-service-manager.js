import { Service } from 'node-windows';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Root directory
const rootDir = path.resolve(__dirname, '..');

// Create a new service object
const svc = new Service({
  name: 'RetailEX_SQL_Bridge',
  description: 'RetailEX PostgreSQL Bridge for Browser Connectivity',
  script: path.join(rootDir, 'dist', 'bridge.cjs'),
  nodeOptions: [
    '--no-warnings'
  ],
  workingDirectory: rootDir,
  env: [
    {
      name: 'NODE_ENV',
      value: 'production'
    }
  ]
});

// Listen for the "install" event, which indicates the
// process is available as a service.
svc.on('install', function () {
  console.log('✅ Service installed successfully!');
  svc.start();
});

// Listen for the "alreadyinstalled" event
svc.on('alreadyinstalled', function () {
  console.log('ℹ️ Service is already installed.');
  svc.start();
});

// Listen for the "start" event
svc.on('start', function () {
  console.log('🚀 Service started! The Bridge is now running in the background.');
});

// Handle uninstallation
if (process.argv.includes('--uninstall')) {
  svc.uninstall();
  svc.on('uninstall', function () {
    console.log('🗑️ Service uninstalled successfully.');
  });
} else if (process.argv.includes('--status')) {
  console.log('Status: ', svc.exists ? 'Installed' : 'Not Installed');
} else {
  console.log('Installing service...');
  svc.install();
}
