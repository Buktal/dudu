//! 饿了么渠道（用户线推送，事实库 docs/research/channels/eleme.md）：无 token
//! 无加密、无 challenge 握手，HTTP POST 推到合作方地址，成功判定 = HTTP 200
//! 且 body `{"message": "ok"}`（§3.1 两处全文一致），否则判失败并重试（间隔/
//! 次数官方未给出，§7.6 待核验）。签名按事实库 §4.1 官方五步逐字——除 sig 外
//! 全部参数按参数名 ASCII 排序 `&` 连接（值先 utf-8 再 urlencode，未保留字
//! `- _ . ~`、空格编 `+`）→ 请求 url + ? + 排序串 + consumer_secret 无缝尾拼
//! → UTF-8 逐字节 HEX → SHA1 → 40 位小写 hex 作 sig；系统级参数
//! consumer_key/timestamp/sig 一律放 Query String（§4.1 附加规则）。官方示例
//! 待签串（§4.1 步骤 2 逐字）已复现，官方示例 sig e76dfee… 为示意值、与示例
//! 待签串对不上（真实 secret 未公开，见 tests/golden.rs 对拍说明）。
//!
//! 待核验(09-27)口径（不编造，事实库 §7）：推送验签的参与字段（§7.7，签名
//! 是否含 consumer_key/timestamp/sig 三件套）未取得官方原文——v2 JSON 推送
//! 按 §4.1 同构以 Query 系统参数参签（§5.7 官方 URL 形态），H5 表单推送按
//! 「签名方式和平台请求饿了么方式一样」（§5.6 逐字）以表单全字段 + Query
//! 系统参数参签（§4.1 步骤 1「POST 参数」参与口径）；失败重试间隔/次数未给。
//!
//! 与其他渠道的差异全部留在本模块内（ADR-0001）：
//! - 报文双形态按明文判型：`{` 开头 = v2 JSON 推送（订单状态/配送/退单/赔偿，
//!   §2.1/§5.2–§5.5 载荷逐字，明文逐字节透传）；否则 = H5 表单推送
//!   （push_action 1/2，§5.6，application/x-www-form-urlencoded，业务字段
//!   原字节保留，明文携带的旧 sig 剔除后现算）
//! - 签名参数集：JSON 推送 = Query 系统参数（consumer_key/timestamp，字段级
//!   以 §7.7 为限）；H5 表单 = 解码后的表单全字段（sig 除外）+ 系统参数，
//!   同名键以明文为准；签名吃 urlencode 前的原文值（§4.1 步骤 1 编码在函数内）
//! - 探针握手（§3.1 无握手）：连接测试即发官方订单状态核验样本（§5.2 载荷
//!   逐字）+ 合规签名的探针（语义同普通推送），期望 HTTP 200
//! - 应答（§5.1 逐字）：HTTP 200 + `{"message": "ok"}`（H5 页另要求
//!   content-type application/json）；频控按 consumer_key 限每分钟请求总数，
//!   超限 `1009`，具体数值由饿了么与第三方协商确定（rate-limit 全文照录）

#[cfg(test)]
mod tests;

use percent_encoding::utf8_percent_encode;

use crate::connections::util::{append_absent, form_pairs, now_secs, sha1_hex, strip_sig, SIG_ENCODE_SET};

use super::{request_error_reason, ConnectionConfig, DispatchOutcome, HandshakeOutcome};

/// 官方订单状态核验样本明文（§5.2 order-signal 全文逐字，键序/JSON
/// number/string 形态照录：push_action=2、extra 为 JSON 字符串 "{}"、
/// created_at 为字符串）：推送探针复用该样本（§3.1 无握手，以带合规签名的
/// 官方样本作探针，语义同普通推送）。
pub(crate) const GOLDEN_PROBE_PLAINTEXT: &str = r#"{"push_action":2,"eleme_order_id":"12637645858619059","tp_order_id":"1425223342","new_status":1,"extra":"{}","created_at":"1531987437"}"#;

/// 失败重试口径（§3.1/§7.6 实锤 + 待核验）：非 200/非 ok 判失败并发起重试，
/// 间隔/次数官方未给出。超时文案附官方口径。
const RETRY_NOTE: &str = "（官方失败判重试：HTTP 200 + {\"message\":\"ok\"} 之外即失败，重试间隔/次数官方未给出，事实库 §3.1/§7.6）";

/// 官方 timestamp 形态（§4.1/§6）：调用时的十进制 UNIX 秒字符串。
pub(crate) fn ele_timestamp(unix_secs: u64) -> String {
    unix_secs.to_string()
}

/// §4.1 步骤 1 的参数值 urlencode（逐字规则：未保留字符为字母数字与
/// `- _ . ~`；保留字符必须编码；`x-www-form-urlencoded` 下空格编为 `+`；
/// UTF-8 字节序大写 hex）。编码集复用 percent-encoding（util 层单点，
/// space 原样保留后改写官方「+」形态）。签名吃编码前的原文值，编码发生
/// 在拼串时。
pub(crate) fn sig_encode_value(text: &str) -> String {
    utf8_percent_encode(text, SIG_ENCODE_SET)
        .to_string()
        .replace(' ', "+")
}

/// 饿了么签名（事实库 §4.1 官方五步逐字）：
/// 1. 除 sig 外全部参数按参数名 ASCII 排序（Rust 字符串比较即字节序），值经
///    [`sig_encode_value`] 编码后以 `k=v` 用 `&` 连接得字符串 A；
/// 2. 字符串 B = 请求 url + "?" + A + consumer_secret（secret 无缝尾拼）；
/// 3. B 经 UTF-8 编码后逐字节 HEX（官方三语言示例同构：Python `.encode('hex')`、
///    Java `byte2hex(str.getBytes("UTF-8"))`）；
/// 4. sig = SHA1(HEX 串) 40 位小写 hex（util::sha1_hex）。
/// 输入参数序不敏感（内部排序）；入参须为编码前的原文值。
pub(crate) fn ele_sign(url: &str, params: &[(&str, &str)], secret: &str) -> String {
    let mut sorted = params.to_vec();
    sorted.sort_by(|a, b| a.0.cmp(b.0));
    let concat = sorted
        .iter()
        .map(|(key, value)| format!("{key}={}", sig_encode_value(value)))
        .collect::<Vec<_>>()
        .join("&");
    let to_hash = format!("{url}?{concat}{secret}");
    let hexed = hex::encode(to_hash.as_bytes());
    sha1_hex(&[&hexed])
}

/// 明文判型：`{` 开头 = v2 JSON 推送（订单状态/配送/退单/赔偿），否则 = H5
/// 表单推送（push_action 1/2，§5.6 application/x-www-form-urlencoded）。
fn is_json_plaintext(plaintext: &str) -> bool {
    plaintext.trim_start().starts_with('{')
}

/// 从明文提取订单号快照：JSON 推送取 eleme_order_id（§5.2–§5.5 四推送共名），
/// 缺失回退 order_id；H5 表单推送取 order_id（§5.6 字段表）；均缺失不落值
/// （幂等键官方未声明，取载荷订单号作近似排重键，事实库 §3.1 工程建议口径）。
fn message_id_of(plaintext: &str) -> String {
    if is_json_plaintext(plaintext) {
        if let Ok(value) = serde_json::from_str::<serde_json::Value>(plaintext) {
            for key in ["eleme_order_id", "order_id"] {
                if let Some(id) = value.get(key).and_then(|id| id.as_str()) {
                    return id.to_string();
                }
            }
            return String::new();
        }
    }
    form_pairs(plaintext)
        .iter()
        .find(|(key, _)| key == "order_id")
        .map(|(_, value)| value.clone())
        .unwrap_or_default()
}

/// 直发签名参数集：明文解码 kv + 系统级参数（consumer_key/timestamp，§4.1/§6
/// 必传项）；同名键以明文为准（防重复键破坏排序拼串）；sig 恒排除（官方
/// 「除 sig 外」口径逐字）。JSON 推送传空 kv，仅系统参数参签（§7.7 字段级
/// 待核验下按 §5.7 官方 URL 形态同构）。
fn sign_params(
    consumer_key: &str,
    timestamp: &str,
    payload: &[(String, String)],
) -> Vec<(String, String)> {
    let mut params: Vec<(String, String)> = payload
        .iter()
        .filter(|(key, _)| key != "sig")
        .cloned()
        .collect();
    append_absent(&mut params, &[("consumer_key", consumer_key), ("timestamp", timestamp)]);
    params
}

/// 签名 + POST（明文判型双形态共用）：body 逐字节透传（ADR-0001，H5 表单先
/// 剔除旧 sig），系统级参数与 sig 走 Query（§4.1「系统级参数一律放 Query
/// String」，§5.7 官方 URL 形态 consumer_key → sig → timestamp）；签名覆盖
/// [`sign_params`] 参数集（编码前原文值）。timestamp 快照落官方形态。
fn post_signed(
    client: &reqwest::blocking::Client,
    url: &str,
    consumer_key: &str,
    secret: &str,
    plaintext: &str,
) -> DispatchOutcome {
    let json_push = is_json_plaintext(plaintext);
    let body = if json_push {
        plaintext.to_string()
    } else {
        strip_sig(plaintext)
    };
    let timestamp = ele_timestamp(now_secs());
    let payload = if json_push {
        Vec::new()
    } else {
        form_pairs(&body)
    };
    let params = sign_params(consumer_key, &timestamp, &payload);
    let borrowed: Vec<(&str, &str)> =
        params.iter().map(|(key, value)| (key.as_str(), value.as_str())).collect();
    let signature = ele_sign(url, &borrowed, secret);
    let started = std::time::Instant::now();
    let response = client
        .post(url)
        .query(&[
            ("consumer_key", consumer_key),
            ("sig", signature.as_str()),
            ("timestamp", timestamp.as_str()),
        ])
        .header(
            "Content-Type",
            if json_push {
                "application/json"
            } else {
                "application/x-www-form-urlencoded"
            },
        )
        .body(body.clone())
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
        msg_id: message_id_of(plaintext),
        signature,
        timestamp: Some(timestamp),
        request_body: Some(body),
        reply: None,
        status,
        elapsed_ms,
        body: receipt,
        error,
    }
}

/// 连接测试（§3.1 无握手）：官方无 challenge/verify 口径，探针即官方订单
/// 状态核验样本（§5.2 载荷逐字）+ 合规签名（语义同普通推送），期望 HTTP 200
/// （官方成功应答口径 HTTP 200 + {"message":"ok"} 由接收方兑现）。
/// 私有协议原语：对外只经 [`Adapter`](super::ChannelAdapter) 路由。
fn verify_handshake(
    client: &reqwest::blocking::Client,
    config: &ConnectionConfig,
) -> HandshakeOutcome {
    let ConnectionConfig::Eleme {
        url,
        consumer_key,
        consumer_secret,
    } = config
    else {
        return HandshakeOutcome {
            ok: false,
            message: "配置不是饿了么渠道，无法执行推送探针握手".into(),
        };
    };
    let outcome = post_signed(client, url, consumer_key, consumer_secret, GOLDEN_PROBE_PLAINTEXT);
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
                "目标返回 HTTP {}，推送探针未通过（官方无握手，探针语义同普通推送，期望 HTTP 200）",
                outcome.status
            ),
        };
    }
    HandshakeOutcome {
        ok: true,
        message: "推送探针被接受：用户线签名 POST（sig = SHA1(HEX(url?字母序 k=v 串 + Consumer Secret))）到达目标，返回 HTTP 200".into(),
    }
}

/// 饿了么直发（用户线推送模拟）：明文判型双形态——JSON 推送逐字节透传，H5
/// 表单推送业务字段原字节保留；系统级参数与 sig 走 Query。明文由前端逐字节
/// 拼装，不重排（ADR-0001）；应答由前端期望回执（HTTP 200 +
/// {"message":"ok"}，§5.1 逐字）承载。
/// 私有协议原语：对外只经 [`Adapter`](super::ChannelAdapter) 路由。
fn dispatch_event(
    client: &reqwest::blocking::Client,
    config: &ConnectionConfig,
    plaintext: &str,
) -> DispatchOutcome {
    let ConnectionConfig::Eleme {
        url,
        consumer_key,
        consumer_secret,
    } = config
    else {
        return DispatchOutcome::not_sent("配置不是饿了么渠道，无法直发");
    };
    post_signed(client, url, consumer_key, consumer_secret, plaintext)
}

/// 饿了么渠道适配器：[`super::ChannelAdapter`] 的饿了么实现——推送探针握手与
/// SHA1 五步签名直发；原语复用 util（sha1_hex），差异不外溢。
pub(crate) struct Adapter;

impl super::ChannelAdapter for Adapter {
    fn id(&self) -> &'static str {
        "eleme"
    }

    fn label(&self) -> &'static str {
        "饿了么"
    }

    fn matches(&self, config: &ConnectionConfig) -> bool {
        matches!(config, ConnectionConfig::Eleme { .. })
    }

    fn url<'a>(&self, config: &'a ConnectionConfig) -> Option<&'a str> {
        let ConnectionConfig::Eleme { url, .. } = config else {
            return None;
        };
        Some(url)
    }

    fn handshake_client(&self) -> reqwest::blocking::Client {
        // 生产用默认客户端：官方应答窗口未给出（§7.6），本地沿用 5 秒上限
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
