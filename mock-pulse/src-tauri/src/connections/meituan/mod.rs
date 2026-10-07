//! 美团渠道（技术服务合作中心回调，事实库 docs/research/channels/meituan.md）：
//! POST 普通表单参数（application/x-www-form-urlencoded; charset=UTF-8，官方
//! 旧文称 Content-Type: text；对象/数组先转 JSON 字符串再作表单字段），端口仅
//! 80/8080。签名按事实库 §4.1 官方五步逐字——所有参数（sig 除外）按参数名字
//! 母序排序 & 连接 → 请求 url + ? + 排序串 + app secret 拼接 → MD5 → 32 位
//! 小写 hex 赋给 sig；官方向量 00934d00d0aea6f12161edfb6456143d（§5.1 guide/31
//! 待签串逐字）已对拍（见 tests/golden.rs 黄金对拍）。
//!
//! 待核验(09-27)口径（不编造，事实库 §7）：官方验证握手正文、IM push_content
//! 结构、退款/取消推送体、ISV access_token 参签流程均未取得官方原文——本模块
//! 只实现事实库已实锤的机制，验签探针语义同普通推送（京东/拼多多先例），推送
//! 应答由前端期望回执承载（订单类 {"data":"ok"} 2 秒内、IM 类 {"data":"OK"}
//! 4 秒内，事实库 §3.2/§5.2 逐字）。
//!
//! 与其他渠道的差异全部留在本模块内（ADR-0001）：
//! - 签名（§4.1 逐字步骤）：「将所有参数（sig 除外）按参数名字母顺序排序，
//!   & 连接」「按 请求url + ? + 排序后参数 + consumer_secret 连接得待签字符
//!   串」（中文保持原文、不单独转码）「MD5 加密得 32 位签名，字母小写」；
//!   排序串形如 `k1=v1&k2=v2`（带 = 与 &，与京东/拼多多 k+v 无缝拼接不同）；
//!   推送参数未排序（§3.1），排序只发生在签名计算——发送表单保持前端文档序
//! - 直发：POST 表单（明文逐字节透传 + 尾部追加系统级参数 app_id/timestamp
//!   （调用时 UNIX 秒，§4.1/§6）与 sig；明文已带的同名键以明文为准；明文携带
//!   的旧 sig 剔除后现算——重签语义同官方「sig 除外」口径）
//! - 探针握手（§3 消息回调接入 → 正文待核验(09-27)）：官方未给 challenge/
//!   verify 口径，连接测试即发官方订单核验样本表单（§5.3 docDetail/177/180
//!   字段值逐字）+ 合规签名的探针（语义同普通推送），期望 HTTP 200
//! - 应答（§3.2 实锤）：订单类 {"data":"ok"}（2 秒内），IM 类 {"data":"OK"}
//!   （4 秒内）；失败 1 分钟×3 重试（§3.3），超时文案附官方口径

#[cfg(test)]
mod tests;

use crate::connections::util::{append_absent, form_encode_value, form_pairs, md5_hex, now_secs, strip_sig};

use super::{
    no_reply, send_measured_outcome, ConnectionConfig, DispatchOutcome, DispatchSnapshot,
    HandshakeOutcome,
};

/// 官方订单核验样本表单（§5.3 docDetail/177/180 字段值逐字；form 字节，前端
/// 模板骨架同款）：推送探针复用该样本（官方验证握手正文待核验(09-27)，以带
/// 合规签名的官方样本作探针，语义同普通推送）。
pub(crate) const GOLDEN_PROBE_BODY: &str =
    "app_poi_code=668921&order_id=27061900338318741";

/// 失败重试口径（§3.2/§3.3 实锤）：订单类 2 秒内应答、IM 类 4 秒内；失败每隔
/// 1 分钟重试共 3 次。超时文案附官方口径。
const RETRY_NOTE: &str = "（官方应答窗口：订单类 2 秒内 / IM 类 4 秒内，失败 1 分钟×3 重试，事实库 §3.2/§3.3）";

/// 官方 timestamp 形态（§4.1/§6）：调用时的十进制 UNIX 秒字符串（取现值经
/// util::now_secs，审计退件收敛）。
pub(crate) fn mt_timestamp(unix_secs: u64) -> String {
    unix_secs.to_string()
}

/// 美团签名（事实库 §4.1 官方五步逐字规则）：所有参数（sig 除外）按参数名
/// 字母序排序（Rust 字符串比较即字节序），以 `k=v` 用 `&` 连接，待签串 =
/// 请求 url + "?" + 排序串 + secret（中文保持原文、不单独转码——入参须为
/// 解码后的原文值），MD5 32 位小写 hex。输入参数序不敏感（内部排序）。
pub(crate) fn mt_sign(url: &str, params: &[(&str, &str)], secret: &str) -> String {
    let mut sorted = params.to_vec();
    sorted.sort_by(|a, b| a.0.cmp(b.0));
    let mut concat = String::new();
    for (index, (key, value)) in sorted.iter().enumerate() {
        if index > 0 {
            concat.push('&');
        }
        concat.push_str(key);
        concat.push('=');
        concat.push_str(value);
    }
    md5_hex(&[url, "?", &concat, secret])
}

/// 签名参数集：明文解码 kv + 系统级参数（app_id/timestamp，§4.1/§6 必传项）；
/// 同名键以明文为准（防重复键破坏排序拼串）；sig 恒排除（官方口径逐字）。
fn sign_params(
    app_id: &str,
    timestamp: &str,
    payload: &[(String, String)],
) -> Vec<(String, String)> {
    let mut params: Vec<(String, String)> = payload
        .iter()
        .filter(|(key, _)| key != "sig")
        .cloned()
        .collect();
    append_absent(&mut params, &[("app_id", app_id), ("timestamp", timestamp)]);
    params
}

/// 从解码 kv 提取订单号快照：order_id（订单三态推送）；缺失不落值（幂等键
/// 官方无命名，取载荷订单号作近似排重键）。
fn message_id_of(pairs: &[(String, String)]) -> String {
    pairs
        .iter()
        .find(|(key, _)| key == "order_id")
        .map(|(_, value)| value.clone())
        .unwrap_or_default()
}

/// POST 表单（form-urlencoded）：明文逐字节透传 + 尾部追加缺失的系统级参数
/// 与现算 sig（官方推送参数未排序，§3.1——追加不重排既有字节）；签名覆盖
/// 解码后的全字段（sig 除外，中文按原文参签）；timestamp 快照落官方形态。
fn post_form(
    client: &reqwest::blocking::Client,
    url: &str,
    app_id: &str,
    secret: &str,
    body: &str,
) -> DispatchOutcome {
    let body = strip_sig(body);
    let timestamp = mt_timestamp(now_secs());
    let pairs = form_pairs(&body);
    let params = sign_params(app_id, &timestamp, &pairs);
    let borrowed: Vec<(&str, &str)> =
        params.iter().map(|(key, value)| (key.as_str(), value.as_str())).collect();
    let signature = mt_sign(url, &borrowed, secret);
    let mut wire = body;
    for (key, value) in [
        ("app_id", app_id),
        ("timestamp", timestamp.as_str()),
        ("sig", signature.as_str()),
    ] {
        if key != "sig" && pairs.iter().any(|(existing, _)| existing == key) {
            continue;
        }
        if !wire.is_empty() {
            wire.push('&');
        }
        wire.push_str(key);
        wire.push('=');
        wire.push_str(&form_encode_value(value));
    }
    send_measured_outcome(
        client
        .post(url)
        .header("Content-Type", "application/x-www-form-urlencoded")
        .body(wire.clone()),
        RETRY_NOTE,
        DispatchSnapshot {
            msg_id: message_id_of(&pairs),
            signature,
            timestamp: Some(timestamp),
            request_body: Some(wire),
        },
        no_reply,
    )
}

/// 连接测试（§3 消息回调接入 → 正文待核验(09-27)）：官方未给 challenge/
/// verify 口径，探针即官方订单核验样本表单（§5.3 字段值逐字）+ 合规签名
/// （语义同普通推送），期望 HTTP 200（应答正文无口径）。
/// 私有协议原语：对外只经 [`Adapter`](super::ChannelAdapter) 路由。
fn verify_handshake(
    client: &reqwest::blocking::Client,
    config: &ConnectionConfig,
) -> HandshakeOutcome {
    let ConnectionConfig::Meituan {
        url,
        app_id,
        app_secret,
    } = config
    else {
        return HandshakeOutcome {
            ok: false,
            message: "配置不是美团渠道，无法执行推送探针握手".into(),
        };
    };
    let outcome = post_form(client, url, app_id, app_secret, GOLDEN_PROBE_BODY);
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
                "目标返回 HTTP {}，推送探针未通过（官方验证握手正文待核验(09-27)，探针语义同普通推送，期望 HTTP 200）",
                outcome.status
            ),
        };
    }
    HandshakeOutcome {
        ok: true,
        message: "推送探针被接受：合作中心表单 POST（sig = MD5(url?字母序 k=v 串 + App Secret)）到达目标，返回 HTTP 200".into(),
    }
}

/// 美团直发（合作中心回调模拟）：表单明文逐字节透传 + 尾部追加系统级参数与
/// 现算 sig（官方「sig 除外」重签口径）。明文由前端逐字节拼装，不重排
/// （ADR-0001）；应答由前端期望回执（{"data":"ok"} / {"data":"OK"}）承载。
/// 私有协议原语：对外只经 [`Adapter`](super::ChannelAdapter) 路由。
fn dispatch_event(
    client: &reqwest::blocking::Client,
    config: &ConnectionConfig,
    plaintext: &str,
) -> DispatchOutcome {
    let ConnectionConfig::Meituan {
        url,
        app_id,
        app_secret,
    } = config
    else {
        return DispatchOutcome::not_sent("配置不是美团渠道，无法直发");
    };
    post_form(client, url, app_id, app_secret, plaintext)
}

/// 美团渠道适配器：[`super::ChannelAdapter`] 的美团实现——推送探针握手与
/// MD5(url?字母序+secret) 签名表单直发；原语复用 util（md5_hex），差异不外溢。
pub(crate) struct Adapter;

impl super::ChannelAdapter for Adapter {
    fn id(&self) -> &'static str {
        "meituan"
    }

    fn label(&self) -> &'static str {
        "美团"
    }

    fn matches(&self, config: &ConnectionConfig) -> bool {
        matches!(config, ConnectionConfig::Meituan { .. })
    }

    fn url<'a>(&self, config: &'a ConnectionConfig) -> Option<&'a str> {
        let ConnectionConfig::Meituan { url, .. } = config else {
            return None;
        };
        Some(url)
    }

    fn handshake_client(&self) -> reqwest::blocking::Client {
        // 生产用默认客户端：官方应答窗口订单 2s / IM 4s，本地沿用 5 秒上限
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
