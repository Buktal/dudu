//! 拼多多渠道（PMC 订阅推送，事实库 docs/research/channels/pinduoduo.md）：
//! POST JSON 明文 + query 公共参数（client_id / timestamp UNIX 秒 / sign），
//! 签名按事实库唯一实锤的请求签名规则（§4.1 官方三步逐字）——sign =
//! UPPER(MD5(client_secret + 按 ASCII 升序 k+v 拼接 + client_secret))，官方向量
//! E4DE3ED21002510DED352819E7AE6775 已核验（§5.1，见 tests/golden.rs 黄金对拍）。
//!
//! 待核验(09-27)口径（不编造，事实库 §3/§7）：推送传输形态（回调 URL 配置、
//! challenge 握手、HTTP 方法/头字段）、消息 topic 目录、重试幂等均未取得官方
//! 原文——本模块只实现事实库已实锤的机制，验签探针语义同普通推送（同京东
//! 先例），订阅开/关接口 pdd.pmc.user.permit/cancel 仅接口名实锤（§2 照录，
//! 接口名本身待核验）不参与握手。
//!
//! 与其他渠道的差异全部留在本模块内（ADR-0001）：
//! - 签名（§4.1 逐字步骤）：「所有请求参数…以 ASCII 方式升序排列…按照参数名
//!   （key）参数值（value）的次序进行字符串拼接，拼接处不包含任何字符…在该长
//!   串的头部及尾部分别拼接 client_secret…使用 MD5 算法加密后…转为大写」；
//!   签名参数集 = 公共参数（client_id/timestamp，§4.1 表必传项）+ 事件明文
//!   顶层标量 kv（官方 §5.1 请求 body 即扁平 kv 的 JSON，逐字节透传不重排）
//! - 探针握手（§3.1 验证握手 → 待核验(09-27)）：官方未给 challenge/verify
//!   口径，连接测试即发官方订单状态样本明文（§2.1 照录状态 1-待发货）+
//!   合规签名的探针（语义同普通推送），期望 HTTP 200
//! - 直发：POST 明文 JSON（逐字节透传不重排）+ query 公共参数；幂等键官方
//!   口径待核验，msg_id 快照取载荷订单号
//! - 应答（§3 → 待核验(09-27)）：推送应答无官方口径，模板期望回执取最中性
//!   签收语义 HTTP 200 + 不校验正文

#[cfg(test)]
mod tests;

use crate::connections::util::{append_absent, md5_wrapped_sign, now_secs};

use super::{
    no_body_check, no_reply, probe_handshake_outcome, send_measured_outcome, ConnectionConfig,
    DispatchOutcome, DispatchSnapshot, HandshakeOutcome,
};

/// 官方订单状态样本明文（§2.1 照录状态 1-待发货 + §5.1 order_status 参数
/// 词汇；JSON number 形态同官方 §5.1 请求 body 逐字）：推送探针复用该样本
/// （官方验证握手待核验(09-27)，以带合规签名的官方状态样本作探针，语义同
/// 普通推送）。
pub(crate) const GOLDEN_PROBE_PLAINTEXT: &str = r#"{"order_id":"123456789","order_status":1}"#;

/// 失败重试口径（§3.3 → 待核验(09-27)）：官方重试间隔/次数未取得，超时文案
/// 附待核验提示。
const RETRY_NOTE: &str = "（官方重试口径待核验(09-27)，事实库 §3.3）";

/// 公共参数 timestamp 的形态（§4.1 表逐字：「时间戳，UNIX 时间（秒）」）。
pub(crate) fn pdd_timestamp(unix_secs: u64) -> String {
    unix_secs.to_string()
}

/// 拼多多签名（事实库 §4.1 官方三步逐字规则）：所有请求参数按 ASCII 升序
/// 排列（Rust 字符串比较即字节序 = ASCII 序），按 k+v 次序无缝拼接，
/// client_secret 夹两端，MD5 大写。输入参数序不敏感（内部排序）。
/// 算法与京东 JOS 签名同形，单点在 util（[`md5_wrapped_sign`]，审计退件
/// 去重），本函数只承载拼多多侧协议名与 §4.1 官方向量口径。
pub(crate) fn pdd_sign(params: &[(&str, &str)], client_secret: &str) -> String {
    md5_wrapped_sign(params, client_secret)
}

/// 事件明文顶层 kv → 签名参数集（§4.1「所有请求参数」口径）：官方 §5.1 请求
/// body 即扁平 kv 的 JSON，标量按原文文本参与（number/bool 走 serde 文本形态，
/// 如 `"order_status": 1` 参签为 "1"）；嵌套结构取紧凑 JSON 文本（确定性），
/// null 跳过。推送载荷正文属 SPA 待复核范畴（事实库 §7.1），骨架扁平无嵌套。
pub(crate) fn payload_params(body: &str) -> Vec<(String, String)> {
    let parsed: serde_json::Value = serde_json::from_str(body).unwrap_or(serde_json::Value::Null);
    let Some(fields) = parsed.as_object() else {
        return Vec::new();
    };
    fields
        .iter()
        .filter_map(|(key, value)| {
            let text = match value {
                serde_json::Value::Null => return None,
                serde_json::Value::String(text) => text.clone(),
                serde_json::Value::Number(number) => number.to_string(),
                serde_json::Value::Bool(flag) => flag.to_string(),
                other => serde_json::to_string(other).unwrap_or_default(),
            };
            Some((key.clone(), text))
        })
        .collect()
}

/// 从明文 JSON 提取订单号快照：order_id（订单推送）；均缺失不落值（幂等键
/// 官方口径待核验(09-27)，取载荷订单号作近似排重键）。
fn message_id_of(body: &str) -> String {
    serde_json::from_str::<serde_json::Value>(body)
        .ok()
        .and_then(|value| value.get("order_id").and_then(|id| id.as_str()).map(String::from))
        .unwrap_or_default()
}

/// 直发签名参数集：公共参数（client_id/timestamp，§4.1 表必传项）+ 明文顶层
/// kv；同名键以明文为准（公共参数让位，防重复键破坏排序拼串）。
fn sign_params(
    client_id: &str,
    timestamp: &str,
    payload: &[(String, String)],
) -> Vec<(String, String)> {
    let mut params: Vec<(String, String)> = payload.to_vec();
    append_absent(&mut params, &[("client_id", client_id), ("timestamp", timestamp)]);
    params
}

/// POST 明文 JSON + query 公共参数（client_id/timestamp/sign）：body 逐字节
/// 透传不重排（ADR-0001）；签名覆盖公共参数与明文顶层 kv（§4.1 规则）；
/// timestamp 快照落 UNIX 秒（§4.1 表形态）。
fn post_json(
    client: &reqwest::blocking::Client,
    url: &str,
    client_id: &str,
    client_secret: &str,
    body: &str,
) -> DispatchOutcome {
    let timestamp = pdd_timestamp(now_secs());
    let params = sign_params(client_id, &timestamp, &payload_params(body));
    let borrowed: Vec<(&str, &str)> =
        params.iter().map(|(key, value)| (key.as_str(), value.as_str())).collect();
    let signature = pdd_sign(&borrowed, client_secret);
    send_measured_outcome(
        client
        .post(url)
        .query(&[
            ("client_id", client_id),
            ("timestamp", timestamp.as_str()),
            ("sign", signature.as_str()),
        ])
        .header("Content-Type", "application/json")
        .body(body.to_string()),
        RETRY_NOTE,
        DispatchSnapshot {
            msg_id: message_id_of(body),
            signature,
            timestamp: Some(timestamp),
            request_body: Some(body.to_string()),
        },
        no_reply,
    )
}

/// 连接测试（§3.1 验证握手 → 待核验(09-27)）：官方未给 challenge/verify 口径，
/// 探针即官方订单状态样本明文（§2.1 照录状态 1-待发货）+ 合规签名（语义同
/// 普通推送），期望 HTTP 200（应答正文无口径）。
/// 私有协议原语：对外只经 [`Adapter`](super::ChannelAdapter) 路由。
fn verify_handshake(
    client: &reqwest::blocking::Client,
    config: &ConnectionConfig,
) -> HandshakeOutcome {
    let ConnectionConfig::Pinduoduo {
        url,
        client_id,
        client_secret,
    } = config
    else {
        return HandshakeOutcome {
            ok: false,
            message: "配置不是拼多多渠道，无法执行推送探针握手".into(),
        };
    };
    let outcome = post_json(client, url, client_id, client_secret, GOLDEN_PROBE_PLAINTEXT);
    probe_handshake_outcome(
        outcome,
        RETRY_NOTE,
        "推送探针",
        "官方验证握手口径待核验(09-27)，探针语义同普通推送，期望 HTTP 200",
        "推送探针被接受：PMC 网关签名 POST（sign = UPPER(MD5(client_secret+ASCII 排序 k+v+client_secret))）到达目标，返回 HTTP 200",
        no_body_check,
    )
}

/// 拼多多直发（PMC 订阅推送模拟）：明文 JSON 逐字节透传 + query 公共参数
/// （签名覆盖 client_id/timestamp 与明文顶层 kv）。明文由前端逐字节拼装，
/// 不重排（ADR-0001）；应答口径待核验(09-27)，由前端期望回执（HTTP 200/
/// 正文不校验）承载。
/// 私有协议原语：对外只经 [`Adapter`](super::ChannelAdapter) 路由。
fn dispatch_event(
    client: &reqwest::blocking::Client,
    config: &ConnectionConfig,
    plaintext: &str,
) -> DispatchOutcome {
    let ConnectionConfig::Pinduoduo {
        url,
        client_id,
        client_secret,
    } = config
    else {
        return DispatchOutcome::not_sent("配置不是拼多多渠道，无法直发");
    };
    post_json(client, url, client_id, client_secret, plaintext)
}

/// 拼多多渠道适配器：[`super::ChannelAdapter`] 的拼多多实现——推送探针握手与
/// UPPER(MD5) 网关签名直发；原语复用 util（md5_hex），差异不外溢。
pub(crate) struct Adapter;

impl super::ChannelAdapter for Adapter {
    fn id(&self) -> &'static str {
        "pinduoduo"
    }

    fn label(&self) -> &'static str {
        "拼多多"
    }

    fn matches(&self, config: &ConnectionConfig) -> bool {
        matches!(config, ConnectionConfig::Pinduoduo { .. })
    }

    fn url<'a>(&self, config: &'a ConnectionConfig) -> Option<&'a str> {
        let ConnectionConfig::Pinduoduo { url, .. } = config else {
            return None;
        };
        Some(url)
    }

    fn handshake_client(&self) -> reqwest::blocking::Client {
        // 生产用默认客户端：官方应答窗口未取得（待核验），本地沿用 5 秒上限
        super::client_with_timeout(std::time::Duration::from_secs(5))
    }

    fn verify_handshake(
        &self,
        client: &reqwest::blocking::Client,
        config: &ConnectionConfig,
    ) -> HandshakeOutcome {
        verify_handshake(client, config)
    }

    fn dispatch_event(
        &self,
        client: &reqwest::blocking::Client,
        config: &ConnectionConfig,
        plaintext: &str,
    ) -> DispatchOutcome {
        dispatch_event(client, config, plaintext)
    }
}
