//! 连接域网络骨架：客户端构造、直发测量收口（计时 → 发送 → 结果折叠）与
//! 握手应答判定骨架（GET echostr / 推送探针）。这些是各渠道自发收敛的共性
//! 结构（Reuse-first 审计退件），渠道只提供协议差异（超时注记、期望值、成功
//! 文案、正文语义校验），传输与装配结构不再逐渠道复制（ADR-0001）。

use std::time::{Duration, Instant};

use crate::connections::util::callback_signature;

use super::{DispatchOutcome, HandshakeOutcome};

/// 指定超时的客户端（各渠道握手/直发、执行器与测试共用同一构造，不复制协议）。
pub(crate) fn client_with_timeout(timeout: Duration) -> reqwest::blocking::Client {
    reqwest::blocking::Client::builder()
        .timeout(timeout)
        .build()
        .expect("构造 reqwest 客户端失败")
}

/// 直发用默认客户端：对齐官方 5 秒应答窗口，本地留 5s 上限。
pub(crate) fn dispatch_client() -> reqwest::blocking::Client {
    client_with_timeout(Duration::from_secs(5))
}

/// reqwest 错误分类 → 人类可读原因（单点，各渠道握手/直发现场共用同一文案）：
/// 超时 / 连接失败 / 其他发送失败；超时可附渠道补充（如官方应答窗口）。
pub(crate) fn request_error_reason(err: &reqwest::Error, timeout_note: &str) -> String {
    if err.is_timeout() {
        format!("等待响应超时{timeout_note}")
    } else if err.is_connect() {
        "无法连接到目标地址".to_string()
    } else {
        "请求发送失败".to_string()
    }
}

/// 握手响应体读取失败的归因文案（单点，抖音/飞书/WhatsApp 三处 challenge
/// 握手共用）：读失败折进空串会误判「challenge 不一致」，须显式归因
pub(crate) fn handshake_read_error(err: &reqwest::Error) -> String {
    format!("响应读取失败：{err}")
}

/// 直发测量实现（Reuse-first 审计退件：此收口块曾在 15+ 渠道逐字复制——计时 →
/// 发送 → 状态/回执/错误/耗时四元组）：计时口径、Ok/Err 折叠与错误文案
/// （request_error_reason）单点在本体。唯一调用方是 [`send_measured_outcome`]，
/// 渠道不再直接消费四元组手写装订——直发测量的唯一 seam 是成品收口。
fn send_measured(
    request: reqwest::blocking::RequestBuilder,
    timeout_note: &str,
) -> (u16, String, Option<String>, u64) {
    let started = Instant::now();
    let response = request.send();
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
            Some(format!("{}：{err}", request_error_reason(&err, timeout_note))),
        ),
    };
    (status, receipt, error, elapsed_ms)
}

/// 直发的协议要素快照：发出请求前即已确定、Ok/Err 两分支同值的四字段
/// （[`DispatchOutcome`] 的快照半边；测量回执半边由 [`send_measured_outcome`]
/// 装订）。字段语义见 [`DispatchOutcome`] 各字段文档。
pub(crate) struct DispatchSnapshot {
    /// 发送唯一标识快照（无唯一标识头的渠道为空串）
    pub msg_id: String,
    /// 主签名快照（无签名头的明文渠道为空串）
    pub signature: String,
    /// 签名时间戳快照（无时间戳要素的渠道为 None）
    pub timestamp: Option<String>,
    /// 实际发出的请求体快照（超时/连接失败路径同样保留）
    pub request_body: Option<String>,
}

/// 直发成品收口（send_measured 加深一层），渠道直发测量的唯一 seam：计时与
/// Ok/Err 折叠之上，把协议要素快照（两分支同值）与 Ok 分支增量装订成成品
/// [`DispatchOutcome`]。Err 分支（status 0 / 空正文 / request_error_reason
/// 折叠文案 / reply None）单点在本体，全部渠道不再各自手写双分支组装；
/// `reply` 只在收到响应时调用（入参状态码 + 回执正文，如加密回包解密；
/// 无 Ok 分支增量的渠道传 [`no_reply`]），未发出请求恒 None。
pub(crate) fn send_measured_outcome(
    request: reqwest::blocking::RequestBuilder,
    timeout_note: &str,
    snapshot: DispatchSnapshot,
    reply: impl FnOnce(u16, &str) -> Option<String>,
) -> DispatchOutcome {
    let (status, body, error, elapsed_ms) = send_measured(request, timeout_note);
    let reply = if error.is_none() { reply(status, &body) } else { None };
    DispatchOutcome {
        msg_id: snapshot.msg_id,
        signature: snapshot.signature,
        timestamp: snapshot.timestamp,
        request_body: snapshot.request_body,
        reply,
        status,
        elapsed_ms,
        body,
        error,
    }
}

/// 无 Ok 分支增量的渠道共用：收到的响应不推导任何要素（无加密回包、应答
/// 无口径），reply 恒 None，回执事实全由 status/body 承载。
pub(crate) fn no_reply(_: u16, _: &str) -> Option<String> {
    None
}

/// GET echostr 握手应答判定骨架（Reuse-first 审计退件：此判定段曾在 5 处
/// 逐字复制——发送失败 → 超时文案；非 2xx → 握手未通过；2xx → 响应体与
/// 期望值逐字节比对）。差异（期望值、超时补充、成功文案、逐字节不符说明）
/// 留在调用侧；whatsapp 变体（非 2xx 文案含 verify_token 说明、不符文案含
/// JSON 信封警示）保留自有判定。构造半边已收敛为 [`handshake_echo_get`]，
/// 收敛后渠道侧直调仅余企微 wecom 自有 GET 握手。
pub(crate) fn handshake_echo_outcome(
    response: Result<reqwest::blocking::Response, reqwest::Error>,
    expected: &[u8],
    timeout_note: &str,
    success_message: &str,
    mismatch_note: &str,
) -> HandshakeOutcome {
    let response = match response {
        Ok(response) => response,
        Err(err) => {
            return HandshakeOutcome {
                ok: false,
                message: format!("{}：{err}", request_error_reason(&err, timeout_note)),
            };
        }
    };

    let status = response.status();
    if !status.is_success() {
        return HandshakeOutcome {
            ok: false,
            message: format!("目标返回 HTTP {status}，echostr 握手未通过"),
        };
    }

    let body = response.bytes().unwrap_or_default();
    if body.as_ref() == expected {
        HandshakeOutcome {
            ok: true,
            message: success_message.to_string(),
        }
    } else {
        let echoed = String::from_utf8_lossy(&body).to_string();
        HandshakeOutcome {
            ok: false,
            message: format!("HTTP 200 但{mismatch_note}：{echoed:?}"),
        }
    }
}

/// GET echostr 握手构造骨架（构造半边收敛；应答判定半边见
/// [`handshake_echo_outcome`]，Reuse-first 审计退件：随机要素生成之外的装配段
/// 曾在 4 处逐字复制——三参签名 → 四参 GET → 发送 → 应答判定）。随机 echostr/
/// 时间戳/nonce 由渠道按官方形态自备后传入——形态与时间源（secs/millis）是
/// 逐渠道协议差异（微信族 32 位 hex + 秒、微博 10 位字母数字 + 8 位数字 nonce
/// + 毫秒），留在各渠道（ADR-0001）；三参签名（callback_signature 单点）的
/// 密钥来源经 `signing_key` 承载（微信/小红书 = Token，微博 = App Secret）。
pub(crate) fn handshake_echo_get(
    client: &reqwest::blocking::Client,
    url: &str,
    echostr: String,
    timestamp: String,
    nonce: String,
    signing_key: &str,
    timeout_note: &str,
    success_message: &str,
    mismatch_note: &str,
) -> HandshakeOutcome {
    let signature = callback_signature(signing_key, &timestamp, &nonce);
    let response = client.get(url).query(&[
        ("signature", signature.as_str()),
        ("timestamp", timestamp.as_str()),
        ("nonce", nonce.as_str()),
        ("echostr", echostr.as_str()),
    ]);
    handshake_echo_outcome(
        response.send(),
        echostr.as_bytes(),
        timeout_note,
        success_message,
        mismatch_note,
    )
}

/// 推送探针握手判定骨架（Reuse-first 审计退件：此判定段曾在 7 处逐字复制——
/// 发送失败 → 失败原因 + 渠道注记；非 2xx → 「目标返回 HTTP {}，{探针名}未
/// 通过（核验注记）」；2xx → 可选正文语义校验后成功文案）。探针发送仍由各
/// 渠道私有 post 原语完成（ADR-0001），本骨架只收判定与装配结构；各渠道注记
/// （重试口径待核验/官方无握手/成功判 2XY 等）是逐渠道事实，逐字经参数透传。
/// ark 变体（2xx 后还须应答体满足官方语义 success/error_code）经 `body_check`
/// 承载——入参（status + body）供闭包自组「HTTP {status}，但{原因}」式文案，
/// 无正文口径的渠道传 [`no_body_check`]。归位来历：上轮收敛余留 5 处带回包
/// 语义校验的手写同构判定，taobao/bilibili/kuaishou/qq 四渠道已迁回本骨架
/// （qq error 分支与非 2xx 均无注记口径——`unaccepted_note` 为空串时非 2xx
/// 文案省略括号）；dingtalk check_url 判定对象是解密 reply 的 Some/None
/// 三分支而非回执正文，保留自有判定。
pub(crate) fn probe_handshake_outcome(
    outcome: DispatchOutcome,
    failure_note: &str,
    probe_label: &str,
    unaccepted_note: &str,
    success_message: &str,
    body_check: impl FnOnce(u16, &str) -> Option<String>,
) -> HandshakeOutcome {
    if let Some(error) = outcome.error {
        return HandshakeOutcome {
            ok: false,
            message: format!("{error}{failure_note}"),
        };
    }
    if !(200..300).contains(&outcome.status) {
        // 核验注记空串（渠道无非 2xx 注记口径）时省略括号，不留悬空「（）」
        let note = if unaccepted_note.is_empty() {
            String::new()
        } else {
            format!("（{unaccepted_note}）")
        };
        return HandshakeOutcome {
            ok: false,
            message: format!("目标返回 HTTP {}，{probe_label}未通过{note}", outcome.status),
        };
    }
    if let Some(message) = body_check(outcome.status, &outcome.body) {
        return HandshakeOutcome { ok: false, message };
    }
    HandshakeOutcome {
        ok: true,
        message: success_message.to_string(),
    }
}

/// 无 2xx 正文语义口径的渠道共用（对仗 [`no_reply`]）：探针成功判定只看状态
/// 码（应答正文无官方口径），`body_check` 恒通过。
pub(crate) fn no_body_check(_: u16, _: &str) -> Option<String> {
    None
}
