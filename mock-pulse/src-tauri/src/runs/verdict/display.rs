//! 期望比对的展示辅助（按职责自 verdict.rs 拆出）：截断、值预览与状态码
//! 标签。只服务原因行的人类可读性，不参与判定；特殊回执形态的比对见
//! [`super::reply`]。

/// 展示用：一段文本截断（避免长正文撑爆原因行；对齐前端 clip(60)）。
pub(super) fn clip(text: &str, max: usize) -> String {
    let chars: Vec<char> = text.chars().collect();
    if chars.len() > max {
        let head: String = chars[..max].iter().collect();
        format!("{head}…")
    } else {
        text.to_string()
    }
}

pub(super) fn preview(value: &serde_json::Value) -> String {
    match value {
        serde_json::Value::String(text) => clip(text, 60),
        other => clip(&other.to_string(), 60),
    }
}

pub(super) fn status_label(status: u16) -> String {
    if status == 0 {
        "未收到响应".to_string()
    } else {
        format!("HTTP {status}")
    }
}
