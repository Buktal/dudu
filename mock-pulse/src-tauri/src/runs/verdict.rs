//! 期望回执比对（唯一实现）：直发命令（sends）与执行器（executor）在步骤
//! 完成时判定成败（失败即停），并把结论写进运行记录——两条产路共用本模块，
//! 口径天然一致。（原与前端 features/events/receipt.ts 逐条镜像；直发收编后
//! 前端实现已删除，前端仅保留期望的展示辅助。）
//! 按职责拆分：数据类型在 [`model`]，展示辅助在 [`display`]，特殊回执形态
//! （企微/钉钉/QQ 回包）在 [`reply`]，本文件只留判定内核。

mod display;
mod model;
mod reply;

use display::{clip, preview, status_label};

// 正文形态枚举单点在 events（持久化契约所在域），按既有
// `crate::runs::verdict::ReceiptBodyMode` 消费面转发。
pub use crate::events::ReceiptBodyMode;
pub use model::ExpectedReceipt;

use super::{ReceiptSnapshot, RunVerdict};

/// 空正文仍校验回包形态的白名单：三种 reply 形态空正文仍校验回包形态本身，
/// 不得按「不校验正文」放行。单一数据源 shared/receipt-empty-body-modes.json
/// （前端 receipt.ts 展示侧同读一份，两端各自消费同一清单，漂移即单侧测试
/// 失败——shared/channels.json 黄金夹具同款先例）。
fn empty_body_validating_modes() -> &'static [ReceiptBodyMode] {
    static MODES: std::sync::OnceLock<Vec<ReceiptBodyMode>> = std::sync::OnceLock::new();
    MODES.get_or_init(|| {
        serde_json::from_str(include_str!(
            "../../../shared/receipt-empty-body-modes.json"
        ))
        .expect("空正文白名单夹具（shared/）合法")
    })
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
            // 类型错配是 mismatch 而非「无法比对」：`?` 会把 None 折叠成通过
            let Some(actual_items) = actual.as_array() else {
                return Some(format!(
                    "{}：期望数组，实际 {}",
                    if path.is_empty() { "正文" } else { path },
                    preview(actual)
                ));
            };
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
            // 同上：期望对象而实际非对象必须失败，不得经 `?` 假通过
            let Some(actual_fields) = actual.as_object() else {
                return Some(format!(
                    "{}：期望对象，实际 {}",
                    if path.is_empty() { "正文" } else { path },
                    preview(actual)
                ));
            };
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
        && !empty_body_validating_modes().contains(&expected.body_mode)
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
        ReceiptBodyMode::QqSignReply => {
            reply::compare_qq_sign_reply(&expected.body, receipt, &label)
        }
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
    fn empty_body_whitelist_fixture_pins_three_reply_modes() {
        // 与前端 receipt.ts 共读同一夹具，两端各自消费，漂移即两侧同时察觉
        assert_eq!(
            empty_body_validating_modes(),
            &[
                ReceiptBodyMode::WecomReply,
                ReceiptBodyMode::DingtalkReply,
                ReceiptBodyMode::QqSignReply,
            ]
        );
        // 白名单成员空正文不按「不校验正文」放行（ DingtalkReply/QqSignReply
        // 的形态结论见 reply 比对测试）
        let wecom = compare_receipt(&expected(200, "", WecomReply), &receipt(200, "x", None));
        assert!(!wecom.passed);
        assert_eq!(wecom.reason, "HTTP 200，期望空串，实际「x」");
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
    fn json_field_mode_type_mismatch_fails_instead_of_passing() {
        // 期望数组、实际对象：类型错配必须判失败（`?` 早退会折叠成通过）
        let array_expected = compare_receipt(
            &expected(200, r#"{"items":[1,2]}"#, JsonField),
            &receipt(200, r#"{"items":{"0":1}}"#, None),
        );
        assert!(!array_expected.passed);
        assert_eq!(
            array_expected.reason,
            r#"HTTP 200，items：期望数组，实际 {"0":1}"#
        );

        // 期望对象、实际标量（字符串按 preview 语义展示裸值）
        let object_expected = compare_receipt(
            &expected(200, r#"{"content":{"text":"hi"}}"#, JsonField),
            &receipt(200, r#"{"content":"hi"}"#, None),
        );
        assert!(!object_expected.passed);
        assert_eq!(
            object_expected.reason,
            "HTTP 200，content：期望对象，实际 hi"
        );

        // 顶层形态错配同样失败
        let top_level = compare_receipt(
            &expected(200, r#"[1,2]"#, JsonField),
            &receipt(200, r#"{"0":1,"1":2}"#, None),
        );
        assert!(!top_level.passed);
        assert_eq!(
            top_level.reason,
            r#"HTTP 200，正文：期望数组，实际 {"0":1,"1":2}"#
        );
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
            &receipt(
                200,
                r#"{"plain_token":"Other","signature":"…"}"#,
                Some("Other"),
            ),
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
