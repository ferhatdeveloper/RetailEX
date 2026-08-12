/**
 * RetailOS Scanner Service - Windows Service Installer
 * Node-Windows kullanarak Windows Service olarak kurulum
 */

const Service = require('node-windows').Service;
const path = require('path');

// Service tanımla
const svc = new Service({
  name: 'RetailOS Scanner Service',
  description: 'RetailOS TWAIN/WIA Tarayıcı WebSocket Servisi',
  script: path.join(__dirname, 'server.js'),
  nodeOptions: [
    '--max_old_space_size=4096'
  ],
  env: [
    {
      name: 'NODE_ENV',
      value: 'production'
    },
    {
      name: 'SCANNER_PORT',
      value: '9999'
    },
    {
      name: 'SCANNER_HOST',
      value: 'localhost'
    }
  ],
  workingDirectory: __dirname,
  allowServiceLogon: true
});

// Event listeners
svc.on('install', () => {
  console.log('✅ RetailOS Scanner Service başarıyla kuruldu!');
  console.log('');
  console.log('Servisi başlatmak için:');
  console.log('  net start "RetailOS Scanner Service"');
  console.log('');
  console.log('Veya Windows Services (services.msc) üzerinden başlatabilirsiniz.');
  console.log('');
  
  // Servisi otomatik başlat
  svc.start();
});

svc.on('alreadyinstalled', () => {
  console.log('⚠️  RetailOS Scanner Service zaten kurulu!');
  console.log('');
  console.log('Önce kaldırın:');
  console.log('  npm run uninstall-service');
});

svc.on('start', () => {
  console.log('✅ RetailOS Scanner Service başlatıldı!');
  console.log(`   WebSocket URL: ws://localhost:9999/scan`);
});

svc.on('error', (err) => {
  console.error('❌ Hata:', err);
});

// Kurulumu başlat
console.log('RetailOS Scanner Service kuruluyor...');
console.log('');
svc.install();

