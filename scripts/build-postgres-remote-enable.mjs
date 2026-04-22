/**
 * NSIS / kurulum: RetailEX_PostgreSQLRemote.exe icin release derlemesi.
 * tools/postgresql-remote-enable (Rust) — Windows'ta tauri:build oncesi calisir.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const cwd = path.join(root, "tools", "postgresql-remote-enable");

const r = spawnSync("cargo", ["build", "--release"], {
  cwd,
  stdio: "inherit",
  shell: process.platform === "win32",
});
const code = r.status ?? 1;
if (code !== 0) {
  console.error("build-postgres-remote-enable: cargo basarisiz");
  process.exit(code);
}
console.log("build-postgres-remote-enable: tamam");
