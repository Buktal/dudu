//! 直发域：把前端逐字节拼装好的明文按渠道协议处理并真实 POST 到目标地址，
//! 随后用期望回执比对（runs::verdict）判定结论、组装成品单步快照返回——
//! 一次 invoke 完成「发送 → 判定 → RunStep」，前端拿到即可入列落盘。
//! Rust 只负责签名/加密、头部构造、网络与判定，不重新解析/重排 body。

use std::sync::atomic::Ordering;

use serde::Serialize;

use crate::connections::{adapter_of, dispatch_client, ConnectionConfig, DispatchOutcome};
use crate::runs::control;
use crate::runs::verdict::ExpectedReceipt;
use crate::runs::{sent_step, RunStep, StepFacts};

/// 直发结果：成品单步快照（期望比对已完成）+ 用户是否请求过停止。
/// 停止先于发送：请求不发出，回执记「用户已停止运行」，结论仍按期望比对；
/// 停止发生在在途：请求自然完成，保留真实回执并以 cancelled 标记。
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DirectSendOutcome {
    pub step: RunStep,
    pub cancelled: bool,
}

/// 直发单步：经适配器注册表按渠道路由协议原语发送（抖音 sha1 签名 JSON POST /
/// 企微 AES 信封 XML POST；协议差异留在 adapter 实现内），回执与期望比对后
/// 组装成品步骤。网络等待放到阻塞线程池，避免卡住主线程。
#[tauri::command]
pub async fn sends_dispatch_direct(
    config: ConnectionConfig,
    body: String,
    event_name: String,
    event_id: String,
    expected: Option<ExpectedReceipt>,
    run_id: Option<String>,
) -> Result<DirectSendOutcome, String> {
    let active = control::register(&run_id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string()))?;
    tauri::async_runtime::spawn_blocking(move || {
        direct_step(
            &config,
            &body,
            &event_name,
            &event_id,
            expected.as_ref(),
            || active.cancelled.load(Ordering::SeqCst),
        )
    })
    .await
    .map_err(|err| err.to_string())
}

/// 同步直发：取消先于发送时不发请求；否则按渠道路由协议原语；
/// 收尾时复查取消旗标，覆盖「停止发生在请求在途」的窗口。
fn direct_step(
    config: &ConnectionConfig,
    body: &str,
    event_name: &str,
    event_id: &str,
    expected: Option<&ExpectedReceipt>,
    cancelled: impl Fn() -> bool,
) -> DirectSendOutcome {
    let adapter = adapter_of(config);
    let facts = StepFacts {
        event_name: event_name.into(),
        event_id: event_id.into(),
        channel: adapter.id().into(),
        url: adapter.url(config).unwrap_or_default().into(),
        payload: body.into(),
    };
    let step = if cancelled() {
        // 停止先于发送：请求不发出，回执记停止原因（结论仍按期望比对成形）；
        // 明文本应作为请求体发出，请求快照照常保留
        sent_step(
            expected,
            facts,
            DispatchOutcome {
                request_body: Some(body.into()),
                ..DispatchOutcome::not_sent("用户已停止运行")
            },
        )
    } else {
        let outcome = adapter.dispatch_event(&dispatch_client(), config, body);
        sent_step(expected, facts, outcome)
    };
    DirectSendOutcome {
        step,
        cancelled: cancelled(),
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use crate::connections::wecom;
    // 企微官方黄金例唯一出处为 wecom::crypto：按测试旧名引作配置与断言
    use crate::connections::wecom::crypto::{
        GOLDEN_CORP_ID as WC_CORP_ID, GOLDEN_ENCODING_AES_KEY as WC_AES_KEY,
        GOLDEN_TOKEN as WC_TOKEN,
    };
    use crate::runs::verdict::ReceiptBodyMode;
    use crate::test_support::{ok_responder, start_serial_server, Responder};

    use super::*;

    fn expected(status: u16, body: &str, mode: ReceiptBodyMode) -> ExpectedReceipt {
        ExpectedReceipt {
            status,
            body: body.into(),
            body_mode: mode,
        }
    }

    fn no_cancel() -> impl Fn() -> bool {
        || false
    }

    /// 本地串行服务器：依次处理 count 个请求，返回 hook url（body 之外的
    /// 录制细节本域不关心，网络基建在 crate::test_support 共享）。
    /// 返回的 Receiver 须由测试持有到断言结束——它是服务线程的存活凭证
    /// （提前丢弃会让共享 server 在响应首个请求后因 SendError 退出）。
    fn serial_url(count: usize, responder: Responder) -> (String, std::sync::mpsc::Receiver<crate::test_support::RecordedPost>) {
        let (addr, rx) = start_serial_server(count, responder, std::time::Duration::ZERO);
        (format!("http://{addr}/hook"), rx)
    }

    fn douyin_config(url: String) -> ConnectionConfig {
        ConnectionConfig::Douyin {
            url,
            client_key: "tt_key".into(),
            client_secret: "tt_secret".into(),
        }
    }

    fn wecom_config(url: String) -> ConnectionConfig {
        ConnectionConfig::Wecom {
            url,
            corp_id: WC_CORP_ID.into(),
            token: WC_TOKEN.into(),
            encoding_aes_key: WC_AES_KEY.into(),
            agent_id: "218".into(),
        }
    }

    #[test]
    fn douyin_direct_records_protocol_snapshot_and_contains_verdict() {
        let (url, _rx) = serial_url(1, ok_responder());
        let outcome = direct_step(
            &douyin_config(url.clone()),
            r#"{"event":"im_receive_msg","content":{"text":"你好，抖音"}}"#,
            "新客问价",
            "evt-001",
            Some(&expected(200, "ok", ReceiptBodyMode::Contains)),
            no_cancel(),
        );

        assert!(!outcome.cancelled);
        let step = &outcome.step;
        assert_eq!(step.channel, "douyin");
        assert_eq!(step.event_name, "新客问价");
        assert_eq!(step.event_id, "evt-001");
        assert_eq!(step.url, url);
        // 明文逐字节透传进载荷与请求快照
        assert_eq!(
            step.payload,
            r#"{"event":"im_receive_msg","content":{"text":"你好，抖音"}}"#
        );
        assert_eq!(step.request_body.as_deref(), Some(step.payload.as_str()));
        assert_eq!(
            step.expected.as_ref(),
            Some(&expected(200, "ok", ReceiptBodyMode::Contains))
        );
        assert_eq!(step.signature.len(), 40, "X-Douyin-Signature = sha1 hex");
        let parts: Vec<usize> = step.msg_id.split('-').map(|p| p.len()).collect();
        assert_eq!(parts, vec![8, 4, 4, 4, 12], "Msg-Id 应为 uuid");
        assert_eq!(step.timestamp, None);
        assert_eq!(step.receipt.status, 200);
        assert_eq!(step.receipt.body, "ok");
        assert!(!step.skipped);
        assert!(step.verdict.passed, "{:?}", step.verdict);
        assert_eq!(step.verdict.reason, "HTTP 200，正文包含「ok」");
    }

    #[test]
    fn douyin_direct_fails_on_status_mismatch() {
        let responder: Responder = Arc::new(|_, _, _| {
            (
                "HTTP/1.1 500 Internal Server Error".to_string(),
                "boom".into(),
            )
        });
        let (url, _rx) = serial_url(1, responder);
        let outcome = direct_step(
            &douyin_config(url),
            "{}",
            "新客问价",
            "evt-001",
            Some(&expected(200, "", ReceiptBodyMode::Contains)),
            no_cancel(),
        );

        assert!(!outcome.step.verdict.passed);
        assert_eq!(outcome.step.verdict.reason, "HTTP 500，期望 HTTP 200");
        assert_eq!(outcome.step.receipt.status, 500);
    }

    #[test]
    fn douyin_direct_covers_equals_jsonfield_and_empty_expectation() {
        let (url, _rx) = serial_url(
            3,
            Arc::new(|_, _, _| {
                (
                    "HTTP/1.1 200 OK".to_string(),
                    r#"{"code":0,"extra":1}"#.to_string(),
                )
            }),
        );
        let config = douyin_config(url);

        // equals：逐字相等
        let equals = direct_step(
            &config,
            "{}",
            "e",
            "evt-e",
            Some(&expected(
                200,
                r#"{"code":0,"extra":1}"#,
                ReceiptBodyMode::Equals,
            )),
            no_cancel(),
        );
        assert!(equals.step.verdict.passed);
        assert_eq!(equals.step.verdict.reason, "HTTP 200，正文与期望逐字一致");

        // jsonField：期望是回执的子集
        let json_field = direct_step(
            &config,
            "{}",
            "j",
            "evt-j",
            Some(&expected(200, r#"{"code":0}"#, ReceiptBodyMode::JsonField)),
            no_cancel(),
        );
        assert!(
            json_field.step.verdict.passed,
            "{:?}",
            json_field.step.verdict
        );
        assert_eq!(
            json_field.step.verdict.reason,
            "HTTP 200，回执包含期望的全部 JSON 字段"
        );

        // 无期望正文（空 body）：只看状态码
        let empty = direct_step(
            &config,
            "{}",
            "n",
            "evt-n",
            Some(&expected(200, "", ReceiptBodyMode::Contains)),
            no_cancel(),
        );
        assert!(empty.step.verdict.passed);
        assert_eq!(empty.step.verdict.reason, "HTTP 200，与期望状态一致");
    }

    #[test]
    fn wecom_direct_covers_three_official_shapes() {
        // 第三形态：回一个可解密的加密被动回复包
        let reply_plaintext = "<xml><Content><![CDATA[你好呀]]></Content></xml>";
        let reply_encrypt = wecom::encrypt_msg(
            WC_AES_KEY,
            &[3u8; 16],
            reply_plaintext.as_bytes(),
            WC_CORP_ID,
        )
        .unwrap();
        let responder: Responder = Arc::new(move |index, _, _| {
            let body = match index {
                0 => "success".to_string(),
                1 => "success".to_string(),
                _ => format!("<xml><Encrypt><![CDATA[{reply_encrypt}]]></Encrypt></xml>"),
            };
            ("HTTP/1.1 200 OK".to_string(), body)
        });
        let (url, _rx) = serial_url(3, responder);
        let config = wecom_config(url);
        let plaintext = "<xml><MsgType><![CDATA[text]]></MsgType></xml>";

        // 形态一：期望空串，回执非空 → 不通过
        let empty = direct_step(
            &config,
            plaintext,
            "w",
            "evt-w",
            Some(&expected(200, "", ReceiptBodyMode::WecomReply)),
            no_cancel(),
        );
        assert!(!empty.step.verdict.passed);
        assert_eq!(
            empty.step.verdict.reason,
            "HTTP 200，期望空串，实际「success」"
        );

        // 形态二：期望 success（逐字，不带引号）
        let success = direct_step(
            &config,
            plaintext,
            "w",
            "evt-w",
            Some(&expected(200, "success", ReceiptBodyMode::WecomReply)),
            no_cancel(),
        );
        assert!(success.step.verdict.passed);
        assert_eq!(
            success.step.verdict.reason,
            "HTTP 200，回执为 success（不带引号）"
        );

        // 形态三：期望片段须在解密被动回复明文中出现
        let encrypted = direct_step(
            &config,
            plaintext,
            "w",
            "evt-w",
            Some(&expected(200, "你好呀", ReceiptBodyMode::WecomReply)),
            no_cancel(),
        );
        let step = &encrypted.step;
        assert!(step.verdict.passed, "{:?}", step.verdict);
        assert_eq!(step.verdict.reason, "HTTP 200，解密被动回复包含「你好呀」");
        // 企微协议要素快照：明文透传 + 加密信封入请求快照 + 签名/时间戳/nonce
        assert_eq!(step.payload, plaintext);
        assert!(step
            .request_body
            .as_deref()
            .is_some_and(|envelope| envelope.contains("<Encrypt><![CDATA[")));
        assert!(!step.signature.is_empty());
        assert!(step.timestamp.is_some());
        assert_eq!(step.msg_id.len(), 32, "nonce = uuid simple");
        assert_eq!(step.receipt.reply.as_deref(), Some(reply_plaintext));
    }

    #[test]
    fn direct_without_expectation_only_records_receipt() {
        let (url, _rx) = serial_url(1, ok_responder());
        let outcome = direct_step(
            &douyin_config(url),
            "{}",
            "新客问价",
            "evt-001",
            None,
            no_cancel(),
        );

        let step = &outcome.step;
        assert_eq!(step.expected, None);
        assert!(step.verdict.passed);
        assert_eq!(step.verdict.reason, "未设期望，仅记录回执");
        assert_eq!(step.receipt.status, 200);
    }

    #[test]
    fn cancel_before_send_skips_request_but_keeps_expected_verdict() {
        // url 指向未监听端口：若发出请求会以连接失败收场，断言即失败
        let outcome = direct_step(
            &douyin_config("http://127.0.0.1:9/hook".into()),
            r#"{"event":"im_receive_msg"}"#,
            "新客问价",
            "evt-001",
            Some(&expected(200, "", ReceiptBodyMode::Contains)),
            || true,
        );

        assert!(outcome.cancelled);
        let step = &outcome.step;
        assert_eq!(step.receipt.status, 0);
        assert_eq!(step.receipt.error.as_deref(), Some("用户已停止运行"));
        assert!(!step.verdict.passed);
        assert_eq!(step.verdict.reason, "未收到响应，期望 HTTP 200");
        // 请求未发出：载荷快照保留明文，签名/唯一标识为空
        assert_eq!(step.payload, r#"{"event":"im_receive_msg"}"#);
        assert_eq!(step.request_body.as_deref(), Some(step.payload.as_str()));
        assert_eq!(step.signature, "");
        assert_eq!(step.msg_id, "");
    }

    #[test]
    fn direct_outcome_serializes_camel_case_for_frontend() {
        // 取消路径无需网络，直接产出成品步骤作为序列化样本
        let outcome = direct_step(
            &douyin_config("http://127.0.0.1:9/hook".into()),
            "{}",
            "新客问价",
            "evt-001",
            Some(&expected(200, "", ReceiptBodyMode::Contains)),
            || true,
        );
        let raw = serde_json::to_string(&outcome).unwrap();
        assert!(raw.contains("\"step\""));
        assert!(raw.contains("\"cancelled\":true"));
        assert!(raw.contains("\"eventName\""));
        assert!(raw.contains("\"msgId\""));
        assert!(raw.contains("\"elapsedMs\""));
        assert!(!raw.contains("event_name"));
        assert!(!raw.contains("elapsed_ms"));
    }
}
