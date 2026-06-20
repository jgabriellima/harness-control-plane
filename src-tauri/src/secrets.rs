use std::collections::HashMap;
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;

use keyring::Entry;
use tauri::{AppHandle, Manager};

pub const KEYCHAIN_SERVICE: &str = "ai.jambu.business-runtime";

/// Runtime binding vars always injected into sidecar when present in keychain.
const RUNTIME_ALLOWLIST: &[&str] = &["CURSOR_API_KEY", "CURSOR_DATA_DIR", "SENTRY_DSN"];

/// Integration secrets commonly declared in credential manifest.
const INTEGRATION_ALLOWLIST: &[&str] = &[
    "JIRA_API_TOKEN",
    "JIRA_EMAIL",
    "JIRA_BASE_URL",
    "CONFLUENCE_API_TOKEN",
    "CONFLUENCE_EMAIL",
    "CONFLUENCE_BASE_URL",
    "GITHUB_TOKEN",
    "GH_REPO",
];

fn is_allowlisted(key: &str) -> bool {
    RUNTIME_ALLOWLIST.contains(&key) || INTEGRATION_ALLOWLIST.contains(&key)
}

fn keyring_entry(key: &str) -> Result<Entry, String> {
    Entry::new(KEYCHAIN_SERVICE, key).map_err(|e| e.to_string())
}

pub fn keychain_get(key: &str) -> Option<String> {
    if !is_allowlisted(key) {
        return None;
    }
    let entry = keyring_entry(key).ok()?;
    match entry.get_password() {
        Ok(value) if !value.trim().is_empty() => Some(value),
        _ => None,
    }
}

pub fn keychain_set(key: &str, value: &str) -> Result<(), String> {
    if !is_allowlisted(key) {
        return Err(format!("key not allowlisted: {key}"));
    }
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err("value must not be empty".to_string());
    }
    keyring_entry(key)?.set_password(trimmed).map_err(|e| e.to_string())
}

pub fn keychain_delete(key: &str) -> Result<(), String> {
    if !is_allowlisted(key) {
        return Err(format!("key not allowlisted: {key}"));
    }
    match keyring_entry(key)?.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(err) => Err(err.to_string()),
    }
}

pub fn keychain_has(key: &str) -> bool {
    keychain_get(key).is_some()
}

pub fn keychain_list() -> Vec<String> {
    let mut keys = Vec::new();
    for key in RUNTIME_ALLOWLIST.iter().chain(INTEGRATION_ALLOWLIST.iter()) {
        if keychain_has(key) {
            keys.push((*key).to_string());
        }
    }
    keys.sort();
    keys
}

pub fn load_sidecar_secrets() -> HashMap<String, String> {
    let mut out = HashMap::new();
    for key in RUNTIME_ALLOWLIST.iter().chain(INTEGRATION_ALLOWLIST.iter()) {
        if let Some(value) = keychain_get(key) {
            out.insert((*key).to_string(), value);
        }
    }
    out
}

fn config_env_path(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_data_dir().ok().map(|dir| dir.join("config.env"))
}

fn parse_config_env(path: &PathBuf) -> Vec<(String, String)> {
    let mut pairs = Vec::new();
    let Ok(file) = File::open(path) else {
        return pairs;
    };
    for line in BufReader::new(file).lines().flatten() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        if let Some((key, value)) = trimmed.split_once('=') {
            let key = key.trim().to_string();
            let value = value.trim().trim_matches('"').to_string();
            if !key.is_empty() && is_allowlisted(&key) {
                pairs.push((key, value));
            }
        }
    }
    pairs
}

/// One-time migration: config.env → keychain. Keyring wins on conflict.
pub fn migrate_config_env(app: &AppHandle) {
    let Some(path) = config_env_path(app) else {
        return;
    };
    if !path.is_file() {
        return;
    }

    for (key, value) in parse_config_env(&path) {
        if !keychain_has(&key) {
            if let Err(err) = keychain_set(&key, &value) {
                eprintln!("[secrets] migration skip {key}: {err}");
            }
        }
    }

    let migrated = path.with_extension("env.migrated");
    if let Err(err) = std::fs::rename(&path, &migrated) {
        eprintln!("[secrets] could not rename config.env: {err}");
    }
}

#[tauri::command]
pub fn secrets_set(key: String, value: String) -> Result<(), String> {
    keychain_set(&key, &value)
}

#[tauri::command]
pub fn secrets_delete(key: String) -> Result<(), String> {
    keychain_delete(&key)
}

#[tauri::command]
pub fn secrets_has(key: String) -> Result<bool, String> {
    Ok(keychain_has(&key))
}

#[tauri::command]
pub fn secrets_list() -> Result<Vec<String>, String> {
    Ok(keychain_list())
}
