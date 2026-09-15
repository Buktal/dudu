//! 特殊回执形态的比对（按渠道官方应答语义，从 verdict.rs 按职责拆出）：
//! 三种「目标须回结构化回包」的渠道——回包的验签/解密都在 adapter 发送时完成，
//! 结论经回执 reply 快照（None = 目标未回可验签/可解密的合规回包）带入比对。

use super::{clip, ReceiptSnapshot, RunVerdict};

/// 企微回执三形态比对（官方 §3.3：空串 / success 不带引号 / 加密被动回复包）。
pub(super) fn compare_wecom_reply(
    expected_body: &str,
    receipt: &ReceiptSnapshot,
    label: &str,
) -> RunVerdict {
    if expected_body.is_empty() {
        return if receipt.body.is_empty() {
            RunVerdict {
                passed: true,
                reason: format!("{label}，回执为空串"),
            }
        } else {
            RunVerdict {
                passed: false,
                reason: format!("{label}，期望空串，实际「{}」", clip(&receipt.body, 60)),
            }
        };
    }
    if expected_body == "success" {
        return if receipt.body == "success" {
            RunVerdict {
                passed: true,
                reason: format!("{label}，回执为 success（不带引号）"),
            }
        } else {
            RunVerdict {
                passed: false,
                reason: format!(
                    "{label}，期望逐字 success，实际「{}」",
                    clip(&receipt.body, 60)
                ),
            }
        };
    }
    match &receipt.reply {
        None => RunVerdict {
            passed: false,
            reason: format!("{label}，期望加密被动回复，但目标未回可解密的加密包"),
        },
        Some(reply) => {
            if reply.contains(expected_body) {
                RunVerdict {
                    passed: true,
                    reason: format!("{label}，解密被动回复包含「{}」", clip(expected_body, 60)),
                }
            } else {
                RunVerdict {
                    passed: false,
                    reason: format!("{label}，解密被动回复未包含「{}」", clip(expected_body, 60)),
                }
            }
        }
    }
}

/// 钉钉加密回包比对（官方 §5.6/§5.10：事件推送 1500ms 内回
/// `{"msg_signature","timeStamp","nonce","encrypt":enc("success")}`——
/// 解密明文须包含期望内容，默认 success；回包由 adapter 先验签再解密，
/// 解不出加密包时 reply 为 None）。
pub(super) fn compare_dingtalk_reply(
    expected_body: &str,
    receipt: &ReceiptSnapshot,
    label: &str,
) -> RunVerdict {
    match &receipt.reply {
        Some(reply) if reply.contains(expected_body) => RunVerdict {
            passed: true,
            reason: format!(
                "{label}，加密回包解密明文包含「{}」",
                clip(expected_body, 60)
            ),
        },
        Some(reply) => RunVerdict {
            passed: false,
            reason: format!(
                "{label}，加密回包解密明文未包含「{}」（实际「{}」）",
                clip(expected_body, 60),
                clip(reply, 60)
            ),
        },
        None => RunVerdict {
            passed: false,
            reason: format!("{label}，期望加密 success 回包，但目标未回可验签解密的加密包"),
        },
    }
}

/// QQ op13 验签回包比对（事实库 §3.2：目标须回
/// `{"plain_token":<同值>,"signature":hex(Ed25519(priv, event_ts+plain_token))}`——
/// 回包由 adapter 按连接 AppSecret 验 plain_token 回显与 Ed25519 签名，
/// 验签通过时 reply = 回显的 plain_token，否则为 None）。
pub(super) fn compare_qq_sign_reply(
    expected_body: &str,
    receipt: &ReceiptSnapshot,
    label: &str,
) -> RunVerdict {
    match &receipt.reply {
        Some(reply) if expected_body.is_empty() || reply.contains(expected_body) => RunVerdict {
            passed: true,
            reason: format!(
                "{label}，op13 回包 plain_token 回显且 Ed25519 验签通过（{}）",
                clip(reply, 60)
            ),
        },
        Some(reply) => RunVerdict {
            passed: false,
            reason: format!(
                "{label}，回包 plain_token 回显（{}）与期望（{}）不一致",
                clip(reply, 60),
                clip(expected_body, 60)
            ),
        },
        None => RunVerdict {
            passed: false,
            reason: format!("{label}，期望 op13 验签回包，但目标未回 plain_token 回显且签名可验的应答"),
        },
    }
}
