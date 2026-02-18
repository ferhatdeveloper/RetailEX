// ============================================================================
// RetailEX - Device Fingerprint Module
// ============================================================================
// Purpose: Generate unique, stable hardware fingerprint for device binding
// Security: Combines CPU, Motherboard, and MAC addresses
// ============================================================================

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::process::Command;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DeviceFingerprint {
    pub id: String,                  // Final SHA-256 hash
    pub cpu_id: String,              // CPU identifier
    pub motherboard_serial: String,  // Motherboard serial
    pub mac_addresses: Vec<String>,  // Network MAC addresses
}

impl DeviceFingerprint {
    /// Generate device fingerprint from hardware components
    pub fn generate() -> Result<Self, String> {
        println!("🔍 Generating device fingerprint...");
        
        // 1. Get CPU ID
        let cpu_id = Self::get_cpu_id()?;
        println!("  ✓ CPU ID: {}", &cpu_id[..16.min(cpu_id.len())]);
        
        // 2. Get Motherboard Serial
        let motherboard_serial = Self::get_motherboard_serial()?;
        println!("  ✓ Motherboard: {}", &motherboard_serial[..16.min(motherboard_serial.len())]);
        
        // 3. Get MAC Addresses
        let mac_addresses = Self::get_mac_addresses()?;
        println!("  ✓ MAC Addresses: {} found", mac_addresses.len());
        
        // 4. Combine and hash
        let combined = format!(
            "CPU:{}-MB:{}-MAC:{}",
            cpu_id,
            motherboard_serial,
            mac_addresses.join(",")
        );
        
        let mut hasher = Sha256::new();
        hasher.update(combined.as_bytes());
        hasher.update(b"RetailEX-Device-v1"); // Salt
        let id = format!("{:x}", hasher.finalize());
        
        println!("  ✓ Device ID: {}...", &id[..16]);
        
        Ok(DeviceFingerprint {
            id,
            cpu_id,
            motherboard_serial,
            mac_addresses,
        })
    }
    
    /// Verify stored device ID matches current hardware
    pub fn verify(&self, stored_id: &str) -> bool {
        self.id == stored_id
    }
    
    // ========================================================================
    // Windows-specific Hardware Detection
    // ========================================================================
    
    /// Get CPU ID using WMIC
    fn get_cpu_id() -> Result<String, String> {
        #[cfg(target_os = "windows")]
        {
            let output = Command::new("wmic")
                .args(&["cpu", "get", "ProcessorId"])
                .output()
                .map_err(|e| format!("Failed to get CPU ID: {}", e))?;
            
            let output_str = String::from_utf8_lossy(&output.stdout);
            let lines: Vec<&str> = output_str.lines().collect();
            
            // WMIC output format:
            // ProcessorId
            // BFEBFBFF000906E9
            if lines.len() >= 2 {
                let cpu_id = lines[1].trim().to_string();
                if !cpu_id.is_empty() {
                    return Ok(cpu_id);
                }
            }
            
            Err("CPU ID not found".to_string())
        }
        
        #[cfg(not(target_os = "windows"))]
        {
            // Fallback for non-Windows (Linux/Mac)
            Ok("GENERIC-CPU-ID".to_string())
        }
    }
    
    /// Get Motherboard Serial using WMIC
    fn get_motherboard_serial() -> Result<String, String> {
        #[cfg(target_os = "windows")]
        {
            let output = Command::new("wmic")
                .args(&["baseboard", "get", "SerialNumber"])
                .output()
                .map_err(|e| format!("Failed to get motherboard serial: {}", e))?;
            
            let output_str = String::from_utf8_lossy(&output.stdout);
            let lines: Vec<&str> = output_str.lines().collect();
            
            if lines.len() >= 2 {
                let serial = lines[1].trim().to_string();
                if !serial.is_empty() && serial != "To be filled by O.E.M." {
                    return Ok(serial);
                }
            }
            
            // Fallback: Use UUID
            let uuid_output = Command::new("wmic")
                .args(&["csproduct", "get", "UUID"])
                .output()
                .map_err(|e| format!("Failed to get UUID: {}", e))?;
            
            let uuid_str = String::from_utf8_lossy(&uuid_output.stdout);
            let uuid_lines: Vec<&str> = uuid_str.lines().collect();
            
            if uuid_lines.len() >= 2 {
                let uuid = uuid_lines[1].trim().to_string();
                if !uuid.is_empty() {
                    return Ok(uuid);
                }
            }
            
            Err("Motherboard serial/UUID not found".to_string())
        }
        
        #[cfg(not(target_os = "windows"))]
        {
            Ok("GENERIC-MB-SERIAL".to_string())
        }
    }
    
    /// Get MAC Addresses using getmac
    fn get_mac_addresses() -> Result<Vec<String>, String> {
        #[cfg(target_os = "windows")]
        {
            let output = Command::new("getmac")
                .args(&["/FO", "CSV", "/NH"])
                .output()
                .map_err(|e| format!("Failed to get MAC addresses: {}", e))?;
            
            let output_str = String::from_utf8_lossy(&output.stdout);
            let mut macs = Vec::new();
            
            for line in output_str.lines() {
                // Format: "AA-BB-CC-DD-EE-FF","Transport Name"
                if let Some(mac) = line.split(',').next() {
                    let mac_clean = mac.trim_matches('"').trim().to_string();
                    if !mac_clean.is_empty() && mac_clean.contains('-') {
                        macs.push(mac_clean);
                    }
                }
            }
            
            if macs.is_empty() {
                return Err("No MAC addresses found".to_string());
            }
            
            // Sort for consistency
            macs.sort();
            Ok(macs)
        }
        
        #[cfg(not(target_os = "windows"))]
        {
            Ok(vec!["00-00-00-00-00-00".to_string()])
        }
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_fingerprint_generation() {
        let fp = DeviceFingerprint::generate();
        assert!(fp.is_ok());
        
        let fp = fp.unwrap();
        assert!(!fp.id.is_empty());
        assert_eq!(fp.id.len(), 64); // SHA-256 hex = 64 chars
    }
    
    #[test]
    fn test_fingerprint_stability() {
        let fp1 = DeviceFingerprint::generate().unwrap();
        let fp2 = DeviceFingerprint::generate().unwrap();
        
        // Same hardware should produce same ID
        assert_eq!(fp1.id, fp2.id);
    }
    
    #[test]
    fn test_fingerprint_verification() {
        let fp = DeviceFingerprint::generate().unwrap();
        
        // Should verify against itself
        assert!(fp.verify(&fp.id));
        
        // Should fail with different ID
        assert!(!fp.verify("wrong-id-123"));
    }
}
