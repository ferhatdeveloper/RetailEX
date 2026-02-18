// ============================================================================
// RetailEX - Hardware-Bound VPN Key Generation
// ============================================================================
// Extension to vpn.rs for device-bound key generation and encryption
// ============================================================================

use crate::device_fingerprint::DeviceFingerprint;
use aes_gcm::{
    aead::{Aead, KeyInit, OsRng as AesRng},
    Aes256Gcm, Nonce,
};
use ed25519_dalek::{Keypair, PublicKey, SecretKey};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VpnKeyPair {
    pub device_id: String,
    pub encrypted_private_key: String,
    pub public_key: String,
}

/// Generate hardware-bound VPN keypair
/// Private key is encrypted with device fingerprint
pub fn generate_hardware_bound_keypair(device_id: &str) -> Result<(String, String), String> {
    // 1. Derive deterministic seed from device_id
    let seed = derive_seed_from_device_id(device_id);

    // 2. Generate Ed25519 keypair from seed
    let secret = SecretKey::from_bytes(&seed).map_err(|e| format!("SecretKey generation failed: {}", e))?;
    let public: PublicKey = (&secret).into();
    let keypair = Keypair { secret, public };

    // 3. Encrypt private key with device_id
    let encrypted_private = encrypt_with_device_id(keypair.secret.as_bytes(), device_id)?;

    // 4. Return (encrypted_private_key, public_key)
    use base64::{Engine as _, engine::general_purpose};
    Ok((
        general_purpose::STANDARD.encode(encrypted_private),
        general_purpose::STANDARD.encode(keypair.public.as_bytes()),
    ))
}

/// Decrypt private key using device fingerprint
pub fn decrypt_private_key(encrypted_key: &str, device_id: &str) -> Result<SecretKey, String> {
    use base64::{Engine as _, engine::general_purpose};
    
    // 1. Decode base64
    let encrypted = general_purpose::STANDARD
        .decode(encrypted_key)
        .map_err(|e| format!("Base64 decode error: {}", e))?;

    // 2. Decrypt with device_id
    let decrypted = decrypt_with_device_id(&encrypted, device_id)?;

    // 3. Reconstruct SecretKey
    if decrypted.len() != 32 {
        return Err(format!("Invalid key length: {}", decrypted.len()));
    }

    let mut bytes = [0u8; 32];
    bytes.copy_from_slice(&decrypted);

    SecretKey::from_bytes(&bytes).map_err(|e| format!("SecretKey reconstruction failed: {}", e))
}

/// Derive deterministic seed from device ID
fn derive_seed_from_device_id(device_id: &str) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(device_id.as_bytes());
    hasher.update(b"RetailEX-VPN-Seed-v1"); // Salt
    hasher.finalize().into()
}

/// Encrypt data with device ID using AES-256-GCM
fn encrypt_with_device_id(data: &[u8], device_id: &str) -> Result<Vec<u8>, String> {
    // Derive AES key from device_id
    let key_material = derive_seed_from_device_id(device_id);
    let cipher = Aes256Gcm::new(&key_material.into());

    // Generate random nonce
    let mut nonce_bytes = [0u8; 12];
    AesRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    // Encrypt
    let ciphertext = cipher
        .encrypt(nonce, data)
        .map_err(|e| format!("Encryption failed: {}", e))?;

    // Prepend nonce to ciphertext
    let mut result = nonce_bytes.to_vec();
    result.extend_from_slice(&ciphertext);

    Ok(result)
}

/// Decrypt data with device ID using AES-256-GCM
fn decrypt_with_device_id(data: &[u8], device_id: &str) -> Result<Vec<u8>, String> {
    if data.len() < 12 {
        return Err("Invalid ciphertext: too short".to_string());
    }

    // Extract nonce and ciphertext
    let nonce = Nonce::from_slice(&data[..12]);
    let ciphertext = &data[12..];

    // Derive AES key from device_id
    let key_material = derive_seed_from_device_id(device_id);
    let cipher = Aes256Gcm::new(&key_material.into());

    // Decrypt
    cipher
        .decrypt(nonce, ciphertext)
        .map_err(|e| format!("Decryption failed: {}", e))
}

// ============================================================================
// Tauri Commands
// ============================================================================

#[tauri::command]
pub async fn generate_device_bound_vpn_keys() -> Result<VpnKeyPair, String> {
    println!("🔐 Generating device-bound VPN keys...");

    // 1. Get device fingerprint
    let fingerprint = DeviceFingerprint::generate()?;

    // 2. Generate hardware-bound keypair
    let (encrypted_private, public) = generate_hardware_bound_keypair(&fingerprint.id)?;

    println!("  ✓ Keys generated and encrypted");
    println!("  ✓ Device ID: {}...", &fingerprint.id[..16]);

    Ok(VpnKeyPair {
        device_id: fingerprint.id,
        encrypted_private_key: encrypted_private,
        public_key: public,
    })
}

#[tauri::command]
pub async fn verify_device_and_decrypt_key(
    device_id: String,
    encrypted_private_key: String,
) -> Result<bool, String> {
    println!("🔍 Verifying device and decrypting key...");

    // 1. Get current device fingerprint
    let current_fingerprint = DeviceFingerprint::generate()?;

    // 2. Verify against stored device_id
    if current_fingerprint.id != device_id {
        return Err(format!(
            "⚠️ Device mismatch!\nStored: {}...\nCurrent: {}...\nKey cannot be used on this hardware.",
            &device_id[..16],
            &current_fingerprint.id[..16]
        ));
    }

    // 3. Try to decrypt private key
    let _secret_key = decrypt_private_key(&encrypted_private_key, &current_fingerprint.id)?;

    println!("  ✓ Device verified successfully");
    println!("  ✓ Private key decrypted");

    Ok(true)
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_key_encryption_decryption() {
        let device_id = "test-device-123";
        let test_data = b"secret key data";

        let encrypted = encrypt_with_device_id(test_data, device_id).unwrap();
        let decrypted = decrypt_with_device_id(&encrypted, device_id).unwrap();

        assert_eq!(test_data, decrypted.as_slice());
    }

    #[test]
    fn test_wrong_device_rejection() {
        let device_id_1 = "device-1";
        let device_id_2 = "device-2";
        let test_data = b"secret key data";

        let encrypted = encrypt_with_device_id(test_data, device_id_1).unwrap();

        // Should fail with different device_id
        assert!(decrypt_with_device_id(&encrypted, device_id_2).is_err());
    }

    #[test]
    fn test_hardware_bound_keypair() {
        let device_id = "test-device-456";
        let (encrypted, public) = generate_hardware_bound_keypair(device_id).unwrap();

        // Should be able to decrypt with same device_id
        let secret = decrypt_private_key(&encrypted, device_id).unwrap();
        assert_eq!(secret.as_bytes().len(), 32);

        // Should fail with different device_id
        assert!(decrypt_private_key(&encrypted, "wrong-device").is_err());
    }
}
