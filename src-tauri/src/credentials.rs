const CREDENTIAL_SERVICE: &str = "com.draft-whisper.api-key";
const LEGACY_CREDENTIAL_ACCOUNT: &str = "default";

pub(crate) fn credential_account(config_id: &str) -> Result<String, String> {
    if config_id.is_empty()
        || !config_id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err("Invalid API configuration ID".into());
    }
    Ok(format!("api-config:{config_id}"))
}

#[cfg(target_os = "macos")]
fn load_credential_account(account: &str) -> Result<Option<String>, String> {
    let output = std::process::Command::new("security")
        .args([
            "find-generic-password",
            "-s",
            CREDENTIAL_SERVICE,
            "-a",
            account,
            "-w",
        ])
        .output()
        .map_err(|e| format!("Failed to run security command: {e}"))?;
    if !output.status.success() {
        return Ok(None);
    }
    let key = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok((!key.is_empty()).then_some(key))
}

#[cfg(target_os = "macos")]
fn save_credential_account(account: &str, api_key: &str) -> Result<(), String> {
    let output = std::process::Command::new("security")
        .args([
            "add-generic-password",
            "-s",
            CREDENTIAL_SERVICE,
            "-a",
            account,
            "-w",
            api_key,
            "-U",
        ])
        .output()
        .map_err(|e| format!("Failed to run security command: {e}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to save API key to Keychain: {stderr}"));
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn delete_credential_account(account: &str) -> Result<(), String> {
    let output = std::process::Command::new("security")
        .args([
            "delete-generic-password",
            "-s",
            CREDENTIAL_SERVICE,
            "-a",
            account,
        ])
        .output()
        .map_err(|e| format!("Failed to run security command: {e}"))?;
    if !output.status.success() {
        log::warn!("Keychain entry did not exist: {account}");
    }
    Ok(())
}

#[cfg(target_os = "windows")]
static WINDOWS_CREDENTIAL_STORE_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

#[cfg(target_os = "windows")]
fn windows_credential_entry(account: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(CREDENTIAL_SERVICE, account)
        .map_err(|error| format!("Failed to access Windows Credential Manager: {error}"))
}

#[cfg(target_os = "windows")]
fn lock_windows_credential_store() -> Result<std::sync::MutexGuard<'static, ()>, String> {
    WINDOWS_CREDENTIAL_STORE_LOCK
        .lock()
        .map_err(|_| "Windows Credential Manager lock was poisoned".to_string())
}

#[cfg(target_os = "windows")]
fn load_credential_account(account: &str) -> Result<Option<String>, String> {
    let _guard = lock_windows_credential_store()?;
    let entry = windows_credential_entry(account)?;
    match entry.get_password() {
        Ok(key) => Ok((!key.is_empty()).then_some(key)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(format!(
            "Failed to load API key from Windows Credential Manager: {error}"
        )),
    }
}

#[cfg(target_os = "windows")]
fn save_credential_account(account: &str, api_key: &str) -> Result<(), String> {
    let _guard = lock_windows_credential_store()?;
    windows_credential_entry(account)?
        .set_password(api_key)
        .map_err(|error| format!("Failed to save API key to Windows Credential Manager: {error}"))
}

#[cfg(target_os = "windows")]
fn delete_credential_account(account: &str) -> Result<(), String> {
    let _guard = lock_windows_credential_store()?;
    match windows_credential_entry(account)?.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => {
            log::warn!("Windows Credential Manager entry did not exist: {account}");
            Ok(())
        }
        Err(error) => Err(format!(
            "Failed to delete API key from Windows Credential Manager: {error}"
        )),
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn load_credential_account(_account: &str) -> Result<Option<String>, String> {
    Err("Secure API key storage is not supported on this platform".into())
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn save_credential_account(_account: &str, _api_key: &str) -> Result<(), String> {
    Err("Secure API key storage is not supported on this platform".into())
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn delete_credential_account(_account: &str) -> Result<(), String> {
    Err("Secure API key storage is not supported on this platform".into())
}

#[tauri::command]
pub fn save_api_key(config_id: String, api_key: String) -> Result<(), String> {
    save_credential_account(&credential_account(&config_id)?, &api_key)
}

#[tauri::command]
pub fn load_api_key(config_id: String) -> Result<Option<String>, String> {
    load_credential_account(&credential_account(&config_id)?)
}

#[tauri::command]
pub fn delete_api_key(config_id: String) -> Result<(), String> {
    delete_credential_account(&credential_account(&config_id)?)
}

#[tauri::command]
pub fn migrate_legacy_api_key(config_id: String) -> Result<Option<String>, String> {
    let account = credential_account(&config_id)?;
    if let Some(existing) = load_credential_account(&account)? {
        return Ok(Some(existing));
    }
    let Some(legacy) = load_credential_account(LEGACY_CREDENTIAL_ACCOUNT)? else {
        return Ok(None);
    };
    save_credential_account(&account, &legacy)?;
    delete_credential_account(LEGACY_CREDENTIAL_ACCOUNT)?;
    Ok(Some(legacy))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_api_credential_accounts() {
        assert_eq!(
            credential_account("config-A_42").unwrap(),
            "api-config:config-A_42"
        );
        for invalid in ["", "with space", "../escape", "配置"] {
            assert!(credential_account(invalid).is_err(), "accepted {invalid:?}");
        }
    }

    #[cfg(target_os = "windows")]
    #[test]
    #[ignore = "writes a temporary entry to Windows Credential Manager"]
    fn stores_api_keys_in_windows_credential_manager() {
        let account = format!("integration-test-{}", std::process::id());
        let secret = "draft-whisper-windows-credential-test";
        let result = (|| -> Result<(), String> {
            save_credential_account(&account, secret)?;
            let loaded = load_credential_account(&account)?;
            if loaded.as_deref() != Some(secret) {
                return Err("Windows Credential Manager returned a different value".into());
            }
            Ok(())
        })();
        let cleanup = delete_credential_account(&account);

        result.expect("failed to round-trip a Windows credential");
        cleanup.expect("failed to remove the temporary Windows credential");
        assert_eq!(load_credential_account(&account).unwrap(), None);
    }
}
