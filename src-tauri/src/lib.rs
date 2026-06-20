use std::fs::File;
use std::io::{BufRead, BufReader};
use std::net::TcpListener;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager, RunEvent, WebviewUrl};
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

struct SidecarState {
    child: Mutex<Option<tauri_plugin_shell::process::CommandChild>>,
}

fn pick_free_port() -> u16 {
    TcpListener::bind("127.0.0.1:0")
        .expect("failed to bind ephemeral port")
        .local_addr()
        .expect("failed to read local_addr")
        .port()
}

fn load_config_env(app: &AppHandle) -> Vec<(String, String)> {
    let mut pairs = Vec::new();
    let Ok(data_dir) = app.path().app_data_dir() else {
        return pairs;
    };
    let config_path = data_dir.join("config.env");
    if !config_path.is_file() {
        return pairs;
    }
    let Ok(file) = File::open(config_path) else {
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
            if !key.is_empty() {
                pairs.push((key, value));
            }
        }
    }
    pairs
}

fn ensure_production_workspaces_root() -> Option<String> {
    let home = std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))?;
    let path = PathBuf::from(home).join("business").join("workspaces");
    if std::fs::create_dir_all(&path).is_err() {
        return None;
    }
    path.to_str().map(|value| value.to_string())
}

async fn wait_for_readiness(port: u16) -> bool {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(2))
        .build()
        .unwrap_or_default();
    let url = format!("http://127.0.0.1:{port}/api/runtime/readiness");
    let deadline = std::time::Instant::now() + Duration::from_secs(90);
    while std::time::Instant::now() < deadline {
        if let Ok(response) = client.get(&url).send().await {
            if response.status().is_success() {
                return true;
            }
        }
        tokio::time::sleep(Duration::from_millis(300)).await;
    }
    false
}

fn spawn_production_sidecar(app: &AppHandle, port: u16) -> Result<(), String> {
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| e.to_string())?
        .to_string_lossy()
        .to_string();

    let mut sidecar = app
        .shell()
        .sidecar("business-server")
        .map_err(|e| e.to_string())?
        .env("TAURI_RESOURCE_DIR", resource_dir)
        .env("TAURI_APP_PORT", port.to_string())
        .env("HOST", "127.0.0.1")
        .env("PORT", port.to_string());

    if let Some(workspaces_root) = ensure_production_workspaces_root() {
        sidecar = sidecar.env("BUSINESS_WORKSPACES_ROOT", workspaces_root);
    }

    for (key, value) in load_config_env(app) {
        sidecar = sidecar.env(key, value);
    }

    let (mut rx, child) = sidecar.spawn().map_err(|e| e.to_string())?;
    if let Some(state) = app.try_state::<SidecarState>() {
        *state.child.lock().unwrap() = Some(child);
    }

    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            if let CommandEvent::Terminated(payload) = event {
                eprintln!(
                    "[business-server] sidecar terminated code={:?} signal={:?}",
                    payload.code, payload.signal
                );
                let _ = app_handle.emit("sidecar-terminated", payload);
                break;
            }
        }
    });

    Ok(())
}

fn kill_sidecar(app: &AppHandle) {
    if let Some(state) = app.try_state::<SidecarState>() {
        if let Some(child) = state.child.lock().unwrap().take() {
            let _ = child.kill();
        }
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(SidecarState {
            child: Mutex::new(None),
        })
        .setup(|app| {
            #[cfg(not(debug_assertions))]
            {
                let port = pick_free_port();
                spawn_production_sidecar(app.handle(), port)?;

                let app_handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    if !wait_for_readiness(port).await {
                        eprintln!(
                            "[business-runtime] readiness gate failed on port {port}"
                        );
                        return;
                    }
                    if let Some(window) = app_handle.get_webview_window("main") {
                        let url = format!("http://127.0.0.1:{port}/");
                        if let Ok(parsed) = url.parse() {
                            let _ = window.navigate(WebviewUrl::External(parsed));
                        }
                    }
                });
            }

            #[cfg(debug_assertions)]
            {
                let _ = app;
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                kill_sidecar(window.app_handle());
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let RunEvent::ExitRequested { .. } = event {
                kill_sidecar(app_handle);
            }
        });
}
