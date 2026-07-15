use std::sync::Mutex;

use tauri::{AppHandle, Manager, RunEvent};

mod identity_migration;
mod macos_menu;
mod secrets;

struct SidecarState {
    child: Mutex<Option<tauri_plugin_shell::process::CommandChild>>,
}

struct SidecarLaunchState {
    launch_url: Mutex<Option<String>>,
}

#[tauri::command]
fn sidecar_launch_url(state: tauri::State<SidecarLaunchState>) -> Option<String> {
    state
        .launch_url
        .lock()
        .ok()
        .and_then(|guard| guard.clone())
}

#[cfg(not(debug_assertions))]
mod production {
    use std::fs::File;
    use std::io::{BufRead, BufReader};
    use std::net::TcpListener;
    use std::path::{Path, PathBuf};
    use std::time::Duration;

    use tauri::{AppHandle, Emitter, Manager};
    use tauri_plugin_shell::process::CommandEvent;
    use tauri_plugin_shell::ShellExt;

    use super::identity_migration::{
        resolve_bundled_host_repo_from_resource_dir, resolve_bundled_shell_from_resource_dir,
    };
    use super::secrets;
    use super::SidecarLaunchState;
    use super::SidecarState;

    pub fn pick_free_port() -> u16 {
        TcpListener::bind("127.0.0.1:0")
            .expect("failed to bind ephemeral port")
            .local_addr()
            .expect("failed to read local_addr")
            .port()
    }

    pub fn load_config_env(app: &AppHandle) -> Vec<(String, String)> {
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

    pub fn ensure_production_workspaces_root() -> Option<String> {
        let home = std::env::var_os("HOME")
            .or_else(|| std::env::var_os("USERPROFILE"))?;
        let path = PathBuf::from(home).join("business").join("workspaces");
        if std::fs::create_dir_all(&path).is_err() {
            return None;
        }
        path.to_str().map(|value| value.to_string())
    }

    fn resolve_bundled_shell_root(resource_dir: &Path) -> PathBuf {
        resolve_bundled_shell_from_resource_dir(resource_dir)
    }

    fn resolve_bundled_host_repo(resource_dir: &Path) -> PathBuf {
        resolve_bundled_host_repo_from_resource_dir(resource_dir)
    }

    pub async fn wait_for_readiness(port: u16) -> bool {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(2))
            .build()
            .unwrap_or_default();
        let url = format!("http://127.0.0.1:{port}/");
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

    pub fn spawn_production_sidecar(app: &AppHandle, port: u16) -> Result<(), String> {
        let resource_dir = app
            .path()
            .resource_dir()
            .map_err(|e| e.to_string())?;
        let resource_dir_string = resource_dir.to_string_lossy().to_string();
        let shell_root = resolve_bundled_shell_root(&resource_dir);
        let shell_root_string = shell_root.to_string_lossy().to_string();
        let host_repo = resolve_bundled_host_repo(&resource_dir);
        let host_repo_string = host_repo.to_string_lossy().to_string();
        let bundle_identifier = app.config().identifier.clone();
        let app_data_dir = app
            .path()
            .app_data_dir()
            .map_err(|e| e.to_string())?
            .to_string_lossy()
            .to_string();

        let mut sidecar = app
            .shell()
            .sidecar("business-server")
            .map_err(|e| e.to_string())?
            .env("TAURI_RESOURCE_DIR", &resource_dir_string)
            .env("TAURI_APP_PORT", port.to_string())
            .env("HOST", "127.0.0.1")
            .env("PORT", port.to_string())
            .env("CONTROL_PLANE_PROJECT_ROOT", &shell_root_string)
            .env("CONTROL_PLANE_HOST_REPO", &host_repo_string)
            .env("TAURI_BUNDLE_IDENTIFIER", &bundle_identifier)
            .env("JAMBU_HOST_BUNDLE_ID", &bundle_identifier)
            .env("TAURI_APP_DATA_DIR", &app_data_dir);

        if let Some(workspaces_root) = ensure_production_workspaces_root() {
            sidecar = sidecar.env("BUSINESS_WORKSPACES_ROOT", workspaces_root);
        }

        for (key, value) in secrets::load_sidecar_secrets() {
            sidecar = sidecar.env(key, value);
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

    pub fn start(app: &AppHandle) -> Result<(), String> {
        let port = pick_free_port();
        spawn_production_sidecar(app, port)?;

        let app_handle = app.clone();
        tauri::async_runtime::spawn(async move {
            if !wait_for_readiness(port).await {
                eprintln!("[business-runtime] readiness gate failed on port {port}");
                return;
            }
            if let Some(window) = app_handle.get_webview_window("main") {
                let url = format!("http://127.0.0.1:{port}/");
                if let Some(launch) = app_handle.try_state::<SidecarLaunchState>() {
                    if let Ok(mut guard) = launch.launch_url.lock() {
                        *guard = Some(url.clone());
                    }
                }
                let _ = app_handle.emit("sidecar-ready", url.clone());
                if let Ok(parsed) = url.parse() {
                    match window.navigate(parsed) {
                        Ok(()) => {
                            super::harden_webview_against_browser_chrome(&window);
                        }
                        Err(error) => {
                            eprintln!("[business-runtime] navigate failed: {error}");
                        }
                    }
                }
            }
        });

        Ok(())
    }
}

#[cfg(debug_assertions)]
mod dev {
    use tauri::{AppHandle, Manager};

    pub fn start(app: &AppHandle) {
        let app_handle = app.clone();

        tauri::async_runtime::spawn(async move {
            let Some(window) = app_handle.get_webview_window("main") else {
                eprintln!("[control-plane] main window not found");
                return;
            };

            // Tauri dev already loads build.devUrl before the Rust binary starts.
            // A second window.navigate() triggers Vite full-reload; with @tailwindcss/vite
            // that reload can fail and blank the webview after the first paint.
            let _ = window.show();
            let _ = window.set_focus();
        });
    }
}

fn kill_sidecar(app: &AppHandle) {
    if let Some(state) = app.try_state::<SidecarState>() {
        if let Some(child) = state.child.lock().unwrap().take() {
            let _ = child.kill();
        }
    }
}

const BLOCK_CONTEXT_MENU_SCRIPT: &str = r#"
document.addEventListener('contextmenu', (event) => event.preventDefault(), { capture: true });
"#;

fn prevent_default_plugin() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    #[cfg(debug_assertions)]
    {
        use tauri_plugin_prevent_default::Flags;

        // Dev: no WebView chrome blocking — right-click menu, reload, and devtools work normally.
        tauri_plugin_prevent_default::Builder::new()
            .with_flags(Flags::empty())
            .build()
    }

    #[cfg(not(debug_assertions))]
    {
        tauri_plugin_prevent_default::init()
    }
}

fn harden_webview_against_browser_chrome(window: &tauri::WebviewWindow) {
    let _ = window.eval(BLOCK_CONTEXT_MENU_SCRIPT);
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(prevent_default_plugin())
        .manage(SidecarState {
            child: Mutex::new(None),
        })
        .manage(SidecarLaunchState {
            launch_url: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            secrets::secrets_set,
            secrets::secrets_delete,
            secrets::secrets_has,
            secrets::secrets_list,
            sidecar_launch_url,
        ])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            {
                if let Err(error) = macos_menu::install_branded_menu(app.handle()) {
                    eprintln!("[business-runtime] failed to install branded macOS menu: {error}");
                }
            }

            #[cfg(not(debug_assertions))]
            {
                identity_migration::run_identity_migration(app.handle());
                secrets::migrate_config_env(app.handle());
                production::start(app.handle())?;
            }

            #[cfg(debug_assertions)]
            dev::start(app.handle());

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let RunEvent::ExitRequested { .. } = event {
                kill_sidecar(app_handle);
            }
        });
}
