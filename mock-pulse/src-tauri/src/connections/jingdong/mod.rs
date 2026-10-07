//! 京东渠道（JOS 消息推送，事实库 docs/research/channels/jingdong.md）：明文
//! JSON 推送 + 系统参数 query（app_key / timestamp / v / sign），签名按事实库
//! 唯一实锤的 API 请求签名规则（§4.1）——sign = UPPER(MD5(appSecret + 按字母序
//! k+v 拼接 + appSecret))，timestamp `yyyy-MM-dd HH:mm:ss`、服务端允许 10 分钟
//! 误差；应用级参数整体 JSON 官方恒以 `360buy_param_json` 名参与签名（§4.1），
//! 推送模拟中即事件明文（body 同值逐字节透传）。
//!
//! 待核验(09-27)口径（不编造，事实库 §3/§4.3/§7）：推送通道投递形态、首次
//! 验证握手（challenge/verify）、推送回调验签、重试幂等均未取得官方原文——
//! 本模块只实现事实库已实锤的机制，验签探针语义同普通推送（同淘宝先例），
//! 复核 listId=520 后收口。
//!
//! 与其他渠道的差异全部留在本模块内（ADR-0001）：
//! - 签名（§4.1 逐字步骤）：「将所有请求参数按照字母先后顺序排列…把所有参数名
//!   和参数值进行拼接…把appSecret夹在字符串的两端…使用MD5进行加密，再转化成
//!   大写」；签名参数集 = 系统参数（app_key/timestamp/v）+ 应用级参数
//!   360buy_param_json（= 事件明文）
//! - 探针握手（§3.2 首次验证握手 → 待核验(09-27)）：官方未给 challenge/verify
//!   口径，连接测试即发官方状态枚举样本明文（§5.1 锚定的 WAIT_SELLER_STOCK_OUT）
//!   + 合规签名的探针（语义同普通推送），期望 HTTP 200
//! - 直发：POST 明文 JSON（逐字节透传不重排）+ 系统参数 query；幂等键官方
//!   口径待核验，msg_id 快照取载荷业务单号（order_id/serviceId）
//! - 应答（§3.1/§5.5 → 待核验(09-27)）：推送应答无官方口径，模板期望回执取
//!   最中性签收语义 HTTP 200 + 不校验正文

#[cfg(test)]
mod tests;

use crate::connections::util::{md5_wrapped_sign, now_secs, utc8_timestamp};

use super::{
    no_reply, send_measured_outcome, ConnectionConfig, DispatchOutcome, DispatchSnapshot,
    HandshakeOutcome,
};

/// 官方状态枚举样本明文（§5.1 锚定的 WAIT_SELLER_STOCK_OUT——§5.1 官方订单
/// 查询示例的状态取值 + 模板骨架同款实锤词汇）：推送探针复用该样本（官方首次
/// 验证握手待核验(09-27)，以带合规签名的官方枚举样本作探针，语义同普通推送）。
pub(crate) const GOLDEN_PROBE_PLAINTEXT: &str =
    r#"{"order_id":"123456789","order_state":"WAIT_SELLER_STOCK_OUT"}"#;

/// 应用级参数名（§4.1 官方系统参数表逐字）：应用级参数整体 JSON 恒以该名
/// 参与签名；推送模拟中即事件明文（body 同值）。
const BIZ_PARAM: &str = "360buy_param_json";

/// 协议版本（§4.2 系统参数表：「协议版本（默认 2.0）」，逐字）。
const PROTOCOL_VERSION: &str = "2.0";

/// 失败重试口径（§3.3 → 待核验(09-27)）：官方重试间隔/次数未取得，超时文案
/// 附待核验提示（物流「订阅+查询」与 jmq 异步不可当推送口径，事实库 §3.3）。
const RETRY_NOTE: &str = "（官方重试口径待核验(09-27)，listId=520 复核后收口）";

/// JOS 签名（事实库 §4.1 官方步骤逐字规则）：所有请求参数按字母序排列，拼接
/// 参数名与参数值，appSecret 夹两端，MD5 大写。输入参数序不敏感（内部排序）。
/// 算法与拼多多 PMC 签名同形，单点在 util（[`md5_wrapped_sign`]，审计退件
/// 去重），本函数只承载京东侧协议名与 §4.1 口径。
pub(crate) fn jos_sign(params: &[(&str, &str)], app_secret: &str) -> String {
    md5_wrapped_sign(params, app_secret)
}

/// JOS timestamp（§4.1/§4.2 官方格式逐字）：`yyyy-MM-dd HH:mm:ss`（如
/// `2019-05-01 00:00:00`）；京东按东八区校验 10 分钟窗口，这里按 UTC+8
/// 生成（历法换算复用 [`utc8_timestamp`]，civil_from_days 不手写）。
pub(crate) fn jos_timestamp(unix_secs: u64) -> String {
    utc8_timestamp(unix_secs)
}

/// 从明文 JSON 提取业务单号快照：order_id（订单推送）→ orderId（咚咚 push2）
/// → serviceId（售后单据）；均缺失不落值（幂等键官方口径待核验(09-27)，取
/// 载荷业务单号作近似排重键）。
fn message_id_of(body: &str) -> String {
    let parsed = serde_json::from_str::<serde_json::Value>(body).ok();
    for key in ["order_id", "orderId", "serviceId"] {
        if let Some(value) = parsed
            .as_ref()
            .and_then(|value| value.get(key))
            .and_then(|value| value.as_str())
        {
            return value.to_string();
        }
    }
    String::new()
}

/// POST 明文 JSON + 系统参数 query（app_key/timestamp/v/sign）：body 逐字节
/// 透传不重排（ADR-0001）；签名按 360buy_param_json（= 明文）+ 系统参数计算；
/// timestamp 落快照（10 分钟窗口要素）。
fn post_json(
    client: &reqwest::blocking::Client,
    url: &str,
    app_key: &str,
    app_secret: &str,
    body: &str,
) -> DispatchOutcome {
    let timestamp = jos_timestamp(now_secs());
    let signature = jos_sign(
        &[
            (BIZ_PARAM, body),
            ("app_key", app_key),
            ("timestamp", timestamp.as_str()),
            ("v", PROTOCOL_VERSION),
        ],
        app_secret,
    );
    send_measured_outcome(
        client
        .post(url)
        .query(&[
            ("app_key", app_key),
            ("timestamp", timestamp.as_str()),
            ("v", PROTOCOL_VERSION),
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

/// 连接测试（§3.2 首次验证握手 → 待核验(09-27)）：官方未给 challenge/verify
/// 口径，探针即官方状态枚举样本明文（§5.1 锚定的 WAIT_SELLER_STOCK_OUT）+
/// 合规签名（语义同普通推送），期望 HTTP 200（应答正文无口径）。
/// 私有协议原语：对外只经 [`Adapter`](super::ChannelAdapter) 路由。
fn verify_handshake(
    client: &reqwest::blocking::Client,
    config: &ConnectionConfig,
) -> HandshakeOutcome {
    let ConnectionConfig::Jingdong {
        url,
        app_key,
        app_secret,
    } = config
    else {
        return HandshakeOutcome {
            ok: false,
            message: "配置不是京东渠道，无法执行推送探针握手".into(),
        };
    };
    let outcome = post_json(client, url, app_key, app_secret, GOLDEN_PROBE_PLAINTEXT);
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
                "目标返回 HTTP {}，推送探针未通过（官方首次验证握手口径待核验(09-27)，探针语义同普通推送，期望 HTTP 200）",
                outcome.status
            ),
        };
    }
    HandshakeOutcome {
        ok: true,
        message: "推送探针被接受：JOS 签名 POST（sign = UPPER(MD5(appSecret+字母序 k+v+appSecret))）到达目标，返回 HTTP 200".into(),
    }
}

/// 京东直发（JOS 消息推送模拟）：明文 JSON 逐字节透传 + 系统参数 query（签名
/// 覆盖 360buy_param_json 即明文）。明文由前端逐字节拼装，不重排（ADR-0001）；
/// 应答口径待核验(09-27)，由前端期望回执（HTTP 200/正文不校验）承载。
/// 私有协议原语：对外只经 [`Adapter`](super::ChannelAdapter) 路由。
fn dispatch_event(
    client: &reqwest::blocking::Client,
    config: &ConnectionConfig,
    plaintext: &str,
) -> DispatchOutcome {
    let ConnectionConfig::Jingdong {
        url,
        app_key,
        app_secret,
    } = config
    else {
        return DispatchOutcome::not_sent("配置不是京东渠道，无法直发");
    };
    post_json(client, url, app_key, app_secret, plaintext)
}

/// 京东渠道适配器：[`super::ChannelAdapter`] 的京东实现——推送探针握手与
/// JOS MD5 签名直发；原语复用 util（md5_hex），差异不外溢。
pub(crate) struct Adapter;

impl super::ChannelAdapter for Adapter {
    fn id(&self) -> &'static str {
        "jingdong"
    }

    fn label(&self) -> &'static str {
        "京东"
    }

    fn matches(&self, config: &ConnectionConfig) -> bool {
        matches!(config, ConnectionConfig::Jingdong { .. })
    }

    fn url<'a>(&self, config: &'a ConnectionConfig) -> Option<&'a str> {
        let ConnectionConfig::Jingdong { url, .. } = config else {
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
