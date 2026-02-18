/**
 * Windows Servis Kurulum Scripti
 * RetailOS Scanner Service'i Windows servisi olarak kurar
 */

const Service = require('node-windows').Service;
const path = require('path');

// Servis oluştur
const svc = new Service({
  name: 'RetailOS Scanner Service',
  description: 'RetailOS için TWAIN/WIA tarayıcı entegrasyon servisi',
  script: path.join(__dirname, 'server.js'),
  nodeOptions: [
    '--harmony',
    '--max_old_space_size=4096'
  ],
  env: [
    {
      name: "NODE_ENV",
      value: "production"
    },
    {
      name: "PORT",
      value: "9999"
    }
  ]
});

// Servis yüklendiğinde
svc.on('install', function() {
  console.log('✅ RetailOS Scanner Service başarıyla kuruldu');
  console.log('ğŸš€ Servis başlatılıyor...');
  svc.start();
});

// Servis başladığında
svc.on('start', function() {
  console.log('✅ Servis çalışıyor');
  console.log('ğŸ“¡ WebSocket: ws://localhost:9999/scan');
});

// Servisi kur
console.log('ğŸ“¦ RetailOS Scanner Service kuruluyor...');
console.log('⚙️  Bu işlem yönetici izni gerektirir');
svc.install();

