//! Portable güncelleme + config.db tabanlı migration (RetailEX_Tools).

use crate::config::AppConfig;
use rusqlite::Connection;
use serde::Deserialize;
use std::fs;
use std::io::{self, BufRead, Write};
use std::path::{Path, PathBuf};
use std::process::Command;

const GITHUB_REPO: &str = "ferhatdeveloper/RetailEX";
const CONFIG_DB: &str = r"C:\RetailEx\config.db";
const DEFAULT_GIT_REF: &str = "main";

#[derive(Debug, Deserialize)]
struct GhRelease {
    tag_name: String,
    assets: Vec<GhAsset>,
}

#[derive(Debug, Deserialize)]
struct GhAsset {
    name: String,
    browser_download_url: String,
    size: u64,
}

#[derive(Debug, Deserialize)]
struct GhContentItem {
    name: String,
    #[serde(rename = "type")]
    item_type: String,
    download_url: Option<String>,
    size: Option<u64>,
}

#[derive(Debug, Deserialize)]
struct GhRefObject {
    sha: String,
}

#[derive(Debug, Deserialize)]
struct GhGitRef {
    object: GhRefObject,
}

fn load_config_from_db() -> Result<AppConfig, String> {
    match crate::config::get_app_config_internal() {
        Ok(c) => Ok(c),
        Err(e) => Err(format!("config.db okunamadı ({}): {}", CONFIG_DB, e)),
    }
}

fn read_local_version(install_dir: &Path) -> String {
    let candidates = [
        install_dir.join("VERSION.txt"),
        install_dir.join("RetailEXTools").join("..").join("VERSION.txt"),
    ];
    for p in candidates {
        if let Ok(s) = fs::read_to_string(&p) {
            let v = s.lines().next().unwrap_or("").trim().to_string();
            if !v.is_empty() {
                return v;
            }
        }
    }
    "?".to_string()
}

fn parse_semver_parts(tag_or_ver: &str) -> Option<(u64, u64, u64)> {
    let t = tag_or_ver
        .trim()
        .trim_start_matches("portable-v")
        .trim_start_matches('v');
    let mut it = t.split('.');
    let a = it.next()?.parse().ok()?;
    let b = it.next()?.parse().ok()?;
    let c = it.next()?.parse().ok()?;
    Some((a, b, c))
}

fn version_gt(a: &str, b: &str) -> bool {
    match (parse_semver_parts(a), parse_semver_parts(b)) {
        (Some(x), Some(y)) => x > y,
        _ => a.trim() != b.trim() && !a.is_empty() && a != "?",
    }
}

fn confirm(prompt: &str) -> bool {
    print!("{} [E/h]: ", prompt);
    let _ = io::stdout().flush();
    let mut line = String::new();
    if io::stdin().lock().read_line(&mut line).is_err() {
        return false;
    }
    let t = line.trim().to_ascii_lowercase();
    t.is_empty() || t == "e" || t == "y" || t == "evet" || t == "yes"
}

fn is_retailex_running() -> bool {
    let out = Command::new("tasklist")
        .args(["/FI", "IMAGENAME eq retailex.exe", "/NH"])
        .output();
    match out {
        Ok(o) => {
            let s = String::from_utf8_lossy(&o.stdout).to_ascii_lowercase();
            s.contains("retailex.exe")
        }
        Err(_) => false,
    }
}

fn http_get_json(url: &str) -> Result<String, String> {
    let client = reqwest::blocking::Client::builder()
        .user_agent("RetailEX-Tools-Portable")
        .build()
        .map_err(|e| e.to_string())?;
    let res = client
        .get(url)
        .header("Accept", "application/vnd.github+json")
        .send()
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("HTTP {}: {}", res.status(), url));
    }
    res.text().map_err(|e| e.to_string())
}

fn find_latest_portable_release() -> Result<(String, GhAsset), String> {
    let url = format!(
        "https://api.github.com/repos/{}/releases?per_page=40",
        GITHUB_REPO
    );
    let body = http_get_json(&url)?;
    let releases: Vec<GhRelease> = serde_json::from_str(&body).map_err(|e| e.to_string())?;
    let mut best: Option<(String, GhAsset)> = None;
    for r in releases {
        if !r.tag_name.starts_with("portable-v") {
            continue;
        }
        let asset = r
            .assets
            .into_iter()
            .find(|a| a.name.starts_with("RetailEX-Portable-") && a.name.ends_with(".zip"));
        let Some(asset) = asset else { continue };
        let tag = r.tag_name.clone();
        match &best {
            None => best = Some((tag, asset)),
            Some((bt, _)) => {
                if version_gt(&tag, bt) {
                    best = Some((tag, asset));
                }
            }
        }
    }
    best.ok_or_else(|| {
        "GitHub'da portable-v* release / RetailEX-Portable-*.zip bulunamadı.".to_string()
    })
}

fn download_file(url: &str, dest: &Path) -> Result<(), String> {
    let client = reqwest::blocking::Client::builder()
        .user_agent("RetailEX-Tools-Portable")
        .build()
        .map_err(|e| e.to_string())?;
    let mut res = client.get(url).send().map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("İndirme HTTP {}", res.status()));
    }
    let mut f = fs::File::create(dest).map_err(|e| e.to_string())?;
    res.copy_to(&mut f).map_err(|e| e.to_string())?;
    Ok(())
}

fn http_get_bytes(url: &str) -> Result<Vec<u8>, String> {
    let client = reqwest::blocking::Client::builder()
        .user_agent("RetailEX-Tools-Portable")
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| e.to_string())?;
    let res = client.get(url).send().map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("HTTP {}: {}", res.status(), url));
    }
    res.bytes().map(|b| b.to_vec()).map_err(|e| e.to_string())
}

fn resolve_git_ref() -> String {
    std::env::var("RETAILEX_SQL_REF")
        .or_else(|_| std::env::var("GITHUB_REF_NAME"))
        .unwrap_or_else(|_| DEFAULT_GIT_REF.to_string())
}

fn migrations_target_dir(install_dir: &Path) -> PathBuf {
    install_dir.join("_up_").join("database").join("migrations")
}

fn is_numbered_sql(name: &str) -> bool {
    let Some(stem) = name.strip_suffix(".sql").or_else(|| name.strip_suffix(".SQL")) else {
        return false;
    };
    let Some(prefix) = stem.split('_').next() else {
        return false;
    };
    !prefix.is_empty() && prefix.chars().all(|c| c.is_ascii_digit())
}

fn github_head_sha(git_ref: &str) -> Result<String, String> {
    // branches/main or tags/portable-v...
    let url_branch = format!(
        "https://api.github.com/repos/{}/git/ref/heads/{}",
        GITHUB_REPO, git_ref
    );
    if let Ok(body) = http_get_json(&url_branch) {
        if let Ok(r) = serde_json::from_str::<GhGitRef>(&body) {
            return Ok(r.object.sha);
        }
    }
    let url_tag = format!(
        "https://api.github.com/repos/{}/git/ref/tags/{}",
        GITHUB_REPO, git_ref
    );
    let body = http_get_json(&url_tag)?;
    let r: GhGitRef = serde_json::from_str(&body).map_err(|e| e.to_string())?;
    Ok(r.object.sha)
}

/// GitHub `database/migrations` içeriğini yerel `_up_/database/migrations` altına yazar.
fn fetch_sql_from_github(install_dir: &Path, git_ref: &str) -> Result<(usize, String), String> {
    let dest = migrations_target_dir(install_dir);
    fs::create_dir_all(&dest).map_err(|e| format!("Klasör oluşturulamadı: {}", e))?;

    let list_url = format!(
        "https://api.github.com/repos/{}/contents/database/migrations?ref={}",
        GITHUB_REPO,
        urlencoding_lite(git_ref)
    );
    println!("GitHub SQL listesi: {}", list_url);
    let body = http_get_json(&list_url)?;
    let items: Vec<GhContentItem> =
        serde_json::from_str(&body).map_err(|e| format!("GitHub içerik JSON: {}", e))?;

    let mut sql_files: Vec<&GhContentItem> = items
        .iter()
        .filter(|i| i.item_type == "file" && is_numbered_sql(&i.name))
        .collect();
    sql_files.sort_by(|a, b| a.name.cmp(&b.name));

    if sql_files.is_empty() {
        return Err(
            "GitHub'da numaralı *.sql migration dosyası bulunamadı (database/migrations)."
                .to_string(),
        );
    }

    let sha = github_head_sha(git_ref).unwrap_or_else(|_| "?".to_string());
    let short = if sha.len() >= 7 { &sha[..7] } else { &sha };

    let mut ok = 0usize;
    let mut fail = 0usize;
    for item in &sql_files {
        let Some(url) = item.download_url.as_ref() else {
            eprintln!("  atlandı (download_url yok): {}", item.name);
            fail += 1;
            continue;
        };
        let target = dest.join(&item.name);
        print!(
            "  indiriliyor: {} ({})... ",
            item.name,
            item.size.unwrap_or(0)
        );
        let _ = io::stdout().flush();
        match http_get_bytes(url) {
            Ok(bytes) => {
                if let Err(e) = fs::write(&target, &bytes) {
                    eprintln!("yazma hatası: {}", e);
                    fail += 1;
                } else {
                    println!("OK");
                    ok += 1;
                }
            }
            Err(e) => {
                eprintln!("{}", e);
                fail += 1;
            }
        }
    }

    let meta = dest.join("MIGRATIONS_SOURCE.txt");
    let meta_body = format!(
        "repo={}\nref={}\nsha={}\nfetched={:?}\nfiles={}\n",
        GITHUB_REPO,
        git_ref,
        sha,
        std::time::SystemTime::now(),
        ok
    );
    let _ = fs::write(&meta, meta_body);

    if ok == 0 {
        return Err(format!(
            "Hiç SQL indirilemedi (başarısız={}). Ağ / GitHub rate limit kontrol edin.",
            fail
        ));
    }
    Ok((
        ok,
        format!(
            "SQL güncellendi: {} dosya → {} (ref={}, sha={}, hata={})",
            ok,
            dest.display(),
            git_ref,
            short,
            fail
        ),
    ))
}

/// Basit path segment encode (ref adı için).
fn urlencoding_lite(s: &str) -> String {
    let mut out = String::new();
    for c in s.chars() {
        match c {
            'A'..='Z' | 'a'..='z' | '0'..='9' | '-' | '_' | '.' | '~' => out.push(c),
            _ => {
                for b in c.to_string().as_bytes() {
                    out.push_str(&format!("%{:02X}", b));
                }
            }
        }
    }
    out
}

/// Yalnızca GitHub'dan SQL çek.
pub fn run_portable_fetch_sql(install_dir: &Path) -> i32 {
    println!("=== GitHub'dan güncel SQL (database/migrations) ===");
    let git_ref = resolve_git_ref();
    println!("Repo: {}  ref: {}", GITHUB_REPO, git_ref);
    println!(
        "Hedef: {}",
        migrations_target_dir(install_dir).display()
    );
    if !confirm("GitHub'dan SQL dosyaları indirilsin mi?") {
        return 0;
    }
    match fetch_sql_from_github(install_dir, &git_ref) {
        Ok((_n, msg)) => {
            println!("{}", msg);
            0
        }
        Err(e) => {
            eprintln!("{}", e);
            1
        }
    }
}

/// GitHub SQL çek + config.db üzerinden bekleyen migration uygula.
pub fn run_portable_sync_migrate(install_dir: &Path) -> i32 {
    println!("=== GitHub SQL + Migration ===");
    let git_ref = resolve_git_ref();
    println!("Repo: {}  ref: {}", GITHUB_REPO, git_ref);

    let config = match load_config_from_db() {
        Ok(c) => c,
        Err(e) => {
            eprintln!("{}", e);
            eprintln!("Önce RetailEX_Config.exe ile config.db ayarlayın.");
            return 1;
        }
    };

    if !confirm("GitHub'dan güncel SQL çekilip yeni migration'lar uygulansın mı?") {
        return 0;
    }

    match fetch_sql_from_github(install_dir, &git_ref) {
        Ok((_n, msg)) => println!("{}", msg),
        Err(e) => {
            eprintln!("{}", e);
            return 1;
        }
    }

    println!();
    println!("Bekleyen migration'lar uygulanıyor...");
    migrate_with_config(install_dir, &config, true)
}

fn expand_zip_overwrite(zip_path: &Path, dest_dir: &Path) -> Result<(), String> {
    // PowerShell Expand-Archive tek başına üzerine yazmaz; temp extract + robocopy.
    let temp = std::env::temp_dir().join(format!(
        "retailex_portable_extract_{}",
        std::process::id()
    ));
    if temp.exists() {
        let _ = fs::remove_dir_all(&temp);
    }
    fs::create_dir_all(&temp).map_err(|e| e.to_string())?;

    let zip_esc = zip_path.to_string_lossy().replace('\'', "''");
    let temp_esc = temp.to_string_lossy().replace('\'', "''");
    let expand = format!(
        "Expand-Archive -LiteralPath '{zip_esc}' -DestinationPath '{temp_esc}' -Force"
    );
    let st = Command::new("powershell.exe")
        .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", &expand])
        .status()
        .map_err(|e| e.to_string())?;
    if !st.success() {
        return Err(format!("Expand-Archive başarısız (kod {:?})", st.code()));
    }

    // Zip kökünde tek klasör varsa içeriğini kullan
    let mut source = temp.clone();
    if let Ok(entries) = fs::read_dir(&temp) {
        let dirs: Vec<_> = entries
            .filter_map(|e| e.ok())
            .filter(|e| e.path().is_dir())
            .collect();
        let files: Vec<_> = fs::read_dir(&temp)
            .into_iter()
            .flatten()
            .filter_map(|e| e.ok())
            .filter(|e| e.path().is_file())
            .collect();
        if dirs.len() == 1 && files.is_empty() {
            source = dirs[0].path();
        }
    }

    let dest_esc = dest_dir.to_string_lossy().replace('\'', "''");
    let src_esc = source.to_string_lossy().replace('\'', "''");
    // /E alt klasörler; /IS /IT üzerine yaz; config.db asla paket içinde olmamalı
    let robocopy = format!(
        "robocopy '{src_esc}' '{dest_esc}' /E /IS /IT /NFL /NDL /NJH /NJS /nc /ns /np; if ($LASTEXITCODE -ge 8) {{ exit $LASTEXITCODE }} else {{ exit 0 }}"
    );
    let st2 = Command::new("powershell.exe")
        .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", &robocopy])
        .status()
        .map_err(|e| e.to_string())?;
    let _ = fs::remove_dir_all(&temp);
    if !st2.success() {
        return Err(format!("robocopy başarısız (kod {:?})", st2.code()));
    }
    Ok(())
}

fn try_stop_services() {
    for name in [
        "RetailEX_Service",
        "RetailEX_SQL_Bridge",
        "RetailEX_Printer",
        "RetailEX_PostgREST",
    ] {
        let _ = Command::new("net").args(["stop", name]).status();
    }
}

fn try_start_services() {
    for name in [
        "RetailEX_Service",
        "RetailEX_SQL_Bridge",
        "RetailEX_Printer",
        "RetailEX_PostgREST",
    ] {
        let _ = Command::new("net").args(["start", name]).status();
    }
}

/// Menü: portable zip güncellemesi.
pub fn run_portable_update(install_dir: &Path) -> i32 {
    println!("=== RetailEX Portable Güncelleme ===");
    println!("Kurulum dizini: {}", install_dir.display());
    let local = read_local_version(install_dir);
    println!("Yerel sürüm (VERSION.txt): {}", local);

    let cfg = match load_config_from_db() {
        Ok(c) => c,
        Err(e) => {
            eprintln!("Uyarı: {} — yine de GitHub'dan devam.", e);
            AppConfig::default()
        }
    };
    let src = cfg.update_source.trim().to_ascii_lowercase();
    if !src.is_empty() && src != "github" && src != "central" {
        println!("update_source={} — portable güncelleme GitHub kullanır.", src);
    }
    if src == "central" {
        println!("Not: update_source=central henüz portable için uygulanmadı; GitHub kullanılacak.");
    }

    if is_retailex_running() {
        eprintln!("retailex.exe çalışıyor. Güncellemeden önce uygulamayı kapatın.");
        if !confirm("Yine de devam edilsin mi? (dosya kilitleri olabilir)") {
            return 1;
        }
    }

    println!();
    println!("ÖNEMLİ: Güncelleme öncesi PostgreSQL yedeği alın (Sistem Yönetimi veya pg_dump).");
    if !confirm("Yedek alındı / devam edilsin mi?") {
        println!("İptal.");
        return 0;
    }

    println!("GitHub portable release aranıyor...");
    let (tag, asset) = match find_latest_portable_release() {
        Ok(v) => v,
        Err(e) => {
            eprintln!("{}", e);
            return 1;
        }
    };
    let remote_ver = tag.trim_start_matches("portable-v");
    println!(
        "Bulunan: {} — {} ({:.1} MB)",
        tag,
        asset.name,
        asset.size as f64 / 1024.0 / 1024.0
    );

    if local != "?" && !version_gt(remote_ver, &local) && remote_ver == local {
        println!("Zaten güncel ({}).", local);
        if !confirm("Yine de yeniden kurulsun mu?") {
            return 0;
        }
    }

    if !confirm(&format!("{} indirilip kuruluma yazılsın mı?", asset.name)) {
        return 0;
    }

    let zip_path = std::env::temp_dir().join(&asset.name);
    println!("İndiriliyor: {}", asset.browser_download_url);
    if let Err(e) = download_file(&asset.browser_download_url, &zip_path) {
        eprintln!("İndirme hatası: {}", e);
        return 1;
    }
    println!("İndirildi: {}", zip_path.display());

    println!("Servisler durduruluyor (varsa)...");
    try_stop_services();

    println!("Paket açılıyor → {}", install_dir.display());
    if let Err(e) = expand_zip_overwrite(&zip_path, install_dir) {
        eprintln!("Kurulum hatası: {}", e);
        try_start_services();
        return 1;
    }
    let _ = fs::remove_file(&zip_path);

    // Tools kopyası RetailEXTools altında da olsun
    let tools_src = install_dir.join("RetailEX_Tools.exe");
    let tools_dst = install_dir.join("RetailEXTools").join("RetailEX_Tools.exe");
    if tools_src.exists() {
        let _ = fs::create_dir_all(tools_dst.parent().unwrap());
        let _ = fs::copy(&tools_src, &tools_dst);
    }

    println!("Servisler başlatılıyor (varsa)...");
    try_start_services();

    println!();
    println!("Güncelleme tamam. Yeni sürüm: {}", remote_ver);
    println!("Öneri: Migration için menüden 'Migration uygula' veya retailex.exe açın.");
    0
}

fn resolve_migrations_dir(install_dir: &Path) -> Result<PathBuf, String> {
    let preferred = migrations_target_dir(install_dir);
    let candidates = [
        preferred.clone(),
        install_dir.join("database").join("migrations"),
        install_dir.join("migrations"),
    ];
    for p in &candidates {
        if p.is_dir() {
            return Ok(p.clone());
        }
    }
    Err(format!(
        "Migration klasörü yok. Önce 'fetch-sql' veya portable zip kullanın. Beklenen: {}",
        preferred.display()
    ))
}

fn pg_endpoint(config: &AppConfig, prefer_remote: bool) -> (String, String, String, String, u16) {
    let use_remote = prefer_remote
        || config.db_mode.eq_ignore_ascii_case("online")
        || (config.db_mode.eq_ignore_ascii_case("hybrid") && prefer_remote);
    let (db_path, user, pass) = if use_remote {
        (
            config.remote_db.as_str(),
            config.pg_remote_user.as_str(),
            config.pg_remote_pass.as_str(),
        )
    } else {
        (
            config.local_db.as_str(),
            config.pg_local_user.as_str(),
            config.pg_local_pass.as_str(),
        )
    };
    let host_port = db_path.split('/').next().unwrap_or("127.0.0.1:5432");
    let host = host_port.split(':').next().unwrap_or("127.0.0.1").to_string();
    let port = host_port
        .split(':')
        .nth(1)
        .and_then(|p| p.parse().ok())
        .unwrap_or(5432);
    let db_name = db_path.split('/').last().unwrap_or("retailex_local").to_string();
    (host, user.to_string(), pass.to_string(), db_name, port)
}

async fn refresh_template_collation(client: &tokio_postgres::Client) {
    for db in ["postgres", "template1"] {
        if let Err(e) = client
            .batch_execute(&format!("ALTER DATABASE {} REFRESH COLLATION VERSION", db))
            .await
        {
            eprintln!("Collation refresh uyarısı ({}): {}", db, e);
        }
    }
}

fn is_collation_mismatch(e: &tokio_postgres::Error) -> bool {
    let s = e.to_string();
    s.contains("collation version mismatch") || s.contains("REFRESH COLLATION VERSION")
}

async fn create_database_async(
    host: &str,
    port: u16,
    user: &str,
    pass: &str,
    db_name: &str,
) -> Result<String, String> {
    use tokio_postgres::NoTls;

    let safe = db_name.replace('"', "");
    if safe.is_empty() || safe.contains(|c: char| !(c.is_ascii_alphanumeric() || c == '_' || c == '-')) {
        return Err(format!("Geçersiz veritabanı adı: {}", db_name));
    }

    let mut pg_config = tokio_postgres::Config::new();
    pg_config
        .host(host)
        .port(port)
        .user(user)
        .password(pass)
        .dbname("postgres")
        .connect_timeout(std::time::Duration::from_secs(15));

    let (client, connection) = pg_config
        .connect(NoTls)
        .await
        .map_err(|e| format!("Sistem DB (postgres) bağlantı: {}", e))?;
    tokio::spawn(async move {
        if let Err(e) = connection.await {
            eprintln!("connection error: {}", e);
        }
    });

    let rows = client
        .query("SELECT 1 FROM pg_database WHERE datname = $1", &[&safe])
        .await
        .map_err(|e| format!("DB kontrol: {}", e))?;

    if !rows.is_empty() {
        return Ok(format!("Veritabanı zaten var: {}", safe));
    }

    refresh_template_collation(&client).await;
    let create_sql = format!("CREATE DATABASE \"{}\"", safe);
    match client.execute(&create_sql, &[]).await {
        Ok(_) => Ok(format!("Veritabanı oluşturuldu: {}", safe)),
        Err(e) if is_collation_mismatch(&e) => {
            eprintln!("Collation uyumsuzluğu; template yenileniyor...");
            refresh_template_collation(&client).await;
            client
                .execute(&create_sql, &[])
                .await
                .map_err(|e2| format!("CREATE DATABASE: {}", e2))?;
            Ok(format!(
                "Veritabanı oluşturuldu (collation refresh sonrası): {}",
                safe
            ))
        }
        Err(e) => Err(format!("CREATE DATABASE: {}", e)),
    }
}

fn migrate_with_config(install_dir: &Path, config: &AppConfig, skip_confirm: bool) -> i32 {
    let migrations_dir = match resolve_migrations_dir(install_dir) {
        Ok(p) => p,
        Err(e) => {
            eprintln!("{}", e);
            return 1;
        }
    };
    println!("Migration dizini: {}", migrations_dir.display());
    println!("db_mode: {}", config.db_mode);

    let prefer_remote = config.db_mode.eq_ignore_ascii_case("online");
    let (host, user, pass, db_name, port) = pg_endpoint(config, prefer_remote);
    println!("Hedef PG: {}:{}/{} (kullanıcı {})", host, port, db_name, user);

    if !skip_confirm && !confirm("Bekleyen migration'lar uygulansın mı?") {
        return 0;
    }

    let rt = match tokio::runtime::Runtime::new() {
        Ok(r) => r,
        Err(e) => {
            eprintln!("tokio: {}", e);
            return 1;
        }
    };
    match rt.block_on(apply_migrations_async(
        &migrations_dir,
        &host,
        port,
        &user,
        &pass,
        &db_name,
        &read_local_version(install_dir),
    )) {
        Ok(msg) => {
            println!("{}", msg);
            0
        }
        Err(e) => {
            eprintln!("Migration hatası: {}", e);
            1
        }
    }
}

/// config.db → CREATE DATABASE (yoksa) + migration.
pub fn run_portable_setup_db(install_dir: &Path) -> i32 {
    println!("=== RetailEX DB oluştur + Migration ===");
    println!("Not: PostgreSQL sunucusu önceden kurulu olmalı (elle kurulum).");
    let config = match load_config_from_db() {
        Ok(c) => c,
        Err(e) => {
            eprintln!("{}", e);
            eprintln!("Önce RetailEX_Config.exe ile C:\\RetailEx\\config.db ayarlayın.");
            return 1;
        }
    };
    if !config.is_configured {
        eprintln!("config.db henüz yapılandırılmamış (is_configured=false).");
        if !confirm("Yine de denensin mi?") {
            return 1;
        }
    }

    let prefer_remote = config.db_mode.eq_ignore_ascii_case("online");
    let (host, user, pass, db_name, port) = pg_endpoint(&config, prefer_remote);
    println!("Hedef: {}:{}/{} (kullanıcı {})", host, port, db_name, user);
    println!("db_mode: {}", config.db_mode);

    if prefer_remote {
        println!();
        println!("Uyarı: online/uzak hedefte CREATE DATABASE genelde yetki gerektirir.");
        println!("Uzak DB genelde sunucuda önceden oluşturulur; yine de denenecek.");
    }

    if !confirm("Veritabanı yoksa oluşturulsun ve migration uygulansın mı?") {
        return 0;
    }

    if confirm("Önce GitHub'dan güncel SQL çekilsin mi? (önerilir)") {
        let git_ref = resolve_git_ref();
        match fetch_sql_from_github(install_dir, &git_ref) {
            Ok((_n, msg)) => println!("{}", msg),
            Err(e) => {
                eprintln!("SQL indirme: {}", e);
                if !confirm("Yerel SQL ile devam edilsin mi?") {
                    return 1;
                }
            }
        }
    }

    let rt = match tokio::runtime::Runtime::new() {
        Ok(r) => r,
        Err(e) => {
            eprintln!("tokio: {}", e);
            return 1;
        }
    };
    match rt.block_on(create_database_async(&host, port, &user, &pass, &db_name)) {
        Ok(msg) => println!("{}", msg),
        Err(e) => {
            eprintln!("{}", e);
            return 1;
        }
    }

    println!();
    println!("Migration başlıyor...");
    migrate_with_config(install_dir, &config, true)
}

/// config.db → PG migration (sys_migrations).
pub fn run_portable_migrate(install_dir: &Path) -> i32 {
    println!("=== RetailEX Migration (config.db) ===");
    let config = match load_config_from_db() {
        Ok(c) => c,
        Err(e) => {
            eprintln!("{}", e);
            eprintln!("RetailEX_Config.exe ile önce ayarlayın.");
            return 1;
        }
    };
    if !config.is_configured {
        eprintln!("config.db henüz yapılandırılmamış (is_configured=false).");
        if !confirm("Yine de denensin mi?") {
            return 1;
        }
    }
    migrate_with_config(install_dir, &config, false)
}

async fn apply_migrations_async(
    migrations_dir: &Path,
    host: &str,
    port: u16,
    user: &str,
    pass: &str,
    db_name: &str,
    app_version: &str,
) -> Result<String, String> {
    use tokio_postgres::NoTls;

    let mut pg_config = tokio_postgres::Config::new();
    pg_config
        .host(host)
        .port(port)
        .user(user)
        .password(pass)
        .dbname(db_name)
        .connect_timeout(std::time::Duration::from_secs(15));

    let (client, connection) = pg_config
        .connect(NoTls)
        .await
        .map_err(|e| format!("PG bağlantı: {}", e))?;
    tokio::spawn(async move {
        if let Err(e) = connection.await {
            eprintln!("connection error: {}", e);
        }
    });

    client
        .batch_execute(
            "CREATE TABLE IF NOT EXISTS sys_migrations (
                id SERIAL PRIMARY KEY,
                version VARCHAR(50) NOT NULL,
                name VARCHAR(255) NOT NULL UNIQUE,
                applied_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                app_version VARCHAR(50)
            );
            ALTER TABLE sys_migrations DROP CONSTRAINT IF EXISTS sys_migrations_version_key;
            ALTER TABLE sys_migrations ADD COLUMN IF NOT EXISTS app_version VARCHAR(50);
            CREATE SCHEMA IF NOT EXISTS auth;
            CREATE SCHEMA IF NOT EXISTS rest;
            CREATE SCHEMA IF NOT EXISTS beauty;",
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut migration_files: Vec<(String, String, PathBuf)> = Vec::new();
    let entries = fs::read_dir(migrations_dir).map_err(|e| e.to_string())?;
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) != Some("sql") {
            continue;
        }
        let filename = path
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_string();
        if let Some(version_part) = filename.split('_').next() {
            if version_part.chars().all(|c| c.is_ascii_digit()) && !version_part.is_empty() {
                migration_files.push((version_part.to_string(), filename, path));
            }
        }
    }
    migration_files.sort_by(|a, b| a.1.cmp(&b.1));

    let mut applied = 0usize;
    let mut skipped = 0usize;
    let mut errors = 0usize;

    for (version, name, path) in migration_files {
        let rows = client
            .query("SELECT 1 FROM sys_migrations WHERE name = $1", &[&name])
            .await
            .map_err(|e| e.to_string())?;
        if !rows.is_empty() {
            skipped += 1;
            continue;
        }
        // Demo seed Tools ile otomatik uygulanmaz
        if name.ends_with("_demo_data.sql") {
            println!("  atlandı (demo): {}", name);
            skipped += 1;
            continue;
        }
        println!("  uygulanıyor: {}", name);
        let raw = fs::read_to_string(&path).map_err(|e| format!("{}: {}", name, e))?;
        let sql = crate::sql_migration_split::strip_utf8_bom(&raw);
        let statements = crate::sql_migration_split::split_postgres_statements(sql);
        let mut failed = false;
        for (i, stmt) in statements.iter().enumerate() {
            let t = stmt.trim();
            if t.is_empty() {
                continue;
            }
            if let Err(e) = client.batch_execute(t).await {
                eprintln!("  HATA {} ifade {}: {}", name, i + 1, e);
                errors += 1;
                failed = true;
                break;
            }
        }
        if failed {
            continue;
        }
        client
            .execute(
                "INSERT INTO sys_migrations (version, name, app_version) VALUES ($1, $2, $3)",
                &[&version, &name, &app_version],
            )
            .await
            .map_err(|e| e.to_string())?;
        applied += 1;
    }

    Ok(format!(
        "Tamam: uygulanan={}, atlanan={}, hata={}",
        applied, skipped, errors
    ))
}

/// config.db özeti (teşhis).
pub fn print_config_summary() -> i32 {
    match load_config_from_db() {
        Ok(c) => {
            println!("config.db: {}", CONFIG_DB);
            println!("  is_configured: {}", c.is_configured);
            println!("  db_mode: {}", c.db_mode);
            println!("  local_db: {}", c.local_db);
            println!("  remote_db: {}", c.remote_db);
            println!("  update_source: {}", c.update_source);
            println!("  role: {}", c.role);
            // SQLite varlık kontrolü
            if Path::new(CONFIG_DB).exists() {
                if let Ok(conn) = Connection::open(CONFIG_DB) {
                    let _: Result<(), _> = conn.query_row(
                        "SELECT length(data) FROM config WHERE id = 1",
                        [],
                        |row| {
                            let n: i64 = row.get(0)?;
                            println!("  config JSON uzunluk: {}", n);
                            Ok(())
                        },
                    );
                }
            }
            0
        }
        Err(e) => {
            eprintln!("{}", e);
            1
        }
    }
}
