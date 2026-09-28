//! GitHub'dan `database/migrations` (000_master_schema dahil) indirme — kurulum sihirbazı + Tools.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

pub const GITHUB_REPO: &str = "ferhatdeveloper/RetailEX";
pub const DEFAULT_GIT_REF: &str = "main";

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

#[derive(Debug, Clone, Serialize)]
pub struct FetchMigrationsResult {
    pub ok: usize,
    pub fail: usize,
    pub git_ref: String,
    pub sha: String,
    pub path: String,
    pub has_master: bool,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct MigrationsSourceInfo {
    pub path: String,
    pub file_count: usize,
    pub has_master: bool,
    pub source: String,
    pub git_meta: Option<String>,
}

fn http_get_json(url: &str) -> Result<String, String> {
    let client = reqwest::blocking::Client::builder()
        .user_agent("RetailEX-Setup")
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| e.to_string())?;
    let res = client.get(url).send().map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("HTTP {}: {}", res.status(), url));
    }
    res.text().map_err(|e| e.to_string())
}

fn http_get_bytes(url: &str) -> Result<Vec<u8>, String> {
    let client = reqwest::blocking::Client::builder()
        .user_agent("RetailEX-Setup")
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| e.to_string())?;
    let res = client.get(url).send().map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("HTTP {}: {}", res.status(), url));
    }
    res.bytes().map(|b| b.to_vec()).map_err(|e| e.to_string())
}

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

pub fn is_numbered_sql(name: &str) -> bool {
    let Some(stem) = name.strip_suffix(".sql").or_else(|| name.strip_suffix(".SQL")) else {
        return false;
    };
    let Some(prefix) = stem.split('_').next() else {
        return false;
    };
    !prefix.is_empty() && prefix.chars().all(|c| c.is_ascii_digit())
}

pub fn dir_has_numbered_sql(path: &Path) -> bool {
    let Ok(entries) = fs::read_dir(path) else {
        return false;
    };
    entries.flatten().any(|e| {
        e.path()
            .file_name()
            .and_then(|s| s.to_str())
            .map(is_numbered_sql)
            .unwrap_or(false)
    })
}

pub fn count_numbered_sql(path: &Path) -> usize {
    let Ok(entries) = fs::read_dir(path) else {
        return 0;
    };
    entries
        .flatten()
        .filter(|e| {
            e.path()
                .file_name()
                .and_then(|s| s.to_str())
                .map(is_numbered_sql)
                .unwrap_or(false)
        })
        .count()
}

/// Kurulum / portable: `exe_dir/_up_/database/migrations` (yazılabilir).
pub fn migrations_fetch_dest_near_exe() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let dir = exe.parent()?;
    Some(dir.join("_up_").join("database").join("migrations"))
}

pub fn github_head_sha(git_ref: &str) -> Result<String, String> {
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

/// GitHub `database/migrations` → `dest` (numaralı *.sql, 000_master_schema dahil).
pub fn fetch_sql_from_github(dest: &Path, git_ref: &str) -> Result<FetchMigrationsResult, String> {
    fs::create_dir_all(dest).map_err(|e| format!("Klasör oluşturulamadı: {}", e))?;

    let list_url = format!(
        "https://api.github.com/repos/{}/contents/database/migrations?ref={}",
        GITHUB_REPO,
        urlencoding_lite(git_ref)
    );
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
    let mut has_master = false;
    for item in &sql_files {
        if item.name.starts_with("000_master_schema") {
            has_master = true;
        }
        let Some(url) = item.download_url.as_ref() else {
            fail += 1;
            continue;
        };
        let target = dest.join(&item.name);
        match http_get_bytes(url) {
            Ok(bytes) => {
                if fs::write(&target, &bytes).is_ok() {
                    ok += 1;
                } else {
                    fail += 1;
                }
            }
            Err(_) => fail += 1,
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

    let message = format!(
        "SQL güncellendi: {} dosya → {} (ref={}, sha={}, master={}, hata={})",
        ok,
        dest.display(),
        git_ref,
        short,
        if has_master { "var" } else { "yok" },
        fail
    );

    Ok(FetchMigrationsResult {
        ok,
        fail,
        git_ref: git_ref.to_string(),
        sha: short.to_string(),
        path: dest.display().to_string(),
        has_master,
        message,
    })
}

pub fn migrations_source_info_at(path: &Path) -> MigrationsSourceInfo {
    let file_count = count_numbered_sql(path);
    let has_master = match fs::read_dir(path) {
        Ok(entries) => entries.flatten().any(|e| {
            e.file_name()
                .to_string_lossy()
                .starts_with("000_master_schema")
        }),
        Err(_) => false,
    };
    let git_meta = fs::read_to_string(path.join("MIGRATIONS_SOURCE.txt")).ok();
    let source = if git_meta.is_some() {
        "github".to_string()
    } else if file_count > 0 {
        "local".to_string()
    } else {
        "empty".to_string()
    };
    MigrationsSourceInfo {
        path: path.display().to_string(),
        file_count,
        has_master,
        source,
        git_meta,
    }
}

#[tauri::command]
pub async fn fetch_migrations_from_github(
    app: tauri::AppHandle,
    git_ref: Option<String>,
) -> Result<FetchMigrationsResult, String> {
    let git_ref = git_ref
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| DEFAULT_GIT_REF.to_string());

    let dest = migrations_fetch_dest_near_exe().ok_or_else(|| {
        "Kurulum dizini (exe yolu) çözülemedi — SQL indirme hedefi yok.".to_string()
    })?;

    let _ = app; // keep handle for future resource fallback
    tokio::task::spawn_blocking(move || fetch_sql_from_github(&dest, &git_ref))
        .await
        .map_err(|e| format!("SQL indirme görevi: {}", e))?
}

#[tauri::command]
pub async fn get_migrations_source_info(app: tauri::AppHandle) -> Result<MigrationsSourceInfo, String> {
    // Prefer writable Git fetch dir if it has SQL; else first resolve hit
    if let Some(dest) = migrations_fetch_dest_near_exe() {
        if dest.exists() && dir_has_numbered_sql(&dest) {
            return Ok(migrations_source_info_at(&dest));
        }
    }
    match crate::db_ops::resolve_migrations_dir(&app) {
        Ok(p) => Ok(migrations_source_info_at(&p)),
        Err(e) => Ok(MigrationsSourceInfo {
            path: e,
            file_count: 0,
            has_master: false,
            source: "missing".to_string(),
            git_meta: None,
        }),
    }
}

/// Kurulum UI için önerilen ref listesi (sabit + env).
#[tauri::command]
pub async fn list_sql_git_ref_presets() -> Result<Vec<String>, String> {
    let mut refs = vec![
        "main".to_string(),
        "master".to_string(),
    ];
    if let Ok(v) = std::env::var("RETAILEX_SQL_REF") {
        let v = v.trim().to_string();
        if !v.is_empty() && !refs.iter().any(|r| r == &v) {
            refs.insert(0, v);
        }
    }
    Ok(refs)
}
