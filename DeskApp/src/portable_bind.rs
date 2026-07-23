//! Portable volume binding — yalnızca yazıldığı diskte çalışır.
//!
//! `volume.bind` dosyası (exe yanında) hedef sürücünün volume serial'ını
//! ve basit bir bütünlük imzasını tutar. Kopyala-yapıştır ile başka diske
//! taşınırsa serial eşleşmez ve uygulama başlamaz.
//!
//! Geliştirme: `ASIN_PORTABLE_SKIP_BIND=1`

use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};

/// Writer ve runtime arasında paylaşılan salt (kopyalama engeli; lisans sunucusu değil).
const BIND_SALT: &str = "AsinERP-Portable-Bind-v1";

const BIND_FILE: &str = "volume.bind";

#[derive(Debug, Clone)]
pub struct BindInfo {
    pub serial: String,
    pub sig: String,
}

/// Portable modda volume.bind zorunlu; eşleşmezse Err(Türkçe mesaj).
pub fn enforce_portable_volume_binding() -> Result<(), String> {
    if !crate::config::is_portable_mode() {
        return Ok(());
    }
    if skip_bind_env() {
        eprintln!("[portable_bind] ASIN_PORTABLE_SKIP_BIND aktif — bağlama atlandı");
        return Ok(());
    }

    let root = crate::config::exe_dir();
    let bind_path = root.join(BIND_FILE);
    if !bind_path.is_file() {
        return Err(format!(
            "AsinERP taşınabilir sürüm bu medyaya yazılmamış.\n\n\
             volume.bind bulunamadı.\n\
             Lütfen dağıtım aracını kullanın:\n\
             tools\\AsinERP-Portable-Writer.ps1\n\n\
             Klasör: {}",
            root.display()
        ));
    }

    let info = parse_bind_file(&bind_path)?;
    let bound_serial = normalize_serial(&info.serial);
    let expected_sig = compute_sig(&bound_serial);
    if !eq_ascii_ignore_case(&info.sig, &expected_sig) {
        return Err(
            "AsinERP taşınabilir bağlama dosyası bozuk veya değiştirilmiş (volume.bind).\n\
             Medyayı yazıcı araç ile yeniden basın."
                .into(),
        );
    }

    let current = normalize_serial(&read_volume_serial_for_path(&root)?);
    if !eq_ascii_ignore_case(&current, &bound_serial) {
        return Err(format!(
            "AsinERP yalnızca yazıldığı diskte çalışır.\n\n\
             Beklenen volume: {}\n\
             Bu disk volume: {}\n\n\
             Kopyala-yapıştır ile taşınamaz. Hedef diske writer ile basın.",
            bound_serial, current
        ));
    }

    Ok(())
}

fn skip_bind_env() -> bool {
    for key in ["ASIN_PORTABLE_SKIP_BIND", "RETAILEX_PORTABLE_SKIP_BIND"] {
        if let Ok(v) = std::env::var(key) {
            let t = v.trim().to_ascii_lowercase();
            if t == "1" || t == "true" || t == "yes" {
                return true;
            }
        }
    }
    false
}

pub fn compute_sig(serial: &str) -> String {
    let norm = normalize_serial(serial);
    let mut hasher = Sha256::new();
    hasher.update(BIND_SALT.as_bytes());
    hasher.update(b"|");
    hasher.update(norm.as_bytes());
    hex_encode(hasher.finalize().as_slice())
}

pub fn format_bind_file(serial: &str, written_iso: &str) -> String {
    let serial_u = normalize_serial(serial);
    let sig = compute_sig(&serial_u);
    format!(
        "# AsinERP portable volume binding — writer ile basılır; elle kopyalamayın\n\
v=1\n\
serial={serial_u}\n\
written={written_iso}\n\
sig={sig}\n"
    )
}

/// Volume serial'ı 8 büyük hex haneye çevir (WMI / GetVolumeInformation uyumu).
fn normalize_serial(raw: &str) -> String {
    let s = raw.trim().trim_start_matches("0x").trim_start_matches("0X");
    if let Ok(n) = u32::from_str_radix(s, 16) {
        return format!("{n:08X}");
    }
    s.to_ascii_uppercase()
}

fn parse_bind_file(path: &Path) -> Result<BindInfo, String> {
    let text = fs::read_to_string(path)
        .map_err(|e| format!("volume.bind okunamadı: {e}"))?;
    let mut serial = String::new();
    let mut sig = String::new();
    for line in text.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        if let Some((k, v)) = line.split_once('=') {
            match k.trim().to_ascii_lowercase().as_str() {
                "serial" => serial = v.trim().to_string(),
                "sig" => sig = v.trim().to_string(),
                _ => {}
            }
        }
    }
    if serial.is_empty() || sig.is_empty() {
        return Err("volume.bind eksik alan (serial/sig)".into());
    }
    Ok(BindInfo { serial, sig })
}

fn eq_ascii_ignore_case(a: &str, b: &str) -> bool {
    a.trim().eq_ignore_ascii_case(b.trim())
}

fn hex_encode(bytes: &[u8]) -> String {
    const HEX: &[u8] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for &b in bytes {
        out.push(HEX[(b >> 4) as usize] as char);
        out.push(HEX[(b & 0xf) as usize] as char);
    }
    out
}

/// Exe yolunun bulunduğu sürücü için Windows volume serial (8 hex).
pub fn read_volume_serial_for_path(path: &Path) -> Result<String, String> {
    #[cfg(windows)]
    {
        read_volume_serial_windows(path)
    }
    #[cfg(not(windows))]
    {
        let _ = path;
        Err("Volume bağlama yalnızca Windows'ta desteklenir.".into())
    }
}

#[cfg(windows)]
fn read_volume_serial_windows(path: &Path) -> Result<String, String> {
    use std::os::windows::ffi::OsStrExt;
    use windows::core::PCWSTR;
    use windows::Win32::Storage::FileSystem::GetVolumeInformationW;

    let root = volume_root_path(path)?;
    let wide: Vec<u16> = std::ffi::OsStr::new(&root)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    let mut serial: u32 = 0;
    let ok = unsafe {
        GetVolumeInformationW(
            PCWSTR(wide.as_ptr()),
            None,
            Some(&mut serial),
            None,
            None,
            None,
        )
    };
    if ok.is_err() {
        return Err(format!(
            "Disk volume bilgisi okunamadı ({root}). Yönetici / medya erişimini kontrol edin."
        ));
    }
    Ok(format!("{serial:08X}"))
}

/// `E:\foo\bar` → `E:\` ; UNC için hata.
fn volume_root_path(path: &Path) -> Result<String, String> {
    let abs = if path.is_absolute() {
        path.to_path_buf()
    } else {
        std::env::current_dir()
            .unwrap_or_else(|_| PathBuf::from("."))
            .join(path)
    };
    let s = abs.to_string_lossy();
    // `\\?\E:\...` veya `E:\...`
    let cleaned = s.strip_prefix(r"\\?\").unwrap_or(&s);
    let bytes = cleaned.as_bytes();
    if bytes.len() >= 2 && bytes[1] == b':' {
        let letter = (bytes[0] as char).to_ascii_uppercase();
        if letter.is_ascii_alphabetic() {
            return Ok(format!("{letter}:\\"));
        }
    }
    Err(format!(
        "Geçerli sürücü harfi bulunamadı: {}",
        abs.display()
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sig_stable() {
        let a = compute_sig("a1b2c3d4");
        let b = compute_sig("A1B2C3D4");
        assert_eq!(a, b);
        assert_eq!(a.len(), 64);
    }

    #[test]
    fn format_roundtrip_fields() {
        let body = format_bind_file("DEADBEEF", "2026-01-01T00:00:00Z");
        let dir = std::env::temp_dir().join("asin_portable_bind_test");
        let _ = fs::create_dir_all(&dir);
        let p = dir.join("volume.bind");
        fs::write(&p, &body).unwrap();
        let info = parse_bind_file(&p).unwrap();
        assert_eq!(info.serial.to_uppercase(), "DEADBEEF");
        assert_eq!(info.sig, compute_sig("DEADBEEF"));
        let _ = fs::remove_file(&p);
    }
}
