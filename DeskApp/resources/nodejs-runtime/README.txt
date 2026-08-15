Gömülü Node.js (Windows x64) — SQL Bridge ve Printer servisi
============================================================

Bu klasördeki node.exe / npm dosyalari repoda tutulmaz. Üretmek için kök dizinde
(Windows, tauri:build / GitHub Actions):

  npm run node-runtime:fetch

NSIS kurulumu `runtime\node\` olarak INSTDIR'e kopyalar. Müşteri PC'de ayrı
Node.js kurulumu gerekmez. better-sqlite3 native oldugu icin node_modules da
ayni adimda DeskApp/resources/node_modules altina uretilir.

Sürüm: NODE_RUNTIME_VERSION (varsayilan scripts/bundle-windows-node-runtime.mjs)
