//! 直发域：把前端逐字节拼装好的明文按渠道协议签名并真实 POST 到目标地址。
//! Rust 只负责签名、头部构造与网络，不重新解析/重排 body。

use crate::connections::douyin::{self, DispatchOutcome};
use crate::connections::ConnectionConfig;

/// 抖音直发：X-Douyin-Signature = sha1hex(client_secret + body)、Msg-Id = uuid v4。
/// 网络等待放到阻塞线程池，避免卡住主线程。
#[tauri::command]
pub async fn sends_dispatch_douyin(
    config: ConnectionConfig,
    body: String,
) -> Result<DispatchOutcome, String> {
    tauri::async_runtime::spawn_blocking(move || {
        douyin::dispatch_event(&douyin::handshake_client(), &config, &body)
    })
    .await
    .map_err(|err| err.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dispatch_outcome_serializes_camel_case_for_frontend() {
        let outcome = DispatchOutcome {
            msg_id: "0f8c1b2a-3d4e-4f5a-9b8c-7d6e5f4a3b2c".into(),
            signature: "a".repeat(40),
            status: 200,
            elapsed_ms: 12,
            body: "{\"code\":0}".into(),
            error: None,
        };
        let raw = serde_json::to_string(&outcome).unwrap();
        assert!(raw.contains("\"msgId\""));
        assert!(raw.contains("\"elapsedMs\""));
        assert!(!raw.contains("elapsed_ms"));
    }
}
