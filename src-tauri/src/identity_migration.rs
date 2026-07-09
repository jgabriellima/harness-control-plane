use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::secrets;

const IDENTITY_MANIFEST_NAME: &str = "bundle.identity.yaml";

#[derive(Debug, Clone, Deserialize)]
struct IdentityMigrationBlock {
    import_keychain_from: Option<Vec<String>>,
    import_app_data_from: Option<Vec<String>>,
    tcc_reauth_required: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct BundleIdentityManifest {
    bundle_id: String,
    supersedes: Option<Vec<String>>,
    migration: Option<IdentityMigrationBlock>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct MigrationRecord {
    pub bundle_id: String,
    pub completed: bool,
    pub keychain_keys_migrated: u32,
    pub app_data_files_copied: u32,
    pub source_services: Vec<String>,
    pub completed_at: Option<String>,
}

pub fn identity_manifest_path(shell_root: &Path) -> PathBuf {
    shell_root.join(IDENTITY_MANIFEST_NAME)
}

pub fn migration_record_path(app_data_dir: &Path, bundle_id: &str) -> PathBuf {
    app_data_dir
        .join("migrations")
        .join(format!("identity-{bundle_id}.json"))
}

pub fn migration_done_marker_path(app_data_dir: &Path, bundle_id: &str) -> PathBuf {
    app_data_dir
        .join("migrations")
        .join(format!("identity-{bundle_id}.done"))
}

pub fn resolve_shell_root(app: &AppHandle) -> Option<PathBuf> {
    if let Ok(project_root) = std::env::var("CONTROL_PLANE_PROJECT_ROOT") {
        let trimmed = project_root.trim();
        if !trimmed.is_empty() {
            return Some(PathBuf::from(trimmed));
        }
    }

    let resource_dir = app.path().resource_dir().ok()?;
    Some(resolve_bundled_shell_from_resource_dir(&resource_dir))
}

/// Tauri copies `resources/shell` from the bundle manifest under `Resources/resources/shell/`.
pub fn resolve_bundled_shell_from_resource_dir(resource_dir: &Path) -> PathBuf {
    let nested = resource_dir.join("resources").join("shell");
    if nested.join("ui.config.yaml").is_file() {
        return nested;
    }
    let flat = resource_dir.join("shell");
    if flat.join("ui.config.yaml").is_file() {
        return flat;
    }
    nested
}

/// Host repo for workspace provisioning when baseline ships inside the desktop bundle.
pub fn resolve_bundled_host_repo_from_resource_dir(resource_dir: &Path) -> PathBuf {
    let nested = resource_dir.join("resources");
    if nested.join("harness-baseline").is_dir() {
        return nested;
    }
    resource_dir.to_path_buf()
}

pub fn load_identity_manifest(path: &Path) -> Option<BundleIdentityManifest> {
    if !path.is_file() {
        return None;
    }
    let raw = fs::read_to_string(path).ok()?;
    serde_yaml::from_str(&raw).ok()
}

pub fn migration_source_services(manifest: &BundleIdentityManifest, current_bundle_id: &str) -> Vec<String> {
    let mut services = HashSet::new();

    if let Some(supersedes) = &manifest.supersedes {
        for item in supersedes {
            let trimmed = item.trim();
            if !trimmed.is_empty() && trimmed != current_bundle_id {
                services.insert(trimmed.to_string());
            }
        }
    }

    if let Some(migration) = &manifest.migration {
        if let Some(import_from) = &migration.import_keychain_from {
            for item in import_from {
                let trimmed = item.trim();
                if !trimmed.is_empty() && trimmed != current_bundle_id {
                    services.insert(trimmed.to_string());
                }
            }
        }
    }

    let mut ordered: Vec<String> = services.into_iter().collect();
    ordered.sort();
    ordered
}

pub fn app_data_dir_for_identifier(identifier: &str) -> Option<PathBuf> {
    let home = std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE"))?;
    #[cfg(target_os = "macos")]
    {
        return Some(
            PathBuf::from(home)
                .join("Library")
                .join("Application Support")
                .join(identifier),
        );
    }
    #[cfg(target_os = "linux")]
    {
        let base = std::env::var_os("XDG_DATA_HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from(home).join(".local").join("share"));
        return Some(base.join(identifier));
    }
    #[cfg(target_os = "windows")]
    {
        let appdata = std::env::var_os("APPDATA")?;
        return Some(PathBuf::from(appdata).join(identifier));
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        let _ = (home, identifier);
        None
    }
}

fn load_migration_record(path: &Path) -> Option<MigrationRecord> {
    if !path.is_file() {
        return None;
    }
    let raw = fs::read_to_string(path).ok()?;
    serde_json::from_str(&raw).ok()
}

fn write_migration_record(app_data_dir: &Path, record: &MigrationRecord) -> Result<(), String> {
    let migrations_dir = app_data_dir.join("migrations");
    fs::create_dir_all(&migrations_dir).map_err(|e| e.to_string())?;

    let json_path = migration_record_path(app_data_dir, &record.bundle_id);
    let payload = serde_json::to_string_pretty(record).map_err(|e| e.to_string())?;
    fs::write(&json_path, payload).map_err(|e| e.to_string())?;

    let done_path = migration_done_marker_path(app_data_dir, &record.bundle_id);
    fs::write(done_path, "ok\n").map_err(|e| e.to_string())?;
    Ok(())
}

fn migrate_keychain_from_service(old_service: &str, current_service: &str) -> u32 {
    let mut migrated = 0_u32;
    for key in secrets::allowlisted_secret_keys() {
        if secrets::keychain_has_in_service(current_service, key) {
            continue;
        }
        if let Some(value) = secrets::keychain_get_from_service(old_service, key) {
            if secrets::keychain_set(key, &value).is_ok() {
                migrated += 1;
                eprintln!(
                    "[identity-migration] copied keychain key '{key}' from service '{old_service}'"
                );
            }
        }
    }
    migrated
}

fn copy_app_data_merge(source_root: &Path, target_root: &Path) -> u32 {
    if !source_root.is_dir() || source_root == target_root {
        return 0;
    }

    let mut copied = 0_u32;
    let Ok(entries) = fs::read_dir(source_root) else {
        return 0;
    };

    for entry in entries.flatten() {
        let file_name = entry.file_name();
        let name = file_name.to_string_lossy();
        if name == "migrations" {
            continue;
        }

        let source_path = entry.path();
        let dest_path = target_root.join(&file_name);

        if source_path.is_dir() {
            if !dest_path.exists() {
                if fs::create_dir_all(&dest_path).is_ok() {
                    copied += copy_app_data_merge(&source_path, &dest_path);
                }
            } else if dest_path.is_dir() {
                copied += copy_app_data_merge(&source_path, &dest_path);
            }
            continue;
        }

        if dest_path.exists() {
            continue;
        }

        if let Some(parent) = dest_path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        if fs::copy(&source_path, &dest_path).is_ok() {
            copied += 1;
            eprintln!(
                "[identity-migration] copied app data file '{}' from '{}'",
                name,
                source_root.display()
            );
        }
    }

    copied
}

fn migrate_app_data_from_identifiers(
    identifiers: &[String],
    current_app_data: &Path,
    current_bundle_id: &str,
) -> u32 {
    let mut copied = 0_u32;
    for identifier in identifiers {
        let trimmed = identifier.trim();
        if trimmed.is_empty() || trimmed == current_bundle_id {
            continue;
        }
        if let Some(source_root) = app_data_dir_for_identifier(trimmed) {
            copied += copy_app_data_merge(&source_root, current_app_data);
        }
    }
    copied
}

pub fn run_identity_migration(app: &AppHandle) -> Option<MigrationRecord> {
    let shell_root = resolve_shell_root(app)?;
    let manifest_path = identity_manifest_path(&shell_root);
    let manifest = load_identity_manifest(&manifest_path)?;

    let current_bundle_id = secrets::keychain_service();
    if manifest.bundle_id.trim() != current_bundle_id {
        eprintln!(
            "[identity-migration] manifest bundle_id '{}' does not match current identifier '{}'; skipping",
            manifest.bundle_id, current_bundle_id
        );
        return None;
    }

    let app_data_dir = app.path().app_data_dir().ok()?;
    let record_path = migration_record_path(&app_data_dir, &current_bundle_id);
    if let Some(existing) = load_migration_record(&record_path) {
        if existing.completed {
            eprintln!(
                "[identity-migration] already completed for '{}'",
                current_bundle_id
            );
            return Some(existing);
        }
    }

    let source_services = migration_source_services(&manifest, &current_bundle_id);
    if source_services.is_empty() {
        return None;
    }

    let mut keychain_keys_migrated = 0_u32;
    for old_service in &source_services {
        keychain_keys_migrated += migrate_keychain_from_service(old_service, &current_bundle_id);
    }

    let mut app_data_files_copied = 0_u32;
    if let Some(migration) = &manifest.migration {
        if let Some(import_from) = &migration.import_app_data_from {
            app_data_files_copied =
                migrate_app_data_from_identifiers(import_from, &app_data_dir, &current_bundle_id);
        }
    }

    let record = MigrationRecord {
        bundle_id: current_bundle_id.clone(),
        completed: true,
        keychain_keys_migrated,
        app_data_files_copied,
        source_services: source_services.clone(),
        completed_at: Some(chrono_lite_now()),
    };

    if let Err(err) = write_migration_record(&app_data_dir, &record) {
        eprintln!("[identity-migration] failed to write migration record: {err}");
    } else {
        eprintln!(
            "[identity-migration] completed for '{}': {} keychain key(s), {} app data file(s)",
            current_bundle_id, keychain_keys_migrated, app_data_files_copied
        );
    }

    Some(record)
}

fn chrono_lite_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    format!("{secs}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migration_source_services_deduplicates_and_excludes_current() {
        let manifest = BundleIdentityManifest {
            bundle_id: "com.new.app".to_string(),
            supersedes: Some(vec![
                "com.old.app".to_string(),
                "com.new.app".to_string(),
            ]),
            migration: Some(IdentityMigrationBlock {
                import_keychain_from: Some(vec![
                    "com.old.app".to_string(),
                    "com.legacy.app".to_string(),
                ]),
                import_app_data_from: None,
                tcc_reauth_required: None,
            }),
        };

        let services = migration_source_services(&manifest, "com.new.app");
        assert_eq!(
            services,
            vec!["com.legacy.app".to_string(), "com.old.app".to_string()]
        );
    }

    #[test]
    fn migration_record_paths_are_stable() {
        let app_data = PathBuf::from("/tmp/app-data");
        assert_eq!(
            migration_record_path(&app_data, "com.acme.workflow"),
            PathBuf::from("/tmp/app-data/migrations/identity-com.acme.workflow.json")
        );
        assert_eq!(
            migration_done_marker_path(&app_data, "com.acme.workflow"),
            PathBuf::from("/tmp/app-data/migrations/identity-com.acme.workflow.done")
        );
    }
}
