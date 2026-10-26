//! Dil JSON dosyaları — yalnızca `mobile/src/i18n/locales` altı.

use serde::Serialize;
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};

const ROOTS: &[(&str, &str)] = &[("mobile-i18n", "mobile/src/i18n/locales")];

#[derive(Serialize)]
struct LocaleFileDto {
    file: String,
    language: String,
}

#[derive(Serialize)]
struct LocaleRootDto {
    id: String,
    relative: String,
    files: Vec<LocaleFileDto>,
    missing: bool,
}

#[derive(Serialize)]
struct LocaleCatalogDto {
    roots: Vec<LocaleRootDto>,
    writable: bool,
}

fn is_lang_code(value: &str) -> bool {
    let bytes = value.as_bytes();
    (2..=3).contains(&bytes.len()) && bytes.iter().all(|byte| byte.is_ascii_lowercase())
}

fn is_lang_token(value: &str) -> bool {
    if let Some((lang, rest)) = value.split_once('-') {
        return is_lang_code(lang)
            && !rest.is_empty()
            && rest.len() <= 12
            && rest.chars().all(|ch| ch.is_ascii_alphanumeric());
    }
    is_lang_code(value)
}

fn is_json_leaf(file: &str) -> bool {
    let Some(stem) = file.strip_suffix(".json") else {
        return false;
    };
    if stem.is_empty() || stem.len() > 41 {
        return false;
    }
    let mut chars = stem.chars();
    let Some(first) = chars.next() else {
        return false;
    };
    first.is_ascii_alphabetic()
        && chars.all(|ch| ch.is_ascii_alphanumeric() || ch == '_' || ch == '-')
}

fn is_safe_relative(file: &str) -> bool {
    if file.is_empty()
        || file.contains("..")
        || file.contains('\\')
        || file.contains('\0')
        || file.starts_with('/')
        || file.starts_with('.')
    {
        return false;
    }
    if let Some((dir, leaf)) = file.split_once('/') {
        return !file[dir.len() + 1..].contains('/') && is_lang_token(dir) && is_json_leaf(leaf);
    }
    let Some(stem) = file.strip_suffix(".json") else {
        return false;
    };
    is_lang_token(stem)
}

fn find_repo_root() -> Option<PathBuf> {
    let mut starts = Vec::new();
    if let Ok(cwd) = std::env::current_dir() {
        starts.push(cwd);
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            starts.push(dir.to_path_buf());
        }
    }
    for start in starts {
        let mut current = Some(start);
        for _ in 0..10 {
            let Some(dir) = current else { break };
            if dir.join("mobile/src/i18n/locales").is_dir() {
                return Some(dir);
            }
            current = dir.parent().map(|parent| parent.to_path_buf());
        }
    }
    None
}

fn root_rel(root_key: &str) -> Result<&'static str, String> {
    ROOTS
        .iter()
        .find(|(key, _)| *key == root_key)
        .map(|(_, rel)| *rel)
        .ok_or_else(|| "İzin verilmeyen kök".to_string())
}

fn confine(repo: &Path, root_key: &str, file: &str) -> Result<PathBuf, String> {
    if !is_safe_relative(file) {
        return Err("Dil klasörü dışında yazılamaz".into());
    }
    let rel = root_rel(root_key)?;
    let root = repo.join(rel);
    let root = root
        .canonicalize()
        .map_err(|_| "Dil klasörü bulunamadı".to_string())?;
    let target = root.join(file);
    let parent = target
        .parent()
        .ok_or_else(|| "Dil klasörü bulunamadı".to_string())?;
    let parent_real = parent
        .canonicalize()
        .map_err(|_| "Dil klasörü bulunamadı".to_string())?;
    if !parent_real.starts_with(&root) {
        return Err("Dil klasörü dışında yazılamaz".into());
    }
    if let Ok(meta) = fs::symlink_metadata(&target) {
        if meta.file_type().is_symlink() || !meta.is_file() {
            return Err("Dil klasörü dışında yazılamaz".into());
        }
    }
    if target.exists() {
        let real = target.canonicalize().map_err(|err| err.to_string())?;
        if !real.starts_with(&root) {
            return Err("Dil klasörü dışında yazılamaz".into());
        }
        return Ok(target);
    }
    if !target.starts_with(&root) {
        return Err("Dil klasörü dışında yazılamaz".into());
    }
    Ok(target)
}

fn language_of(file: &str) -> String {
    if let Some((dir, _)) = file.split_once('/') {
        return dir.to_string();
    }
    file.strip_suffix(".json").unwrap_or(file).to_string()
}

fn list_root(dir: &Path) -> Vec<LocaleFileDto> {
    let mut files = Vec::new();
    let Ok(entries) = fs::read_dir(dir) else {
        return files;
    };
    let mut names: Vec<_> = entries.filter_map(|entry| entry.ok()).collect();
    names.sort_by_key(|entry| entry.file_name());
    for entry in names {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.contains("..") || name.contains('/') || name.contains('\\') {
            continue;
        }
        let path = entry.path();
        let Ok(meta) = fs::symlink_metadata(&path) else {
            continue;
        };
        if meta.file_type().is_symlink() {
            continue;
        }
        if meta.is_file() && is_safe_relative(&name) {
            files.push(LocaleFileDto {
                language: language_of(&name),
                file: name,
            });
            continue;
        }
        if meta.is_dir() && is_lang_token(&name) {
            let Ok(children) = fs::read_dir(&path) else {
                continue;
            };
            let mut kids: Vec<_> = children.filter_map(|child| child.ok()).collect();
            kids.sort_by_key(|child| child.file_name());
            for child in kids {
                let child_name = child.file_name().to_string_lossy().to_string();
                let rel = format!("{name}/{child_name}");
                let Ok(child_meta) = fs::symlink_metadata(child.path()) else {
                    continue;
                };
                if child_meta.file_type().is_symlink() || !child_meta.is_file() {
                    continue;
                }
                if is_safe_relative(&rel) {
                    files.push(LocaleFileDto {
                        language: name.clone(),
                        file: rel,
                    });
                }
            }
        }
    }
    files
}

#[tauri::command]
pub fn list_locale_json_files() -> Result<LocaleCatalogDto, String> {
    let Some(repo) = find_repo_root() else {
        return Ok(LocaleCatalogDto {
            roots: ROOTS
                .iter()
                .map(|(id, relative)| LocaleRootDto {
                    id: (*id).to_string(),
                    relative: (*relative).to_string(),
                    files: Vec::new(),
                    missing: true,
                })
                .collect(),
            writable: false,
        });
    };
    let mut roots = Vec::new();
    for (id, relative) in ROOTS {
        let dir = repo.join(relative);
        if !dir.is_dir() {
            roots.push(LocaleRootDto {
                id: (*id).to_string(),
                relative: (*relative).to_string(),
                files: Vec::new(),
                missing: true,
            });
            continue;
        }
        roots.push(LocaleRootDto {
            id: (*id).to_string(),
            relative: (*relative).to_string(),
            files: list_root(&dir),
            missing: false,
        });
    }
    let writable = roots.iter().any(|root| !root.missing);
    Ok(LocaleCatalogDto { roots, writable })
}

#[tauri::command]
pub fn read_locale_json(root: String, file: String) -> Result<Value, String> {
    let repo = find_repo_root().ok_or_else(|| "Dil klasörü bulunamadı".to_string())?;
    let target = confine(&repo, &root, &file)?;
    let text = fs::read_to_string(&target).map_err(|_| "Dil dosyası bulunamadı".to_string())?;
    Ok(serde_json::json!({ "root": root, "file": file, "text": text }))
}

#[tauri::command]
pub fn write_locale_json(root: String, file: String, text: String) -> Result<Value, String> {
    let repo = find_repo_root().ok_or_else(|| "Dil klasörü bulunamadı".to_string())?;
    let mut body = text;
    if body.starts_with('\u{feff}') {
        body = body.trim_start_matches('\u{feff}').to_string();
    }
    let parsed: Value = serde_json::from_str(&body).map_err(|_| "Geçersiz JSON".to_string())?;
    if !parsed.is_object() {
        return Err("Dil dosyası nesne olmalı".into());
    }
    if !body.ends_with('\n') {
        body.push('\n');
    }
    let target = confine(&repo, &root, &file)?;
    fs::write(&target, body.as_bytes()).map_err(|err| err.to_string())?;
    Ok(serde_json::json!({ "ok": true, "root": root, "file": file }))
}
