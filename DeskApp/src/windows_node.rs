//! Kurulum dizinindeki gömülü Node.js (runtime\node\node.exe) veya sistem Node.

use std::env;
use std::path::{Path, PathBuf};
use std::process::Command;

pub fn bundled_node_candidates(base: &Path) -> [PathBuf; 3] {
    [
        base.join("runtime").join("node").join("node.exe"),
        base.join("nodejs-runtime").join("node.exe"),
        base.join("node.exe"),
    ]
}

pub fn resolve_node_path() -> Option<PathBuf> {
    if let Ok(exe) = env::current_exe() {
        if let Some(base) = exe.parent() {
            for p in bundled_node_candidates(base) {
                if p.exists() {
                    return Some(p);
                }
            }
        }
    }

    for p in [
        PathBuf::from(r"C:\Program Files\nodejs\node.exe"),
        PathBuf::from(r"C:\Program Files (x86)\nodejs\node.exe"),
    ] {
        if p.exists() {
            return Some(p);
        }
    }

    if let Ok(local) = env::var("LOCALAPPDATA") {
        let nvm_current = PathBuf::from(&local).join(r"Programs\node\node.exe");
        if nvm_current.exists() {
            return Some(nvm_current);
        }
    }

    let out = Command::new("where").arg("node.exe").output().ok()?;
    if !out.status.success() {
        return None;
    }
    let first = String::from_utf8_lossy(&out.stdout)
        .lines()
        .next()?
        .trim()
        .to_string();
    if first.is_empty() {
        None
    } else {
        Some(PathBuf::from(first))
    }
}

pub fn resolve_npm_cmd() -> Option<PathBuf> {
    if let Some(node) = resolve_node_path() {
        if let Some(dir) = node.parent() {
            let npm = dir.join("npm.cmd");
            if npm.exists() {
                return Some(npm);
            }
        }
    }
    for p in [
        PathBuf::from(r"C:\Program Files\nodejs\npm.cmd"),
        PathBuf::from(r"C:\Program Files (x86)\nodejs\npm.cmd"),
    ] {
        if p.exists() {
            return Some(p);
        }
    }
    Some(PathBuf::from("npm.cmd"))
}
