use std::fs;
use std::path::PathBuf;

fn main() {
    let manifest_dir = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR"));
    let conf_path = manifest_dir.join("tauri.conf.json");
    if let Ok(content) = fs::read_to_string(&conf_path) {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
            if let Some(identifier) = json.get("identifier").and_then(|value| value.as_str()) {
                let trimmed = identifier.trim();
                if !trimmed.is_empty() {
                    println!("cargo:rustc-env=TAURI_BUNDLE_IDENTIFIER={trimmed}");
                }
            }
        }
    }

    tauri_build::build()
}
