Gömülü Node.js (Windows x64) — SQL Bridge ve Printer servisi
============================================================

Bu klasörde yalnizca node.exe üretilir (zip'ten tek dosya; tam Node/npm
agaci NSIS ve Expand-Archive MAX_PATH ile kiriyor).

Kök dizinde (Windows, tauri:build / GitHub Actions):

  npm run node-runtime:fetch

NSIS kurulumu `runtime\node\node.exe` olarak INSTDIR'e kopyalar. Bridge
bagimliliklari (pg/hono, native yok) `DeskApp/resources/node_modules`
altina ayni adimda kurulur. better-sqlite3 istege baglidir; derleme
basarisiz olsa masaüstü NSIS durmaz.

Sürüm: NODE_RUNTIME_VERSION (varsayilan scripts/bundle-windows-node-runtime.mjs)
