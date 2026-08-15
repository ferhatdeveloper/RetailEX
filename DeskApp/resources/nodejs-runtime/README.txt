Gömülü Node.js (Windows x64) — SQL Bridge ve Printer servisi
============================================================

Bu klasörde yalnizca node.exe üretilir (tam Node/npm agaci NSIS'i kiriyor).
Kök dizinde (Windows, tauri:build / GitHub Actions):

  npm run node-runtime:fetch

NSIS kurulumu `runtime\node\node.exe` olarak INSTDIR'e kopyalar. Bridge
bagimliliklari `DeskApp/resources/node_modules` altina ayni adimda kurulur.

Sürüm: NODE_RUNTIME_VERSION (varsayilan scripts/bundle-windows-node-runtime.mjs)
