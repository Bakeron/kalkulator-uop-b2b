//! The Anthropic API key lives only in the OS credential store - Windows Credential Manager on
//! the PC, Android Keystore on the phone. It never goes to a file, local storage, logs or the
//! web view's storage: the page sees the last 4 characters, and the whole key only for a moment
//! after "Pokaż klucz" in Settings → AI (as in Tablica Ofert), never kept there.

use crate::ai::AiError;

const SERVICE: &str = "pl.prywatne.kalkulatoruopb2b";
/// Development builds keep their own key, so testing never touches the real one.
const KEY_NAME: &str = if cfg!(debug_assertions) { "ai-key-anthropic-dev" } else { "ai-key-anthropic" };
const MAX_KEY: usize = 512;

fn vault_error(e: impl std::fmt::Display) -> AiError {
    AiError::new("vault", e.to_string())
}

pub fn init() -> Result<(), AiError> {
    #[cfg(windows)]
    {
        let store = windows_native_keyring_store::Store::new().map_err(vault_error)?;
        keyring_core::set_default_store(store);
    }
    #[cfg(target_os = "android")]
    {
        let store = android_native_keyring_store::Store::new().map_err(vault_error)?;
        keyring_core::set_default_store(store);
    }
    Ok(())
}

fn entry() -> Result<keyring_core::Entry, AiError> {
    keyring_core::Entry::new(SERVICE, KEY_NAME).map_err(vault_error)
}

pub fn get() -> Result<Option<String>, AiError> {
    match entry()?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring_core::Error::NoEntry) => Ok(None),
        Err(e) => Err(vault_error(e)),
    }
}

/// A key typed by the user: trimmed, not empty, no spaces or control characters.
pub fn clean(value: &str) -> Result<String, AiError> {
    let value = value.trim();
    if value.is_empty() || value.chars().count() > MAX_KEY || value.chars().any(|c| c.is_control() || c.is_whitespace()) {
        return Err(AiError::new("format", "the key has a wrong format"));
    }
    Ok(value.to_string())
}

/// Only the end of the key, as the settings show it.
pub fn hint(value: &str) -> String {
    let chars: Vec<char> = value.chars().collect();
    if chars.len() <= 8 {
        return "••••".into();
    }
    format!("••••{}", chars[chars.len() - 4..].iter().collect::<String>())
}

#[tauri::command]
pub fn ai_key_hint() -> Result<Option<String>, AiError> {
    Ok(get()?.map(|k| hint(&k)))
}

#[tauri::command]
pub fn ai_key_set(value: String) -> Result<String, AiError> {
    let key = clean(&value)?;
    entry()?.set_password(&key).map_err(vault_error)?;
    Ok(hint(&key))
}

/// "Pokaż klucz": the saved key, read from the vault only on that click.
#[tauri::command]
pub fn ai_key_reveal() -> Result<Option<String>, AiError> {
    get()
}

#[tauri::command]
pub fn ai_key_delete() -> Result<(), AiError> {
    match entry()?.delete_credential() {
        Ok(()) | Err(keyring_core::Error::NoEntry) => Ok(()),
        Err(e) => Err(vault_error(e)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hint_shows_only_the_end() {
        assert_eq!(hint("sk-ant-abcdefgh1234"), "••••1234");
        assert_eq!(hint("short"), "••••");
    }

    #[test]
    fn keys_are_checked() {
        assert_eq!(clean("  sk-ant-123 ").unwrap(), "sk-ant-123");
        assert!(clean("").is_err());
        assert!(clean("two words").is_err());
        assert!(clean("line\nbreak").is_err());
        assert!(clean(&"x".repeat(MAX_KEY + 1)).is_err());
    }
}
