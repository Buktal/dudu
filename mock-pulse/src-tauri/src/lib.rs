// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod connections;
mod definitions;
mod events;
mod plans;
mod runs;
mod scenarios;
mod sends;

use tauri::Manager;

/// TcpListener 测试基建共享单点（只在 cargo test 下编译，不进 release）。
#[cfg(test)]
mod test_support;

/// 应用数据目录（各域落盘命令共用的单点）：解析失败统一转 String
/// （Tauri 命令的 `Result<_, String>` 契约）。
pub(crate) fn app_data_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    app.path().app_data_dir().map_err(|err| err.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            connections::connections_load,
            connections::connections_save,
            connections::connections_test_douyin,
            connections::connections_test_wecom,
            connections::connections_test_wechat_mp,
            connections::connections_test_wechat_mini,
            connections::connections_test_feishu,
            connections::connections_test_dingtalk,
            connections::connections_test_qq,
            connections::connections_test_weibo,
            connections::connections_test_xiaohongshu,
            connections::connections_test_kuaishou,
            connections::connections_test_taobao,
            definitions::definitions_load,
            definitions::definitions_save,
            events::events_load,
            events::events_save,
            events::events_delete,
            plans::plans_load,
            plans::plans_save,
            plans::plans_delete,
            runs::runs_load,
            runs::runs_save,
            runs::executor::commands::start_plan_run,
            runs::executor::commands::start_scenario_run,
            runs::control::stop_run,
            scenarios::scenarios_load,
            scenarios::scenarios_save,
            scenarios::scenarios_delete,
            sends::sends_dispatch_direct,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
