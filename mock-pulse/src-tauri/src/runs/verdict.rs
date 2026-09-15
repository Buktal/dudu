//! 期望回执比对（唯一实现）：直发命令（sends）与执行器（executor）在步骤
//! 完成时判定成败（失败即停），并把结论写进运行记录——两条产路共用本模块，
//! 口径天然一致。（原与前端 features/events/receipt.ts 逐条镜像；直发收编后
//! 前端实现已删除，前端仅保留期望的展示辅助。）
//! 特殊回执形态（企微/钉钉/QQ 回包）按职责拆在 [`reply`]。

mod reply;

use serde::{Deserialize, Serialize};

use super::{ReceiptSnapshot, RunVerdict};

/// 期望回执的正文形态（与前端 ReceiptBodyMode 一致）。
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ReceiptBodyMode {
    Contains,
    Equals,
    JsonField,
    WecomReply,
    DingtalkReply,
    QqSignReply,
}

/// 步骤期望（快照物化/直发请求由前端从事件版本或草稿带出）。
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ExpectedReceipt {
    pub status: u16,
    /// 期望正文（空 = 不校验正文，只看状态码）
    pub body: String,
    pub body_mode: ReceiptBodyMode,
}

/// 展示用：一段文本截断（避免长正文撑爆原因行；对齐前端 clip(60)）。
fn clip(text: &str, max: usize) -> String {
    let chars: Vec<char> = text.chars().collect();
    if chars.len() > max {
        let head: String = chars[..max].iter().collect();
        format!("{head}…")
    } else {
        text.to_string()
    }
}

fn preview(value: &serde_json::Value) -> String {
    match value {
        serde_json::Value::String(text) => clip(text, 60),
        other => clip(&other.to_string(), 60),
    }
}

fn status_label(status: u16) -> String {
    if status == 0 {
        "未收到响应".to_string()
    } else {
        format!("HTTP {status}")
    }
}

/// jsonField 模式的子集匹配：expected 的每个叶子需在 actual 同路径值相等
/// （回执可有额外字段/元素）。返回第一处不匹配的描述；完全匹配返回 None。
fn first_json_mismatch(
    expected: &serde_json::Value,
    actual: &serde_json::Value,
    path: &str,
) -> Option<String> {
    match expected {
        serde_json::Value::Array(items) => {
            let actual_items = actual.as_array()?;
            if actual_items.len() < items.len() {
                return Some(format!(
                    "{}：期望 {}，实际 {}",
                    if path.is_empty() { "正文" } else { path },
                    preview(expected),
                    preview(actual)
                ));
            }
            for (index, item) in items.iter().enumerate() {
                if let Some(found) =
                    first_json_mismatch(item, &actual_items[index], &format!("{path}[{index}]"))
                {
                    return Some(found);
                }
            }
            None
        }
        serde_json::Value::Object(fields) => {
            let actual_fields = actual.as_object()?;
            for (key, child) in fields {
                let child_actual = actual_fields.get(key).unwrap_or(&serde_json::Value::Null);
                let child_path = if path.is_empty() {
                    key.clone()
                } else {
                    format!("{path}.{key}")
                };
                if let Some(found) = first_json_mismatch(child, child_actual, &child_path) {
                    return Some(found);
                }
            }
            None
        }
        leaf => {
            // 数值按 JSON 数值比较（200 与 200.0 等值，对齐 JS number 语义）
            let equal = match (leaf.as_f64(), actual.as_f64()) {
                (Some(left), Some(right)) => left == right,
                _ => leaf == actual,
            };
            if equal {
                None
            } else {
                Some(format!(
                    "{}：期望 {}，实际 {}",
                    if path.is_empty() { "正文" } else { path },
                    preview(leaf),
                    preview(actual)
                ))
            }
        }
    }
}

fn compare_body(expected: &ExpectedReceipt, receipt: &ReceiptSnapshot) -> RunVerdict {
    let label = status_label(receipt.status);
    if expected.body.is_empty()
        && expected.body_mode != ReceiptBodyMode::WecomReply
        && expected.body_mode != ReceiptBodyMode::DingtalkReply
        && expected.body_mode != ReceiptBodyMode::QqSignReply
    {
        return RunVerdict {
            passed: true,
            reason: format!("{label}，与期望状态一致"),
        };
    }
    match expected.body_mode {
        ReceiptBodyMode::Equals => {
            if receipt.body == expected.body {
                RunVerdict {
                    passed: true,
                    reason: format!("{label}，正文与期望逐字一致"),
                }
            } else {
                RunVerdict {
                    passed: false,
                    reason: format!("{label}，正文与期望不一致"),
                }
            }
        }
        ReceiptBodyMode::WecomReply => reply::compare_wecom_reply(&expected.body, receipt, &label),
        ReceiptBodyMode::DingtalkReply => {
            reply::compare_dingtalk_reply(&expected.body, receipt, &label)
        }
        ReceiptBodyMode::QqSignReply => reply::compare_qq_sign_reply(&expected.body, receipt, &label),
        ReceiptBodyMode::JsonField => {
            let expected_json: serde_json::Value = match serde_json::from_str(&expected.body) {
                Ok(value) => value,
                Err(_) => {
                    return RunVerdict {
                        passed: false,
                        reason: "期望正文不是合法 JSON，无法按 JSON 字段比对".into(),
                    }
                }
            };
            let actual_json: serde_json::Value = match serde_json::from_str(&receipt.body) {
                Ok(value) => value,
                Err(_) => {
                    return RunVerdict {
                        passed: false,
                        reason: "回执正文不是合法 JSON，无法按 JSON 字段比对".into(),
                    }
                }
            };
            match first_json_mismatch(&expected_json, &actual_json, "") {
                Some(mismatch) => RunVerdict {
                    passed: false,
                    reason: format!("{label}，{mismatch}"),
                },
                None => RunVerdict {
                    passed: true,
                    reason: format!("{label}，回执包含期望的全部 JSON 字段"),
                },
            }
        }
        ReceiptBodyMode::Contains => {
            if receipt.body.contains(&expected.body) {
                RunVerdict {
                    passed: true,
                    reason: format!("{label}，正文包含「{}」", clip(&expected.body, 60)),
                }
            } else {
                RunVerdict {
                    passed: false,
                    reason: format!("{label}，正文未包含「{}」", clip(&expected.body, 60)),
                }
            }
        }
    }
}

/// 期望回执比对：状态码优先，正文按形态。
pub fn compare_receipt(expected: &ExpectedReceipt, receipt: &ReceiptSnapshot) -> RunVerdict {
    if receipt.status != expected.status {
        return RunVerdict {
            passed: false,
            reason: format!(
                "{}，期望 HTTP {}",
                status_label(receipt.status),
                expected.status
            ),
        };
    }
    compare_body(expected, receipt)
}

#[cfg(test)]
mod tests {
    use super::ReceiptBodyMode::{Contains, Equals, JsonField, WecomReply};
    use super::*;

    fn expected(status: u16, body: &str, mode: ReceiptBodyMode) -> ExpectedReceipt {
        ExpectedReceipt {
            status,
            body: body.into(),
            body_mode: mode,
        }
    }

    fn receipt(status: u16, body: &str, reply: Option<&str>) -> ReceiptSnapshot {
        ReceiptSnapshot {
            status,
            elapsed_ms: 10,
            body: body.into(),
            reply: reply.map(str::to_string),
            error: None,
        }
    }

    #[test]
    fn status_mismatch_fails_with_expected_status_in_reason() {
        let verdict = compare_receipt(&expected(200, "", Contains), &receipt(500, "boom", None));
        assert!(!verdict.passed);
        assert_eq!(verdict.reason, "HTTP 500，期望 HTTP 200");

        let no_response = compare_receipt(&expected(200, "", Contains), &receipt(0, "", None));
        assert!(!no_response.passed);
        assert_eq!(no_response.reason, "未收到响应，期望 HTTP 200");
    }

    #[test]
    fn empty_body_expectation_passes_on_status_match() {
        let verdict = compare_receipt(
            &expected(200, "", Contains),
            &receipt(200, "anything", None),
        );
        assert!(verdict.passed);
        assert_eq!(verdict.reason, "HTTP 200，与期望状态一致");
    }

    #[test]
    fn contains_mode_checks_substring() {
        let pass = compare_receipt(
            &expected(200, "code", Contains),
            &receipt(200, r#"{"code":0}"#, None),
        );
        assert!(pass.passed);

        let fail = compare_receipt(
            &expected(200, "missing", Contains),
            &receipt(200, r#"{"code":0}"#, None),
        );
        assert!(!fail.passed);
        assert_eq!(fail.reason, "HTTP 200，正文未包含「missing」");
    }

    #[test]
    fn equals_mode_requires_exact_body() {
        let pass = compare_receipt(&expected(200, "ok", Equals), &receipt(200, "ok", None));
        assert_eq!(pass.reason, "HTTP 200，正文与期望逐字一致");

        let fail = compare_receipt(&expected(200, "ok", Equals), &receipt(200, "ok ", None));
        assert_eq!(fail.reason, "HTTP 200，正文与期望不一致");
    }

    #[test]
    fn json_field_mode_matches_subset_with_first_mismatch_path() {
        let expected_body = r#"{"code":0,"content":{"text":"hi"},"items":[1,2]}"#;
        let pass = compare_receipt(
            &expected(200, expected_body, JsonField),
            &receipt(
                200,
                r#"{"extra":true,"code":0,"content":{"text":"hi","more":1},"items":[1,2,9]}"#,
                None,
            ),
        );
        assert!(pass.passed, "{pass:?}");
        assert_eq!(pass.reason, "HTTP 200，回执包含期望的全部 JSON 字段");

        let fail = compare_receipt(
            &expected(200, expected_body, JsonField),
            &receipt(200, r#"{"code":0,"content":{"text":"bye"}}"#, None),
        );
        assert!(!fail.passed);
        // 字符串叶子按前端 preview 语义展示裸值（不加 JSON 引号）
        assert_eq!(fail.reason, "HTTP 200，content.text：期望 hi，实际 bye");
    }

    #[test]
    fn json_field_mode_rejects_non_json_inputs() {
        let bad_expected = compare_receipt(
            &expected(200, "not json", JsonField),
            &receipt(200, "{}", None),
        );
        assert_eq!(
            bad_expected.reason,
            "期望正文不是合法 JSON，无法按 JSON 字段比对"
        );

        let bad_actual = compare_receipt(
            &expected(200, "{}", JsonField),
            &receipt(200, "not json", None),
        );
        assert_eq!(
            bad_actual.reason,
            "回执正文不是合法 JSON，无法按 JSON 字段比对"
        );
    }

    #[test]
    fn wecom_reply_mode_covers_three_official_shapes() {
        // 留空 = 回执必须空串
        assert!(compare_receipt(&expected(200, "", WecomReply), &receipt(200, "", None)).passed);
        let non_empty = compare_receipt(
            &expected(200, "", WecomReply),
            &receipt(200, "success", None),
        );
        assert_eq!(non_empty.reason, "HTTP 200，期望空串，实际「success」");

        // success = 逐字相等（不带引号）
        assert!(
            compare_receipt(
                &expected(200, "success", WecomReply),
                &receipt(200, "success", None)
            )
            .passed
        );
        let quoted = compare_receipt(
            &expected(200, "success", WecomReply),
            &receipt(200, "\"success\"", None),
        );
        assert_eq!(
            quoted.reason,
            "HTTP 200，期望逐字 success，实际「\"success\"」"
        );

        // 其他内容 = 加密被动回复的解密明文包含该片段
        let pass = compare_receipt(
            &expected(200, "hi", WecomReply),
            &receipt(
                200,
                "<xml><Encrypt>…</Encrypt></xml>",
                Some("hello hi there"),
            ),
        );
        assert_eq!(pass.reason, "HTTP 200，解密被动回复包含「hi」");

        let no_reply = compare_receipt(&expected(200, "hi", WecomReply), &receipt(200, "", None));
        assert_eq!(
            no_reply.reason,
            "HTTP 200，期望加密被动回复，但目标未回可解密的加密包"
        );
    }

    #[test]
    fn expected_receipt_deserializes_frontend_camel_case() {
        let raw = r#"{"status":200,"body":"ok","bodyMode":"jsonField"}"#;
        let parsed: ExpectedReceipt = serde_json::from_str(raw).unwrap();
        assert_eq!(parsed.body_mode, ReceiptBodyMode::JsonField);
        assert_eq!(parsed.status, 200);
    }

    #[test]
    fn dingtalk_reply_mode_checks_decrypted_envelope_plaintext() {
        // 加密 success 回包：adapter 已验签解密的回包明文须包含期望内容
        let pass = compare_receipt(
            &expected(200, "success", ReceiptBodyMode::DingtalkReply),
            &receipt(200, r#"{"encrypt":"…"}"#, Some("success")),
        );
        assert!(pass.passed, "{pass:?}");
        assert_eq!(pass.reason, "HTTP 200，加密回包解密明文包含「success」");

        // 回包明文非 success：不通过
        let wrong = compare_receipt(
            &expected(200, "success", ReceiptBodyMode::DingtalkReply),
            &receipt(200, r#"{"encrypt":"…"}"#, Some("ok")),
        );
        assert!(!wrong.passed);
        assert_eq!(
            wrong.reason,
            "HTTP 200，加密回包解密明文未包含「success」（实际「ok」）"
        );

        // 目标未回可解密的加密包（明文回包/空包）：不通过
        let no_reply = compare_receipt(
            &expected(200, "success", ReceiptBodyMode::DingtalkReply),
            &receipt(200, "success", None),
        );
        assert!(!no_reply.passed);
        assert_eq!(
            no_reply.reason,
            "HTTP 200，期望加密 success 回包，但目标未回可验签解密的加密包"
        );
    }

    #[test]
    fn qq_sign_reply_mode_checks_verified_op13_reply() {
        // op13 验签回包：adapter 已验 plain_token 回显 + Ed25519 签名，
        // reply = 回显的 plain_token，须包含期望内容
        let pass = compare_receipt(
            &expected(200, "Arq0D5A61EgUu4OxUvOp", ReceiptBodyMode::QqSignReply),
            &receipt(
                200,
                r#"{"plain_token":"Arq0D5A61EgUu4OxUvOp","signature":"87be…"}"#,
                Some("Arq0D5A61EgUu4OxUvOp"),
            ),
        );
        assert!(pass.passed, "{pass:?}");
        assert_eq!(
            pass.reason,
            "HTTP 200，op13 回包 plain_token 回显且 Ed25519 验签通过（Arq0D5A61EgUu4OxUvOp）"
        );

        // 回显的 plain_token 与期望不一致（请求值被改后未同步期望）：不通过
        let wrong = compare_receipt(
            &expected(200, "Arq0D5A61EgUu4OxUvOp", ReceiptBodyMode::QqSignReply),
            &receipt(200, r#"{"plain_token":"Other","signature":"…"}"#, Some("Other")),
        );
        assert!(!wrong.passed);
        assert_eq!(
            wrong.reason,
            "HTTP 200，回包 plain_token 回显（Other）与期望（Arq0D5A61EgUu4OxUvOp）不一致"
        );

        // 目标未回可验签的应答（验签不过/缺字段/明文）：不通过
        let no_reply = compare_receipt(
            &expected(200, "Arq0D5A61EgUu4OxUvOp", ReceiptBodyMode::QqSignReply),
            &receipt(200, "ok", None),
        );
        assert!(!no_reply.passed);
        assert_eq!(
            no_reply.reason,
            "HTTP 200，期望 op13 验签回包，但目标未回 plain_token 回显且签名可验的应答"
        );
    }
}
