//! 支付宝渠道测试公共体：测试密钥单点（rsa crate 测试内生成 2048 位密钥对，
//! 三种文本形态互转）+ 官方样本常量（事实库 alipay.md §5.1 逐字）+ 网络基建
//! 复用（crate::test_support 单请求监听）。按职责拆分：[`golden`] RSA2 签名
//! 黄金对拍与待签串语义（无需网络）、[`chain`] 探针握手与直发全链路（本地
//! TcpListener）。
//!
//! 官方未给可用的通知验签向量（§5.1 完整原始 POST body 全文待核验，官方样例
//! sign 为截断示意值，事实库警示「切勿用本 §5.1 拼出的串做验签回归向量」）——
//! 黄金对拍以「签名 → 验签」自反 + 篡改必败 + 独立边界（空串/乱序）锚定，
//! 不以示意值作对拍。

mod chain;
mod golden;

use crate::connections::ConnectionConfig;
use crate::test_support::quick_client;

use super::*;

// ---- 官方样本常量（事实库逐字） ----

/// 官方 §5.1 公共参数表 + 业务参数表逐字值拼出的核验样本表单（form 字节，
/// 见 mod.rs 常量文档）：探针与直发样本同源。
pub(super) const GOLDEN_NOTIFY_BODY: &str = GOLDEN_PROBE_BODY;

/// 官方 §5.1 样本 notify_id（通知校验 ID，幂等键 §3.4）。
pub(super) const GOLDEN_NOTIFY_ID: &str = "ac05099524730693a8b330c45cf72da943";

/// 官方 §5.1 样本 notify_time（通知发送时间 yyyy-MM-dd HH:mm:ss）。
pub(super) const GOLDEN_NOTIFY_TIME: &str = "2018-10-21 15:45:22";

/// 官方 §5.1 样本 trade_no（支付宝交易号）。
pub(super) const GOLDEN_TRADE_NO: &str = "2013112011001004330000121536";

// ---- 测试密钥单点（rsa crate 测试内生成，2048 位 = 官方 RSA2 口径） ----

use std::sync::OnceLock;

static TEST_KEY_PEM: OnceLock<String> = OnceLock::new();

/// 测试私钥（PKCS#8 PEM 形态）：rsa crate 测试内生成 2048 位密钥对，全测试
/// 共享一份（OnceLock，键生成毫秒级但也不必每测重跑）；连接配置吃 PEM 文本，
/// 三种文本形态（PKCS#8/PKCS#1 PEM 与 DER Base64）由 golden.rs 互转核验。
pub(super) fn test_private_key_pem() -> String {
    TEST_KEY_PEM
        .get_or_init(|| {
            use rand::rngs::OsRng;
            let private_key =
                RsaPrivateKey::new(&mut OsRng, 2048).expect("生成 2048 位测试密钥对失败");
            use rsa::pkcs8::{EncodePrivateKey, LineEnding};
            private_key
                .to_pkcs8_pem(LineEnding::LF)
                .expect("序列化 PKCS#8 PEM 失败")
                .to_string()
        })
        .clone()
}

pub(super) fn alipay_config(url: String, private_key_pem: &str) -> ConnectionConfig {
    ConnectionConfig::Alipay {
        url,
        app_id: "2019082200007148".into(),
        app_private_key: private_key_pem.into(),
    }
}

/// quick 客户端别名（网络基建在 crate::test_support 共享）。
pub(super) fn client() -> reqwest::blocking::Client {
    quick_client(std::time::Duration::from_secs(2))
}
