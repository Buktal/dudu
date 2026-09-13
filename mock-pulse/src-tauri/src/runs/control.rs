//! 用户停止与执行生命周期。取消信号在等待中和下一步开始前生效。
use std::collections::{HashMap, VecDeque};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};

#[derive(Default)]
struct Registry {
    active: HashMap<String, Arc<AtomicBool>>,
    early_stops: VecDeque<String>,
}

fn registry() -> &'static Mutex<Registry> {
    static RUNS: OnceLock<Mutex<Registry>> = OnceLock::new();
    RUNS.get_or_init(|| Mutex::new(Registry::default()))
}

pub struct ActiveRun {
    id: String,
    pub cancelled: Arc<AtomicBool>,
}

impl Drop for ActiveRun {
    fn drop(&mut self) {
        registry()
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .active
            .remove(&self.id);
    }
}

pub fn register(id: &str) -> Result<ActiveRun, String> {
    let mut runs = registry().lock().map_err(|error| error.to_string())?;
    if !runs.active.is_empty() {
        return Err("请先结束当前运行。".into());
    }
    let stopped = runs.early_stops.iter().position(|run_id| run_id == id);
    if let Some(index) = stopped {
        runs.early_stops.remove(index);
    }
    let cancelled = Arc::new(AtomicBool::new(stopped.is_some()));
    runs.active.insert(id.into(), Arc::clone(&cancelled));
    Ok(ActiveRun {
        id: id.into(),
        cancelled,
    })
}

#[tauri::command]
pub fn stop_run(run_id: String) -> Result<(), String> {
    let mut runs = registry().lock().map_err(|error| error.to_string())?;
    if let Some(cancelled) = runs.active.get(&run_id) {
        cancelled.store(true, Ordering::SeqCst);
    } else if !runs.early_stops.contains(&run_id) {
        // IPC 可能先收到停止、后登记启动；保留有界的提前停止请求。
        runs.early_stops.push_back(run_id);
        if runs.early_stops.len() > 64 {
            runs.early_stops.pop_front();
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stop_before_registration_is_applied_and_active_guard_releases() {
        let id = uuid::Uuid::new_v4().to_string();
        stop_run(id.clone()).unwrap();
        let active = register(&id).unwrap();
        assert!(active.cancelled.load(Ordering::SeqCst));
        assert!(register("another-run").is_err());
        drop(active);
        let next = register("another-run").unwrap();
        assert!(!next.cancelled.load(Ordering::SeqCst));
    }
}
