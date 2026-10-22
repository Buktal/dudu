//! 支付宝渠道（异步通知，事实库 docs/research/channels/alipay.md）：POST 表单
//! （form-urlencoded，request.Form/$_POST 取参，§2.1）到三地址之一——接口级
//! notify_url（支付/交易通知）/ 应用网关（生活号被动通知等）/ From 蚂蚁订阅
//! （单笔转账等，需先订阅 topic）（§3.1 表）。应答纯文本 success + HTTP 200
//! （§3.3/§5.3，无空格/HTML/重定向）；fail 或非 200 按 25h 8 次重推（支付类
//! 4m 首重 / From 蚂蚁 2m 首重，后续 10m/10m/1h/2h/6h/15h，两口径并存照录，
//! §3.3）；幂等键 notify_id（同一条异步通知重试时不变，§3.4）。
//!
//! 签名 = RSA2（rsaCheckV1 语义，§4.3 四步逐字）：待验签参数 = 除去 sign、
//! sign_type 外全部通知参数 → url_decode → 字典序排序（首个字符起逐位 ASCII
//! 递增，§4.1 步骤 2）→ k=v 用 & 连接得待签串；sign = Base64(RSA-SHA256
//! (PKCS#1 v1.5)(待签串))（§4.1 RSA2 = SHA256WithRSA 2048 位）——非对称签名
//! 无法像 sha/hmac 一样薄封装自实现，取 RustCrypto rsa crate（#46 预授权，
//! ed25519-dalek #37 先例）。
//!
//! 待核验(09-27)口径（不编造，事实库 §7）：应用网关验证握手后半程（验证串
//! 形态/回复格式，§3.2）、生活号被动通知事件表均未取得官方原文——本模块只
//! 实现已实锤机制，连接测试探针语义同普通推送（京东/拼多多/美团先例），不
//! 硬编码验证握手（事实库附「勿硬编码」口径）。
//!
//! 与其他渠道的差异全部留在本模块内（ADR-0001）：
//! - 信封字段（notify_time/notify_type/notify_id/app_id/auth_app_id 等 §5.1
//!   公共参数族）属载荷本体、全部参与验签，由模板携带——与美团系统级参数由
//!   适配器补齐不同，适配器只管 sign：明文携带的旧 sign 剔除后现算（官方
//!   「除去 sign、sign_type」重签口径），sign_type 缺失时补 RSA2（新建应用
//!   必须 RSA2，§4.1；sign_type 在线上传输但不出现在待签串里）
//! - 签名吃 url_decode 后的原文值（§4.3 步骤 2「先 url_decode 再排序拼串」），
//!   发送体保持前端逐字节明文（ADR-0001），追加段按 RFC 3986 大写 hex 编码
//!   （sign 的 base64 含 + / =，form 线上必须百分号编码）
//! - 探针握手：官方网关验证握手细节待核验(09-27)，连接测试即发官方支付异步
//!   通知核验样本（§5.1 公共参数表逐字）+ 合规 RSA2 签名的探针（语义同普通
//!   推送），期望 HTTP 200
//! - 应答由前端期望回执承载（HTTP 200 + 纯文本 success，§5.3 逐字）

#[cfg(test)]
mod tests;

use rsa::pkcs1::DecodeRsaPrivateKey;
use rsa::pkcs1v15::{Signature, SigningKey};
use rsa::pkcs8::DecodePrivateKey;
use rsa::sha2::Sha256;
use rsa::signature::{SignatureEncoding, Signer};
use rsa::RsaPrivateKey;

use crate::connections::util::{form_encode_value, form_pairs, strip_form_pair};

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;

#[cfg(test)]
use rsa::pkcs1v15::VerifyingKey;
#[cfg(test)]
use rsa::signature::Verifier;
#[cfg(test)]
use rsa::RsaPublicKey;

use super::adapter::narrow;
use super::{
    no_body_check, no_reply, probe_handshake_outcome, send_measured_outcome, ConnectionConfig,
    DispatchOutcome, DispatchSnapshot, HandshakeOutcome,
};

/// 官方支付异步通知核验样本表单（§5.1 公共参数表 + 业务参数表逐字值；form
/// 字节：notify_time 的空格/冒号按 RFC 3986 大写 hex 编码，trade_status 取
/// 业务参数表示例值 TRADE_SUCCESS，total_amount 为 §3.4 实锤字段的模拟器
/// 占位不作官方样本，sign 为官方页样例截断照录、直发时剔除重签——事实库
/// 警示「切勿用本 §5.1 拼出的串做验签回归向量」，故仅作探针载荷不作签名
/// 向量）：推送探针复用该样本。
pub(crate) const GOLDEN_PROBE_BODY: &str = "notify_time=2018-10-21%2015%3A45%3A22&notify_type=trade_status_sync&notify_id=ac05099524730693a8b330c45cf72da943&charset=utf-8&version=1.0&sign_type=RSA2&sign=601510b7970e52cc63db0f44997cf70e&auth_app_id=2018072300007418&trade_no=2013112011001004330000121536&app_id=2019082200007148&out_trade_no=6823789339978248&trade_status=TRADE_SUCCESS&total_amount=10.99";

/// 失败重试口径（§3.3 两处官方口径并存照录）：fail 或非 200 即按 25h 8 次
/// 重推（支付类首重 4m / From 蚂蚁首重 2m，后续 10m/10m/1h/2h/6h/15h）。
/// 超时文案附官方口径。
const RETRY_NOTE: &str = "（官方重试口径：fail 或非 200 按 25h 8 次重推，支付类首重 4m / From 蚂蚁首重 2m，后续 10m/10m/1h/2h/6h/15h，事实库 §3.3）";

/// 连接配置里的私钥文本 → RSA 私钥（签名源）：支持 PKCS#8 / PKCS#1 PEM 与
/// DER Base64（凭据字段按事实库「私钥信息储存在专用私钥文件」口径，§4.5）。
fn parse_private_key(raw: &str) -> Result<RsaPrivateKey, String> {
    let text = raw.trim();
    if text.is_empty() {
        return Err("私钥为空".into());
    }
    if text.contains("BEGIN") {
        return RsaPrivateKey::from_pkcs8_pem(text)
            .or_else(|_| RsaPrivateKey::from_pkcs1_pem(text))
            .map_err(|err| format!("无法解析 PEM 私钥（支持 PKCS#8/PKCS#1）：{err}"));
    }
    let compact: String = text.chars().filter(|c| !c.is_whitespace()).collect();
    let der = BASE64
        .decode(compact.as_bytes())
        .map_err(|err| format!("私钥不是合法的 Base64：{err}"))?;
    RsaPrivateKey::from_pkcs8_der(&der)
        .or_else(|_| RsaPrivateKey::from_pkcs1_der(&der))
        .map_err(|err| format!("无法解析 DER 私钥（支持 PKCS#8/PKCS#1）：{err}"))
}

/// 支付宝 RSA2 签名（事实库 §4.1「算法：RSA2 = SHA256WithRSA」）：待签串经
/// SHA-256 摘要后按 PKCS#1 v1.5 私钥加密，输出标准 base64（§4.3 步骤 3 口径
/// 「签名参数 sign 使用 base64」的编码侧）。
pub(crate) fn ali_sign(to_sign: &str, private_key: &RsaPrivateKey) -> String {
    let signing_key = SigningKey::<Sha256>::new(private_key.clone());
    let signature: Signature = signing_key.sign(to_sign.as_bytes());
    BASE64.encode(signature.to_bytes())
}

/// 支付宝 RSA2 验签（签名侧对偶，§4.3 步骤 4「通过签名字符串、base64 解码后
/// 的签名参数及公钥验证签名」）：与 [`ali_sign`] 共用同一待签串口径，测试内
/// 签名 → 验签黄金对拍 + 篡改必败的验证原语——即商户侧 rsaCheckV1 验签的
/// Rust 对偶；本工具扮演支付宝侧（只签不验），仅测试编译。
#[cfg(test)]
pub(crate) fn ali_verify(to_sign: &str, public_key: &RsaPublicKey, sign_b64: &str) -> bool {
    let decoded = match BASE64.decode(sign_b64.as_bytes()) {
        Ok(bytes) => bytes,
        Err(_) => return false,
    };
    let signature = match Signature::try_from(decoded.as_slice()) {
        Ok(signature) => signature,
        Err(_) => return false,
    };
    VerifyingKey::<Sha256>::new(public_key.clone())
        .verify(to_sign.as_bytes(), &signature)
        .is_ok()
}

/// rsaCheckV1 待签串（事实库 §4.3 步骤 2 / §5.2 逐字）：解码 kv 中除去
/// sign、sign_type 外全部参数，按参数名 ASCII 递增排序（Rust 字符串比较即
/// 字节序），以 `k=v` 用 `&` 连接。输入参数序不敏感（内部排序）。
pub(crate) fn signing_concat(pairs: &[(String, String)]) -> String {
    let mut sorted: Vec<&(String, String)> = pairs
        .iter()
        .filter(|(key, _)| key != "sign" && key != "sign_type")
        .collect();
    sorted.sort_by(|a, b| a.0.cmp(&b.0));
    sorted
        .iter()
        .map(|(key, value)| format!("{key}={value}"))
        .collect::<Vec<_>>()
        .join("&")
}

/// 明文携带 sign_type 时原样保留（线上传输参数），缺失时补 RSA2（新建应用
/// 必须 RSA2，§4.1）：返回补齐后的明文。sign_type 不参与待签串
/// （[`signing_concat`] 剔除），追加位置无关紧要、落尾部。
fn ensure_sign_type(body: &str) -> String {
    if form_pairs(body).iter().any(|(key, _)| key == "sign_type") {
        return body.to_string();
    }
    if body.is_empty() {
        return "sign_type=RSA2".into();
    }
    format!("{body}&sign_type=RSA2")
}

/// 从解码 kv 提取幂等键快照：notify_id 首选（同条通知重试不变，§3.4），
/// 缺失回退 trade_no / out_trade_no（§3.4「notify_id + out_trade_no/trade_no
/// 组合」的组合键半边）；均缺失不落值。
fn message_id_of(pairs: &[(String, String)]) -> String {
    for key in ["notify_id", "trade_no", "out_trade_no"] {
        if let Some(value) = pairs
            .iter()
            .find(|(existing, _)| existing == key)
            .map(|(_, value)| value)
        {
            return value.clone();
        }
    }
    String::new()
}

/// 通知发送时间快照（notify_time，§5.1 `yyyy-MM-dd HH:mm:ss`）：取明文携带值
/// （信封字段属载荷本体，适配器不代生成），缺失不落值。
fn notify_time_of(pairs: &[(String, String)]) -> String {
    pairs
        .iter()
        .find(|(key, _)| key == "notify_time")
        .map(|(_, value)| value.clone())
        .unwrap_or_default()
}

/// 签名 + POST 表单（三地址共用）：旧 sign 剔除（其余业务字节逐段保留，
/// ADR-0001）→ sign_type 补齐 → 解码 kv 排序拼待签串 → RSA2 签名 → 尾部追加
/// form 编码后的 sign（base64 含 + / =，线上必须百分号编码）。应答由前端
/// 期望回执（HTTP 200 + 纯文本 success，§5.3）承载。
fn post_signed(
    client: &reqwest::blocking::Client,
    url: &str,
    private_key: &RsaPrivateKey,
    plaintext: &str,
) -> DispatchOutcome {
    let body = ensure_sign_type(&strip_form_pair(plaintext, "sign"));
    let pairs = form_pairs(&body);
    let signature = ali_sign(&signing_concat(&pairs), private_key);
    let wire = format!("{body}&sign={}", form_encode_value(&signature));
    send_measured_outcome(
        client
        .post(url)
        .header("Content-Type", "application/x-www-form-urlencoded")
        .body(wire.clone()),
        RETRY_NOTE,
        DispatchSnapshot {
            msg_id: message_id_of(&pairs),
            signature,
            timestamp: Some(notify_time_of(&pairs)),
            request_body: Some(wire),
        },
        no_reply,
    )
}

/// 连接测试（网关验证）：官方「验证应用网关」握手后半程待核验(09-27)（事实库
/// §3.2/§7-2，勿硬编码），探针即官方支付异步通知核验样本（§5.1 逐字）+ 合规
/// RSA2 签名（语义同普通推送），期望 HTTP 200（success 由接收方兑现）。
/// 超时窗口：官方应答窗口未给出（重试节拍 4m 起远超本地窗口），本地沿用 5 秒
/// 上限（trait 默认握手客户端）。
/// 私有协议原语：对外只经 [`Adapter`](super::ChannelAdapter) 路由。
fn verify_handshake(
    client: &reqwest::blocking::Client,
    url: &str,
    app_private_key: &str,
) -> HandshakeOutcome {
    let private_key = match parse_private_key(app_private_key) {
        Ok(private_key) => private_key,
        Err(reason) => {
            return HandshakeOutcome {
                ok: false,
                message: format!("签名私钥不可用：{reason}"),
            }
        }
    };
    let outcome = post_signed(client, url, &private_key, GOLDEN_PROBE_BODY);
    probe_handshake_outcome(
        outcome,
        RETRY_NOTE,
        "推送探针",
        "官方网关验证握手细节待核验(09-27)，探针语义同普通推送，期望 HTTP 200",
        "推送探针被接受：异步通知表单 POST（sign = Base64(RSA-SHA256(字母序待签串))）到达目标，返回 HTTP 200",
        no_body_check,
    )
}

/// 支付宝直发（异步通知模拟）：表单明文业务字节逐段保留 + 旧 sign 剔除现算。
/// 明文由前端逐字节拼装，不重排（ADR-0001）；应答由前端期望回执承载。
/// 私有协议原语：对外只经 [`Adapter`](super::ChannelAdapter) 路由。
fn dispatch_event(
    client: &reqwest::blocking::Client,
    url: &str,
    app_private_key: &str,
    plaintext: &str,
) -> DispatchOutcome {
    let private_key = match parse_private_key(app_private_key) {
        Ok(private_key) => private_key,
        Err(reason) => return DispatchOutcome::not_sent(format!("签名私钥不可用：{reason}")),
    };
    post_signed(client, url, &private_key, plaintext)
}

/// 支付宝渠道适配器：[`super::ChannelAdapter`] 的支付宝实现——推送探针握手
/// 与 RSA2 表单直发；原语复用 util（form_pairs/strip_form_pair），签名取
/// rsa crate，差异不外溢。宽配置 → 渠道字段收窄经 `narrow!` 单点
/// （super::adapter）。
pub(crate) struct Adapter;

impl super::ChannelAdapter for Adapter {
    fn id(&self) -> &'static str {
        "alipay"
    }

    fn label(&self) -> &'static str {
        "支付宝"
    }

    fn matches(&self, config: &ConnectionConfig) -> bool {
        matches!(config, ConnectionConfig::Alipay { .. })
    }

    fn url<'a>(&self, config: &'a ConnectionConfig) -> &'a str {
        narrow!(config, Alipay { url } => url.as_str())
    }

    fn verify_handshake(
        &self,
        client: &reqwest::blocking::Client,
        config: &ConnectionConfig,
    ) -> HandshakeOutcome {
        narrow!(config, Alipay { url, app_private_key } =>
            verify_handshake(client, url, app_private_key))
    }

    fn dispatch_event(
        &self,
        client: &reqwest::blocking::Client,
        config: &ConnectionConfig,
        plaintext: &str,
    ) -> DispatchOutcome {
        narrow!(config, Alipay { url, app_private_key } =>
            dispatch_event(client, url, app_private_key, plaintext))
    }
}
