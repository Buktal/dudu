//! B站渠道（开放平台 Webhooks，事实库 docs/research/channels/bilibili.md）：
//! HTTPS POST 明文 JSON 事件信封 {event, content, timestamp}（§4.3 无加密
//! 记载——镜像页无加密信封描述、官方事件页示例均为明文）；签名取官方实锤的
//! 服务端签名头表（§4.2 摘录：x-bili-* 六头 + Authorization），镜像口径的
//! 回调 SHA1 + x-bilibili-signature 拼接法官方无印证且拼接方式含糊（§4.1
//! 「不可直接实现」），不作模拟口径。首次验证握手 verify_webhooks（§3.2
//! 镜像口径，待核验(09-27)）：管理中心填回调地址失焦即 POST，期望原样回
//! {"data":<数值>}。
//!
//! 与其他渠道的差异全部留在本模块内（ADR-0001）：
//! - 签名头表（§4.2 官方摘录逐字段）：x-bili-accesskeyid(=client_id)/
//!   x-bili-content-md5(请求体按字符串 MD5 全小写；GET/空 body 对空串求)/
//!   x-bili-signature-method(=HMAC-SHA256)/x-bili-signature-nonce(全网唯一
//!   随机数，GUID 形态)/x-bili-signature-version(=2.0)/x-bili-timestamp
//!   (unix 秒，±10 分钟窗口)；另 Accept: application/json 为官方必填头。
//!   access-token（OAuth2 用户令牌）为开发者调 B站 API 的用户线要素，
//!   平台推送模拟不带
//! - 签名串（「签名机制」节官方正文未取，社区 DotnetDemo 自述口径 →
//!   待核验(09-27)）：x-bili-* 头按头名字典序排序后取值以 \n 连接，
//!   Authorization = HMAC-SHA256(app_secret, 签名串) 小写 hex（输出编码
//!   官方未给，取 hex 与淘宝 Authorization 形态一致）；官方无公开黄金向量
//!   → 测试以「签名→验签」自反 + 篡改必败锚定（tests/golden.rs）
//! - 握手（§3.2 镜像）：随机 data 整数进 verify_webhooks 信封（键序
//!   event → content → timestamp），期望 HTTP 200 且应答解析出 data 原样
//!   一致（回 JSON 信封无 data/回显改动均判失败）
//! - 直发（§附速查）：POST 明文 JSON 逐字节透传不重排 + 签名头表现算；
//!   官方包络无 message_id/event_id 幂等键字段 → msg_id 快照落
//!   x-bili-signature-nonce（每请求唯一的协议要素，同企微 nonce 先例）
//! - 应答（§3.3 镜像口径，照录注明待核验(09-27)）：每次请求 5s 建连超时
//!   即断；失败重试最多共推 3 次；官方无幂等键，消费方应做业务去重
//! - 范围：私信/客服无公开推送（§2.3 禁令原文），直播双体系长连与投稿
//!   属拉取/下行通道——均不入推送模拟

#[cfg(test)]
mod tests;

use crate::connections::util::{hmac_sha256_hex, md5_hex, utc8_timestamp};

use super::{request_error_reason, ConnectionConfig, DispatchOutcome, HandshakeOutcome};

/// 失败重试口径（§3.3 镜像口径，照录注明待核验）：5s 建连超时即断、失败
/// 重试最多共推 3 次、消费方去重。
const RETRY_NOTE: &str =
    "（官方口径：每次请求 5s 建连超时即断，失败重试最多共推 3 次，消费方应做业务去重）";

/// x-bili-signature-method 官方取值（§4.2 头表逐字）。
pub(crate) const SIGNATURE_METHOD: &str = "HMAC-SHA256";
/// x-bili-signature-version 官方取值（§4.2 头表逐字「如无单独说明取 2.0」）。
pub(crate) const SIGNATURE_VERSION: &str = "2.0";

/// 请求体 MD5（§4.2 头表逐字）：请求体当字符串做 MD5（全小写）；GET 或
/// body 为空时对空字符串求 MD5。
pub(crate) fn content_md5(body: &str) -> String {
    md5_hex(&[body])
}

/// 签名头表（§4.2 官方头表字段与取值，头名小写即请求头拼写；nonce/
/// timestamp 由请求现场生成）。
pub(crate) fn signing_headers(
    client_id: &str,
    body_md5: &str,
    timestamp: &str,
    nonce: &str,
) -> Vec<(&'static str, String)> {
    vec![
        ("x-bili-accesskeyid", client_id.to_string()),
        ("x-bili-content-md5", body_md5.to_string()),
        ("x-bili-signature-method", SIGNATURE_METHOD.to_string()),
        ("x-bili-signature-nonce", nonce.to_string()),
        ("x-bili-signature-version", SIGNATURE_VERSION.to_string()),
        ("x-bili-timestamp", timestamp.to_string()),
    ]
}

/// 签名串（官方正文未取，社区 DotnetDemo 自述口径 → 待核验(09-27)）：
/// x-bili-* 头按头名字典序排序后取值以 \n 连接。
pub(crate) fn signature_string(headers: &[(&str, String)]) -> String {
    let mut sorted: Vec<(&str, &str)> = headers
        .iter()
        .map(|(name, value)| (*name, value.as_str()))
        .collect();
    sorted.sort_by(|left, right| left.0.cmp(right.0));
    sorted
        .iter()
        .map(|(_, value)| *value)
        .collect::<Vec<_>>()
        .join("\n")
}

/// Authorization（§4.2）：HMAC-SHA256(app_secret, 签名串) 小写 hex（输出
/// 编码官方未给，取 hex 与淘宝 Authorization 形态一致，待核验(09-27)）。
pub(crate) fn authorization(app_secret: &str, headers: &[(&str, String)]) -> String {
    hmac_sha256_hex(app_secret, &signature_string(headers))
}

/// 事件 timestamp 的 UTC+8 字符串形态（§2.2 官方包络表实锤
/// yyyy-MM-dd HH:mm:ss、UTC+8；与 x-bili-timestamp 的 unix 秒并存）：
/// 历法换算复用 [`utc8_timestamp`]（civil_from_days 不手写）。
pub(crate) fn timestamp_utc8(epoch_secs: u64) -> String {
    utc8_timestamp(epoch_secs)
}

fn unix_timestamp_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|elapsed| elapsed.as_secs())
        .unwrap_or(0)
}

/// POST 明文 JSON + 签名头表 + Authorization：body 逐字节透传不重排
/// （ADR-0001），签名按现场生成的头表现算；nonce 落 msg_id 快照（官方无
/// 幂等键字段，每请求唯一要素）、timestamp 落 x-bili-timestamp 快照。
fn post_json(
    client: &reqwest::blocking::Client,
    url: &str,
    client_id: &str,
    app_secret: &str,
    body: &str,
) -> DispatchOutcome {
    if client_id.trim().is_empty() {
        return DispatchOutcome::not_sent(
            "Client ID 未配置：x-bili-accesskeyid 为官方签名头表必填项，缺失即请求不完整",
        );
    }
    if app_secret.trim().is_empty() {
        return DispatchOutcome::not_sent(
            "App Secret 未配置：Authorization = HMAC-SHA256 签名不可复算",
        );
    }
    let nonce = uuid::Uuid::new_v4().to_string();
    let timestamp = unix_timestamp_secs().to_string();
    let headers = signing_headers(client_id, &content_md5(body), &timestamp, &nonce);
    let signature = authorization(app_secret, &headers);
    let started = std::time::Instant::now();
    let mut request = client
        .post(url)
        .header("Accept", "application/json")
        .header("Content-Type", "application/json");
    for (name, value) in &headers {
        request = request.header(*name, value);
    }
    let response = request
        .header("Authorization", signature.clone())
        .body(body.to_string())
        .send();
    let elapsed_ms = started.elapsed().as_millis() as u64;
    let (status, receipt, error) = match response {
        Ok(response) => {
            let status = response.status().as_u16();
            let receipt = response.text().unwrap_or_default();
            (status, receipt, None)
        }
        Err(err) => (
            0,
            String::new(),
            Some(format!("{}：{err}", request_error_reason(&err, RETRY_NOTE))),
        ),
    };
    DispatchOutcome {
        msg_id: nonce,
        signature,
        timestamp: Some(timestamp),
        request_body: Some(body.to_string()),
        reply: None,
        status,
        elapsed_ms,
        body: receipt,
        error,
    }
}

/// verify_webhooks 请求信封（§3.2 镜像样本键序 event → content → timestamp，
/// data 为镜像样本 1371848576 同形态的 10 位整数、timestamp 为 UTC+8 字符串）。
pub(crate) fn probe_envelope(data: i64, timestamp: &str) -> String {
    serde_json::json!({
        "event": "verify_webhooks",
        "content": { "data": data },
        "timestamp": timestamp,
    })
    .to_string()
}

/// 握手 data：本侧生成同形态的 10 位数字（首位非零）——rand Uniform 均匀
/// 采样（原 uuid 字节 `% 9`/`% 10` 有模偏差，同 Alphanumeric 退件口径）。
fn random_probe_data() -> i64 {
    use rand::distributions::{Distribution, Uniform};
    let mut rng = rand::thread_rng();
    let digit = Uniform::new(0u8, 10);
    let head = Uniform::new_inclusive(1u8, 9);
    let digits = std::iter::once(head.sample(&mut rng))
        .chain(std::iter::repeat_with(|| digit.sample(&mut rng)).take(9))
        .map(|value| char::from(b'0' + value))
        .collect::<String>();
    digits.parse().unwrap_or(0)
}

/// verify_webhooks 应答核对（§3.2 镜像口径「解析出 data 值并原样返回」）：
/// 应答须为 JSON 且 data 与请求值一致（回 JSON 信封无 data/回显改动均失败）。
fn data_echo_check(response_body: &str, sent: i64) -> Result<(), String> {
    let Ok(parsed) = serde_json::from_str::<serde_json::Value>(response_body) else {
        return Err(format!("应答不是合法 JSON：{response_body}"));
    };
    match parsed.get("data").and_then(|value| value.as_i64()) {
        Some(echoed) if echoed == sent => Ok(()),
        Some(echoed) => Err(format!("应答 data 与请求不一致：{echoed}")),
        None => Err("应答缺少 data 字段（官方要求解析出 data 原样返回）".into()),
    }
}

/// 连接测试（§3.2 镜像口径，待核验(09-27)）：管理中心填回调地址失焦即发
/// verify_webhooks 校验——按官方信封键序构造（content.data 为随机 10 位
/// 整数、timestamp 为当前 UTC+8 字符串），带签名头表；期望 HTTP 200 且
/// 应答原样回 {"data":<数值>}。
/// 私有协议原语：对外只经 [`Adapter`](super::ChannelAdapter) 路由。
fn verify_handshake(
    client: &reqwest::blocking::Client,
    config: &ConnectionConfig,
) -> HandshakeOutcome {
    let ConnectionConfig::Bilibili {
        url,
        client_id,
        app_secret,
    } = config
    else {
        return HandshakeOutcome {
            ok: false,
            message: "配置不是 B站渠道，无法执行 verify_webhooks 握手".into(),
        };
    };
    let data = random_probe_data();
    let body = probe_envelope(data, &timestamp_utc8(unix_timestamp_secs()));
    let outcome = post_json(client, url, client_id, app_secret, &body);
    if let Some(error) = outcome.error {
        return HandshakeOutcome {
            ok: false,
            message: format!("{error}{RETRY_NOTE}"),
        };
    }
    if !(200..300).contains(&outcome.status) {
        return HandshakeOutcome {
            ok: false,
            message: format!(
                "目标返回 HTTP {}，verify_webhooks 握手未通过（期望 HTTP 200 原样回 {{\"data\":{data}}}）",
                outcome.status
            ),
        };
    }
    match data_echo_check(&outcome.body, data) {
        Ok(()) => HandshakeOutcome {
            ok: true,
            message: "verify_webhooks 握手成功：x-bili-* 签名头表 + HMAC-SHA256 POST 被接受，应答原样回 data（HTTP 200）".into(),
        },
        Err(reason) => HandshakeOutcome {
            ok: false,
            message: format!("HTTP {}，但{reason}", outcome.status),
        },
    }
}

/// B站直发（§附速查）：事件明文 JSON 逐字节透传 + 签名头表现算。明文由
/// 前端逐字节拼装，不重排（ADR-0001）；「HTTP 200、5s 建连超时、失败最多
/// 共推 3 次、消费方去重」的应答语义由前端期望回执（200/正文不校验）承载。
/// 私有协议原语：对外只经 [`Adapter`](super::ChannelAdapter) 路由。
fn dispatch_event(
    client: &reqwest::blocking::Client,
    config: &ConnectionConfig,
    plaintext: &str,
) -> DispatchOutcome {
    let ConnectionConfig::Bilibili {
        url,
        client_id,
        app_secret,
    } = config
    else {
        return DispatchOutcome::not_sent("配置不是 B站渠道，无法直发");
    };
    post_json(client, url, client_id, app_secret, plaintext)
}

/// B站渠道适配器：[`super::ChannelAdapter`] 的 B站实现——verify_webhooks
/// 握手与 x-bili-* 头表 HMAC-SHA256 签名直发；原语复用 util（md5_hex/
/// hmac_sha256_hex），差异不外溢。
pub(crate) struct Adapter;

impl super::ChannelAdapter for Adapter {
    fn id(&self) -> &'static str {
        "bilibili"
    }

    fn label(&self) -> &'static str {
        "B站"
    }

    fn matches(&self, config: &ConnectionConfig) -> bool {
        matches!(config, ConnectionConfig::Bilibili { .. })
    }

    fn url<'a>(&self, config: &'a ConnectionConfig) -> Option<&'a str> {
        let ConnectionConfig::Bilibili { url, .. } = config else {
            return None;
        };
        Some(url)
    }

    fn handshake_client(&self) -> reqwest::blocking::Client {
        // 生产用默认客户端：官方 5s 建连超时即断（§3.3 镜像口径），本地沿用 5 秒上限
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
