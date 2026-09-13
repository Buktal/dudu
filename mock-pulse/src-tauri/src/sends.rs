//! 直发域：把前端逐字节拼装好的明文按渠道协议处理并真实 POST 到目标地址。
//! Rust 只负责签名/加密、头部构造与网络，不重新解析/重排 body。

use crate::connections::douyin::{self, DispatchOutcome};
use crate::connections::wecom::{self, WecomDispatchOutcome};
use crate::connections::ConnectionConfig;
use crate::runs::control;
use std::sync::atomic::Ordering;

/// 抖音直发：X-Douyin-Signature = sha1hex(client_secret + body)、Msg-Id = uuid v4。
/// 网络等待放到阻塞线程池，避免卡住主线程。
#[tauri::command]
pub async fn sends_dispatch_douyin(
    config: ConnectionConfig,
    body: String,
    run_id: Option<String>,
) -> Result<DispatchOutcome, String> {
    let active = control::register(&run_id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string()))?;
    tauri::async_runtime::spawn_blocking(move || {
        if active.cancelled.load(Ordering::SeqCst) {
            return DispatchOutcome {
                msg_id: String::new(),
                signature: String::new(),
                status: 0,
                elapsed_ms: 0,
                body: String::new(),
                error: Some("用户已停止运行".into()),
            };
        }
        douyin::dispatch_event(&douyin::handshake_client(), &config, &body)
    })
    .await
    .map_err(|err| err.to_string())
}

/// 企微直发：明文 XML → AES 加密信封（receiveid=corpId）→
/// msg_signature 四值签名 → text/xml POST；加密被动回复解密明文一并返回。
/// 网络等待放到阻塞线程池，避免卡住主线程。
#[tauri::command]
pub async fn sends_dispatch_wecom(
    config: ConnectionConfig,
    body: String,
    run_id: Option<String>,
) -> Result<WecomDispatchOutcome, String> {
    let active = control::register(&run_id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string()))?;
    tauri::async_runtime::spawn_blocking(move || {
        if active.cancelled.load(Ordering::SeqCst) {
            return WecomDispatchOutcome {
                request_body: None,
                signature: String::new(),
                timestamp: String::new(),
                nonce: String::new(),
                status: 0,
                elapsed_ms: 0,
                body: String::new(),
                reply: None,
                error: Some("用户已停止运行".into()),
            };
        }
        wecom::dispatch_event(&wecom::dispatch_client(), &config, &body)
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
