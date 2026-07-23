//! RetailEX_PostgreSQLRemote.exe — kurulum dizinindeki pg-windows-expose-remote.ps1 dosyasını
//! yönetici (UAC) ile çalıştırır.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::{Path, PathBuf};
use std::process::Command;

fn install_dir() -> PathBuf {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()))
        .unwrap_or_else(|| PathBuf::from("."))
}

#[cfg(windows)]
fn is_elevated() -> bool {
    let script = "([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)";
    let out = Command::new("powershell.exe")
        .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script])
        .output();
    match out {
        Ok(o) => {
            let s = String::from_utf8_lossy(&o.stdout);
            s.trim().eq_ignore_ascii_case("true")
        }
        Err(_) => false,
    }
}

#[cfg(not(windows))]
fn is_elevated() -> bool {
    false
}

fn quote_ps(s: &str) -> String {
    format!("'{}'", s.replace('\'', "''"))
}

fn run_ps1(ps1: &Path, args: &[String]) -> i32 {
    let mut cmd = Command::new("powershell.exe");
    cmd.arg("-NoProfile")
        .arg("-ExecutionPolicy")
        .arg("Bypass")
        .arg("-File")
        .arg(ps1);
    for a in args {
        cmd.arg(a);
    }
    match cmd.status() {
        Ok(s) => s.code().unwrap_or(1),
        Err(e) => {
            eprintln!("powershell baslatilamadi: {}", e);
            1
        }
    }
}

#[cfg(windows)]
fn run_elevated_ps1(ps1: &Path, args: &[String]) -> i32 {
    let ps1_q = quote_ps(&ps1.to_string_lossy());
    let mut arg_list = format!("'-NoProfile','-ExecutionPolicy','Bypass','-File',{}", ps1_q);
    for a in args {
        arg_list.push(',');
        arg_list.push_str(&quote_ps(a));
    }
    let ps = format!(
        "Start-Process -FilePath 'powershell.exe' -Verb RunAs -Wait -ArgumentList {}",
        arg_list
    );
    match Command::new("powershell.exe")
        .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", &ps])
        .status()
    {
        Ok(s) => s.code().unwrap_or(1),
        Err(e) => {
            eprintln!("UAC baslatma hatasi: {}", e);
            1
        }
    }
}

#[cfg(not(windows))]
fn run_elevated_ps1(ps1: &Path, args: &[String]) -> i32 {
    eprintln!("Bu arac yalnizca Windows icindir.");
    let _ = (ps1, args);
    1
}

fn main() {
    let dir = install_dir();
    let ps1 = dir.join("pg-windows-expose-remote.ps1");
    if !ps1.exists() {
        eprintln!(
            "pg-windows-expose-remote.ps1 bulunamadi: {}\nKurulum dizininde RetailEX NSIS kurulumunu kullanin.",
            ps1.display()
        );
        std::process::exit(1);
    }

    let args: Vec<String> = std::env::args().skip(1).collect();
    let code = if is_elevated() {
        run_ps1(&ps1, &args)
    } else {
        run_elevated_ps1(&ps1, &args)
    };
    std::process::exit(code);
}
