//! Business workflow scheduler daemon — timer loop and detached runner dispatch (ADR-022).

use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::time::Duration;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

const TICK_SECS: u64 = 60;
const REBUILD_DEBOUNCE_SECS: u64 = 5;

#[derive(Debug, Deserialize)]
struct ScheduleRegistry {
    spec: ScheduleRegistrySpec,
}

#[derive(Debug, Deserialize)]
struct ScheduleRegistrySpec {
    entries: Vec<ScheduleEntry>,
}

#[derive(Debug, Deserialize, Clone)]
struct ScheduleEntry {
    id: String,
    enabled: Option<bool>,
    trigger: ScheduleTrigger,
    #[serde(rename = "nextRunAt")]
    next_run_at: Option<String>,
}

#[derive(Debug, Deserialize, Clone)]
struct ScheduleTrigger {
    #[serde(rename = "type")]
    trigger_type: String,
    schedule: Option<String>,
}

#[derive(Debug, Serialize)]
struct HeartbeatDoc {
    #[serde(rename = "apiVersion")]
    api_version: String,
    kind: String,
    metadata: HeartbeatMetadata,
    spec: HeartbeatSpec,
}

#[derive(Debug, Serialize)]
struct HeartbeatMetadata {
    #[serde(rename = "generatedAt")]
    generated_at: String,
}

#[derive(Debug, Serialize)]
struct HeartbeatSpec {
    pid: u32,
    #[serde(rename = "registryPath")]
    registry_path: String,
    #[serde(rename = "nextWakeAt")]
    next_wake_at: Option<String>,
    #[serde(rename = "pendingCount")]
    pending_count: usize,
}

struct SchedulerContext {
    app_root: PathBuf,
    registry_script: PathBuf,
    last_rebuild: Option<DateTime<Utc>>,
}

impl SchedulerContext {
    fn new(app_root: PathBuf) -> Self {
        let registry_script = app_root.join(".business/bin/business_schedule_registry.py");
        Self {
            app_root,
            registry_script,
            last_rebuild: None,
        }
    }

    fn state_dir(&self) -> PathBuf {
        self.app_root.join(".business/state")
    }

    fn registry_path(&self) -> PathBuf {
        self.state_dir().join("schedule-registry.yaml")
    }

    fn heartbeat_path(&self) -> PathBuf {
        self.state_dir().join("scheduler-heartbeat.yaml")
    }

    fn workflows_dir(&self) -> PathBuf {
        self.app_root.join(".business/workflows")
    }

    fn rebuild_registry(&self) -> Result<(), String> {
        let status = Command::new("python3")
            .arg(&self.registry_script)
            .arg("rebuild")
            .current_dir(&self.app_root)
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .status()
            .map_err(|e| e.to_string())?;
        if status.success() {
            Ok(())
        } else {
            Err(format!("registry rebuild failed: {:?}", status.code()))
        }
    }

    fn maybe_rebuild(&mut self) {
        let now = Utc::now();
        if let Some(last) = self.last_rebuild {
            if (now - last).num_seconds() < REBUILD_DEBOUNCE_SECS as i64 {
                return;
            }
        }
        if let Err(err) = self.rebuild_registry() {
            eprintln!("[business-scheduler] rebuild warning: {err}");
        } else {
            self.last_rebuild = Some(now);
        }
    }

    fn load_registry(&self) -> Option<ScheduleRegistry> {
        let path = self.registry_path();
        if !path.is_file() {
            return None;
        }
        let raw = std::fs::read_to_string(&path).map_err(|e| e.to_string()).ok()?;
        serde_yaml::from_str(&raw).ok()
    }

    fn process_pending(&self) {
        let status = Command::new("python3")
            .arg(&self.registry_script)
            .arg("process-pending")
            .current_dir(&self.app_root)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
        if let Err(err) = status {
            eprintln!("[business-scheduler] process-pending error: {err}");
        }
    }

    fn fire_entry(&self, entry_id: &str) {
        let status = Command::new("python3")
            .arg(&self.registry_script)
            .arg("fire")
            .arg("--entry-id")
            .arg(entry_id)
            .arg("--source")
            .arg("timer")
            .current_dir(&self.app_root)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
        if let Err(err) = status {
            eprintln!("[business-scheduler] fire {entry_id} error: {err}");
        }
    }

    fn due_entries(&self, registry: &ScheduleRegistry) -> Vec<String> {
        let now = Utc::now();
        let mut due = Vec::new();
        for entry in &registry.spec.entries {
            if entry.enabled == Some(false) {
                continue;
            }
            if entry.trigger.trigger_type != "schedule" {
                continue;
            }
            let next_raw = entry.next_run_at.as_ref();
            if next_raw.is_none() {
                continue;
            }
            let normalized = next_raw.unwrap().replace('Z', "+00:00");
            let parsed = DateTime::parse_from_rfc3339(&normalized);
            if let Ok(next) = parsed {
                let next_utc = next.with_timezone(&Utc);
                if next_utc <= now {
                    due.push(entry.id.clone());
                }
            }
        }
        due
    }

    fn min_next_wake(&self, registry: &ScheduleRegistry) -> Option<String> {
        let mut min: Option<DateTime<Utc>> = None;
        for entry in &registry.spec.entries {
            if entry.enabled == Some(false) {
                continue;
            }
            if entry.trigger.trigger_type != "schedule" {
                continue;
            }
            if let Some(raw) = &entry.next_run_at {
                let normalized = raw.replace('Z', "+00:00");
                if let Ok(parsed) = DateTime::parse_from_rfc3339(&normalized) {
                    let next = parsed.with_timezone(&Utc);
                    if min.map(|m| next < m).unwrap_or(true) {
                        min = Some(next);
                    }
                }
            }
        }
        min.map(|dt| dt.to_rfc3339())
    }

    fn write_heartbeat(&self, next_wake: Option<String>) {
        let doc = HeartbeatDoc {
            api_version: "business.jambu/v1".to_string(),
            kind: "SchedulerHeartbeat".to_string(),
            metadata: HeartbeatMetadata {
                generated_at: Utc::now().to_rfc3339(),
            },
            spec: HeartbeatSpec {
                pid: std::process::id(),
                registry_path: ".business/state/schedule-registry.yaml".to_string(),
                next_wake_at: next_wake,
                pending_count: 0,
            },
        };
        let yaml = serde_yaml::to_string(&doc).unwrap_or_default();
        let path = self.heartbeat_path();
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let tmp = path.with_extension("yaml.tmp");
        if std::fs::write(&tmp, yaml).is_ok() {
            let _ = std::fs::rename(&tmp, &path);
        }
    }

    fn workflows_changed(&self) -> bool {
        let dir = self.workflows_dir();
        if !dir.is_dir() {
            return false;
        }
        let entries = std::fs::read_dir(&dir).ok();
        entries.map_or(false, |read| {
            read.filter_map(|e| e.ok()).any(|entry| {
                entry.path().extension().map(|ext| ext == "yaml").unwrap_or(false)
            })
        })
    }

    async fn tick(&mut self) {
        if self.workflows_changed() {
            self.maybe_rebuild();
        }

        self.process_pending();

        let registry = self.load_registry();
        let next_wake = registry.as_ref().and_then(|r| self.min_next_wake(r));

        if let Some(reg) = registry {
            for entry_id in self.due_entries(&reg) {
                self.fire_entry(&entry_id);
            }
        }

        self.write_heartbeat(next_wake);
    }
}

fn resolve_app_root(args: &[String]) -> PathBuf {
    for (idx, value) in args.iter().enumerate() {
        if value == "--app-root" {
            if let Some(path) = args.get(idx + 1) {
                return PathBuf::from(path);
            }
        }
    }
    std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
}

#[tokio::main]
async fn main() {
    let args: Vec<String> = std::env::args().collect();
    let app_root = resolve_app_root(&args);
    if !app_root.join(".business").is_dir() {
        eprintln!(
            "[business-scheduler] invalid app root (missing .business): {}",
            app_root.display()
        );
        std::process::exit(1);
    }

    let mut ctx = SchedulerContext::new(app_root);
    if let Err(err) = ctx.rebuild_registry() {
        eprintln!("[business-scheduler] initial rebuild failed: {err}");
    } else {
        ctx.last_rebuild = Some(Utc::now());
    }

    eprintln!(
        "[business-scheduler] started pid={} app_root={}",
        std::process::id(),
        ctx.app_root.display()
    );

    loop {
        ctx.tick().await;
        tokio::time::sleep(Duration::from_secs(TICK_SECS)).await;
    }
}
