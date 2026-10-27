//! 跨渠道签名/加密原语（util 层单点，各渠道 adapter 复用，不感知渠道语义）：
//! - [`sha1_hex`]：按给定顺序拼接后 sha1 → 40 位小写 hex（抖音 dop/生活服务
//!   X-Douyin-Signature、饿了么 SHA1 五步第 4 步）
//! - [`sha1_sorted_hex`]：字典序排序后拼接 sha1（微信系四值签名家族：
//!   企微 msg_signature、抖音服务商 MsgSignature、钉钉 signature）
//! - [`md5_base64`]：md5 摘要（16 字节）→ 标准 base64（抖音小游戏 x-signature）
//! - [`md5_hex`]：按给定顺序拼接各段后 md5 → 32 位小写 hex（快手 kwaisign）
//! - [`sha256_hex`]：按给定顺序拼接各段（字节串）后 sha256 → 64 位小写 hex
//!   （飞书 X-Lark-Signature：timestamp+nonce+encrypt_key+原始 body 字节）
//! - [`hmac_sha256_base64`]：HMAC-SHA256（RFC 2104，RustCrypto hmac 构造）→
//!   标准 base64（钉钉机器人 sign 头）
//! - [`utc8_timestamp`]：epoch 秒 → 东八区 `yyyy-MM-dd HH:mm:ss`（历法换算
//!   由 time crate 完成；京东 JOS timestamp §4.1/§4.2 与 B站事件 timestamp
//!   §2.2 官方逐字同形）
//! - [`percent_decode`]/[`form_encode_value`]/[`form_pairs`]/[`strip_sig`]：
//!   form-urlencoded 编解码原语（RFC 3986 非保留字集、大写 hex、+ 还原空格，
//!   与前端 form.ts 单点同一语义；美团/饿了么/支付宝表单线共用，#45 自美团
//!   提炼；编码端走 percent-encoding crate，解码端不换库的原因见
//!   [`percent_decode`] 注）
//! - [`md5_wrapped_sign`]：secret 夹两端的排序 MD5 大写签名（京东 JOS / 拼多多
//!   PMC 同一官方算法，曾在两渠道逐字双写）
//! - [`callback_signature`]：GET echostr 握手三参 sha1 签名（微信族/小红书
//!   小程序/微博同式，曾在三处换名薄包装）
//! - [`append_absent`]：签名参数集追加缺失的系统参数（美团/饿了么/拼多多
//!   「系统参数并入签名参数集」共用形态）
//! - [`borrowed_pairs`]：String 参数集转借用 kv 对（签名原语收 &str 对，
//!   美团/饿了么/拼多多直发路径共用）
//! - [`now_secs`]/[`now_millis`]：当前 Unix 秒/毫秒（各渠道 timestamp 取现值，
//!   曾在 16 处渠道逐字复制）
//! - [`random_bytes_16`]/[`random_digits`]：随机原语（16 字节 uuid v4 字节、
//!   定长逐位均匀数字串；曾在企微/小红书/飞书与 WhatsApp/微博/B站逐字复制）
//!
//! 拼接序/密钥来源等渠道语义由各 adapter 组合，本模块只提供纯原语。

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use md5::Md5;
use percent_encoding::{utf8_percent_encode, AsciiSet, NON_ALPHANUMERIC};
use sha1::{Digest, Sha1};
use sha2::Sha256;
use time::format_description::FormatItem;
use time::macros::format_description;
use time::{OffsetDateTime, UtcOffset};

/// RFC 3986 非保留字集（A-Za-z0-9 与 `-` `_` `.` `~`）之外逐字节编码的编码集
/// （percent-encoding 恒输出大写 hex、按 UTF-8 字节序；space 在集内 → `%20`，
/// 与前端 form.ts 同一语义单点）。
const FORM_ENCODE_SET: &AsciiSet = &NON_ALPHANUMERIC
    .remove(b'-')
    .remove(b'_')
    .remove(b'.')
    .remove(b'~');

/// 饿了么签名线编码集（eleme `sig_encode_value` 专用）：同 [`FORM_ENCODE_SET`]
/// 但 space 移出集（原样保留，由调用侧改写为官方 `x-www-form-urlencoded`
/// 的「+」形态）。
pub(crate) const SIG_ENCODE_SET: &AsciiSet = &FORM_ENCODE_SET.remove(b' ');

/// `yyyy-MM-dd HH:mm:ss`（京东 JOS timestamp §4.1/§4.2 与 B站事件 timestamp
/// §2.2 官方逐字同形的派生格式描述）。
const UTC8_TIMESTAMP_FORMAT: &[FormatItem<'static>] =
    &format_description!("[year]-[month]-[day] [hour]:[minute]:[second]");

/// 按给定顺序拼接各段后取 sha1，输出 40 位小写 hex。
pub(crate) fn sha1_hex(parts: &[&str]) -> String {
    let mut hasher = Sha1::new();
    for part in parts {
        hasher.update(part.as_bytes());
    }
    hex::encode(hasher.finalize())
}

/// 按给定顺序拼接各段（字节串）后取 sha256，输出 64 位小写 hex。
pub(crate) fn sha256_hex(parts: &[&[u8]]) -> String {
    let mut hasher = Sha256::new();
    for part in parts {
        hasher.update(part);
    }
    hex::encode(hasher.finalize())
}

/// 各段按字典序排序后拼接取 sha1（微信系四值签名家族的公共形态）。
pub(crate) fn sha1_sorted_hex(values: &[&str]) -> String {
    let mut sorted = values.to_vec();
    sorted.sort_unstable();
    sha1_hex(&sorted)
}

/// md5 摘要（16 字节）→ 标准 base64（抖音小游戏 x-signature，事实库 §4.2）。
pub(crate) fn md5_base64(input: &str) -> String {
    let mut hasher = Md5::new();
    hasher.update(input.as_bytes());
    BASE64.encode(hasher.finalize())
}

/// 按给定顺序拼接各段后取 md5，输出 32 位小写 hex（快手 kwaisign，事实库 §4.1）。
pub(crate) fn md5_hex(parts: &[&str]) -> String {
    let mut hasher = Md5::new();
    for part in parts {
        hasher.update(part.as_bytes());
    }
    hex::encode(hasher.finalize())
}

/// secret 夹两端的排序 MD5 大写签名（京东 JOS §4.1 与拼多多 PMC §4.1 同一
/// 官方算法形态，曾在两渠道逐字双写，审计退件提炼单点）：所有请求参数按名
/// 升序排列（Rust 字符串比较即字节序 = ASCII 序），k+v 次序无缝拼接，secret
/// 夹在串的两端，MD5 后转大写 → 32 位大写 hex。输入参数序不敏感（内部排序）。
pub(crate) fn md5_wrapped_sign(params: &[(&str, &str)], secret: &str) -> String {
    let mut sorted = params.to_vec();
    sorted.sort_by(|a, b| a.0.cmp(b.0));
    let mut concat = String::new();
    for (key, value) in sorted {
        concat.push_str(key);
        concat.push_str(value);
    }
    md5_hex(&[secret, &concat, secret]).to_uppercase()
}

/// GET echostr 握手三参签名（微信族三参 signature / 小红书小程序 / 微博同一
/// 官方形态，曾在三处换名薄包装，审计退件收敛单点）：sha1(字典序排序三参后
/// 拼接)，40 位小写 hex。渠道差异只在密钥来源（微信/小红书 = Token，微博 =
/// App Secret）；官方黄金算例（微博 xyz123xyz/1397022061823/57155157 →
/// 90e4c22c…、公众号数值例 899cf89e…、小程序算例 f464b24…）由各渠道测试锚定。
pub(crate) fn callback_signature(first: &str, second: &str, third: &str) -> String {
    sha1_sorted_hex(&[first, second, third])
}

/// 签名参数集追加缺失的系统参数（美团/饿了么/拼多多「系统参数并入签名参数
/// 集」共用形态，审计退件提炼单点）：同名键以既有值为准（防重复键破坏排序
/// 拼串），缺失才落尾部追加。
pub(crate) fn append_absent(params: &mut Vec<(String, String)>, extras: &[(&str, &str)]) {
    for (key, value) in extras {
        if !params.iter().any(|(existing, _)| existing == key) {
            params.push((key.to_string(), value.to_string()));
        }
    }
}

/// 借用 kv 参数集（String 对 → &str 对）：签名原语收 `&[(&str, &str)]`
/// （探针路径传字面量数组），持有 String 参数集的直发路径经此一行转借用
/// （美团/饿了么/拼多多三处同形转换收敛单点）。
pub(crate) fn borrowed_pairs(params: &[(String, String)]) -> Vec<(&str, &str)> {
    params
        .iter()
        .map(|(key, value)| (key.as_str(), value.as_str()))
        .collect()
}

/// 当前 Unix 秒（各渠道 timestamp 系统参数取现值；曾在 16 处渠道逐字复制，
/// 审计退件收敛单点）。
pub(crate) fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|elapsed| elapsed.as_secs())
        .unwrap_or(0)
}

/// 当前 Unix 毫秒（毫秒形态 timestamp 的渠道取现值，同 [`now_secs`] 收敛）。
pub(crate) fn now_millis() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis())
        .unwrap_or(0)
}

/// 16 字节随机数：uuid v4 字节（依赖内已有的随机源，不额外引随机库）。
/// 曾在企微/小红书/飞书三处逐字复制，收敛单点。
pub(crate) fn random_bytes_16() -> [u8; 16] {
    *uuid::Uuid::new_v4().as_bytes()
}

/// 定长数字串：逐位 0-9 均匀采样（rand Uniform，无模偏差）。曾在 WhatsApp/
/// 微博/B站三处同形复制，收敛单点；首位非零、数值区间等形态约束由调用方
/// 组合（B站首位、抖音服务商数值区间各留渠道模块）。
pub(crate) fn random_digits(len: usize) -> String {
    use rand::distributions::{Distribution, Uniform};
    let digit = Uniform::new(0u8, 10);
    let mut rng = rand::thread_rng();
    (0..len)
        .map(|_| char::from(b'0' + digit.sample(&mut rng)))
        .collect()
}

/// HMAC-SHA256（RFC 2104，RustCrypto hmac 构造：key pad / 过长先散列 /
/// ipad-opad 双轮由库实现），输出 32 字节摘要（RFC 4231 向量验收）。
pub(crate) fn hmac_sha256(key: &[u8], data: &[u8]) -> [u8; 32] {
    use hmac::{Hmac, Mac};
    type HmacSha256 = Hmac<Sha256>;
    let mut mac = HmacSha256::new_from_slice(key).expect("HMAC 接受任意长度 key");
    mac.update(data);
    mac.finalize().into_bytes().into()
}

/// HMAC-SHA256 → 标准 base64（钉钉机器人 sign =
/// Base64(HmacSHA256(timestamp + "\n" + appSecret, key=appSecret))）。
pub(crate) fn hmac_sha256_base64(key: &str, data: &str) -> String {
    BASE64.encode(hmac_sha256(key.as_bytes(), data.as_bytes()))
}

/// HMAC-SHA256 → 64 位小写 hex（淘宝全球栈 Authorization =
/// HEX_ENCODE(HMAC-SHA256(AppKey + message_body, AppSecret))，事实库 §4.2；
/// 官方 Java 示例逐字节 %02x 拼接后 toLowerCase，即小写 hex）。
pub(crate) fn hmac_sha256_hex(key: &str, data: &str) -> String {
    hex::encode(hmac_sha256(key.as_bytes(), data.as_bytes()))
}

/// epoch 秒 → 东八区 `yyyy-MM-dd HH:mm:ss`（京东 JOS timestamp §4.1/§4.2
/// 与 B站事件 timestamp §2.2 官方逐字同形）：历法换算（civil_from_days 曾
/// 在京东/B站两处手写，退件纠正）由 time crate 单点完成，固定 +08:00 偏移
/// 不随运行机器时区漂移。
pub(crate) fn utc8_timestamp(unix_secs: u64) -> String {
    OffsetDateTime::from_unix_timestamp(unix_secs as i64)
        .expect("输入为 Unix 秒（当前时刻/官方向量），不越界")
        .to_offset(UtcOffset::from_hms(8, 0, 0).expect("固定 +08:00 恒合法"))
        .format(UTC8_TIMESTAMP_FORMAT)
        .expect("固定格式化描述不可能失败")
}

/// 表单值百分号解码（RFC 3986 字节还原 + form 惯例「+」还原空格）：与前端
/// form.ts 单点同一语义（大写 hex 编码、UTF-8 字节序）。#45 自美团渠道提炼
/// 为跨渠道原语（美团/饿了么表单线共用）。
///
/// 为何不换 `percent-encoding` crate：本侧语义其 percent_decode 本可覆盖
/// （非法 % 序列原样保留、大小写 hex 均收，「+」前置 replace 一行）——但
/// 前端同语义单点（form.ts）无法等价换 `decodeURIComponent`：它对「坏 %
/// 序列」与「坏 UTF-8 字节序」同报单一 URIError，混同了前端有测试锚定的
/// 两条可读错误，孤代理等边缘字节序行为亦有漂移。按「同一字节语义单点、
/// 官方载荷逐字对齐」的设计约束（铁律：两端同换或同不换），解码端两侧都
/// 保留手写，由对拍测试锚定；编码端已随本轮换库（见 [`form_encode_value`]）。
pub(crate) fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        match bytes[index] {
            b'%' if index + 2 < bytes.len()
                && bytes[index + 1].is_ascii_hexdigit()
                && bytes[index + 2].is_ascii_hexdigit() =>
            {
                let hex = std::str::from_utf8(&bytes[index + 1..index + 3]).unwrap_or("");
                out.push(u8::from_str_radix(hex, 16).unwrap_or(b'%'));
                index += 3;
            }
            b'+' => {
                out.push(b' ');
                index += 1;
            }
            byte => {
                out.push(byte);
                index += 1;
            }
        }
    }
    String::from_utf8(out)
        .unwrap_or_else(|err| String::from_utf8_lossy(err.as_bytes()).into_owned())
}

/// 表单值百分号编码（RFC 3986 非保留字集原样，其余按 UTF-8 字节输出大写
/// %XX）：美团直发追加系统级参数、饿了么 H5 表单线与支付宝 sign 拼装共用。
/// percent-encoding 自定义 AsciiSet（[`FORM_ENCODE_SET`]）与前端 form.ts 的
/// `encodeURIComponent + RFC 3986 补码` 组合同为同一语义单点（非法孤代理
/// 在 TextEncoder 路径替换为 U+FFFD、encodeURIComponent 抛错，两端对合法
/// 载荷字节恒等，由对拍测试锚定）。
pub(crate) fn form_encode_value(text: &str) -> String {
    utf8_percent_encode(text, FORM_ENCODE_SET).to_string()
}

/// 明文表单 → 解码 kv 对（文档序）：无值参数落空串（美团「没有值的参数也需
/// 拼接」§4.1）；空段（连续 &）跳过。
///
/// 口径差（有意）：线上侧比编辑侧宽——空段与重复字段名按线上原样放行。
/// 这里消费的是渠道真实推送，解析以转发为目标，不做可逆唯一假设；编辑侧
/// （前端 codec/form.ts `parseFormBody`）贴入素材库的载荷要可逆且字段唯一，
/// 拒绝空段与重复字段。两端不强行对齐。
pub(crate) fn form_pairs(body: &str) -> Vec<(String, String)> {
    body.split('&')
        .filter(|pair| !pair.is_empty())
        .map(|pair| match pair.split_once('=') {
            Some((key, value)) => (percent_decode(key), percent_decode(value)),
            None => (percent_decode(pair), String::new()),
        })
        .collect()
}

/// 去掉明文里携带的指定字段段（其余段原字节保留）：从真实推送拷贝的表单常带
/// 旧签名字段，重签语义要求签名由本连接密钥现算（美团/饿了么「sig 除外」、
/// 支付宝「sign 除外」口径，#46 自 sig 字面值泛化出参数化形态）。
pub(crate) fn strip_form_pair(body: &str, name: &str) -> String {
    body.split('&')
        .filter(|pair| {
            let key = pair.split('=').next().unwrap_or(pair);
            percent_decode(key) != name
        })
        .collect::<Vec<_>>()
        .join("&")
}

/// 去掉明文里携带的 sig 段（其余段原字节保留）：美团/饿了么表单线的旧 sig
/// 剔除（官方「sig 除外」口径）。
pub(crate) fn strip_sig(body: &str) -> String {
    strip_form_pair(body, "sig")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sha1_hex_matches_known_vector() {
        // 独立来源：FIPS 180-1 测试向量 sha1("abc")
        assert_eq!(
            sha1_hex(&["abc"]),
            "a9993e364706816aba3e25717850c26c9cd0d89d"
        );
        // 多段按序拼接等价于单段拼接
        assert_eq!(sha1_hex(&["a", "bc"]), sha1_hex(&["abc"]));
    }

    #[test]
    fn sha1_sorted_hex_sorts_before_hashing() {
        // 排序后拼接 = 有序多段直接拼接
        assert_eq!(
            sha1_sorted_hex(&["c", "a", "b"]),
            sha1_hex(&["a", "b", "c"])
        );
        assert_eq!(sha1_sorted_hex(&["bc", "a"]), sha1_hex(&["a", "bc"]));
    }

    #[test]
    fn md5_base64_matches_known_vector() {
        // 独立来源：RFC 1321 测试向量 md5("abc") = 900150983cd24fb0d6963f7d28e17f72
        // 其 16 字节摘要的 base64 形态（Node crypto 交叉复算）
        assert_eq!(md5_base64("abc"), "kAFQmDzST7DWlj99KOF/cg==");
    }

    #[test]
    fn md5_hex_matches_known_vector() {
        // 独立来源：RFC 1321 测试向量 md5("abc")
        assert_eq!(md5_hex(&["abc"]), "900150983cd24fb0d6963f7d28e17f72");
        // 多段按序拼接等价于单段拼接
        assert_eq!(md5_hex(&["a", "bc"]), md5_hex(&["abc"]));
        // 空串向量（RFC 1321）
        assert_eq!(md5_hex(&[""]), "d41d8cd98f00b204e9800998ecf8427e");
    }

    #[test]
    fn sha256_hex_matches_known_vector() {
        // 独立来源：FIPS 180-4 测试向量 sha256("abc")
        assert_eq!(
            sha256_hex(&[b"abc"]),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
        // 多段按序拼接等价于单段拼接
        assert_eq!(sha256_hex(&[b"a", b"bc"]), sha256_hex(&[b"abc"]));
    }

    #[test]
    fn hmac_sha256_matches_rfc_4231_vectors() {
        // 独立来源：RFC 4231 测试向量 TC1/TC2（hex 参考值 + base64 形态）
        let tc2 = hmac_sha256(b"Jefe", b"what do ya want for nothing?");
        assert_eq!(
            hex::encode(tc2),
            "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843"
        );
        assert_eq!(
            BASE64.encode(tc2),
            "W9zBRr9gdU5qBCQmCJV1x1oAPwidJzmDnexYuWTsOEM="
        );
        // TC1：key = 0x0b × 20，data = "Hi There"
        let tc1 = hmac_sha256(&[0x0b; 20], b"Hi There");
        assert_eq!(
            hex::encode(tc1),
            "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7"
        );
    }

    #[test]
    fn hmac_sha256_handles_long_keys() {
        // key 超过 64 字节块长：先散列再填充（RFC 2104；Node crypto 交叉复算）
        let long_key = "k".repeat(100);
        let digest = hmac_sha256_base64(&long_key, "data");
        assert_eq!(digest, "CTgO5LgC2iNjvJbo4NEzuidUWOqN28Vk+Yb8ErMfjLE=");
    }

    #[test]
    fn hmac_sha256_hex_matches_known_vector() {
        // 独立来源：HMAC-SHA256 通行示例向量 key="key"、
        // data="The quick brown fox jumps over the lazy dog"（Node crypto 交叉复算）
        assert_eq!(
            hmac_sha256_hex("key", "The quick brown fox jumps over the lazy dog"),
            "f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8"
        );
        // 多段拼接由调用方完成：同串同钥与 base64 变体摘要一致（编码仅形态不同）
        assert_eq!(
            hmac_sha256_hex("Jefe", "what do ya want for nothing?"),
            hex::encode(hmac_sha256(b"Jefe", b"what do ya want for nothing?"))
        );
    }

    #[test]
    fn utc8_timestamp_matches_official_channel_vectors() {
        // 独立来源：京东 JOS golden（2021-05-07 09:20:39）与 B站包络 golden
        // （2021-01-01 12:01:01）、epoch 与闰日、跨日瞬间的官方同形向量
        assert_eq!(utc8_timestamp(0), "1970-01-01 08:00:00");
        assert_eq!(utc8_timestamp(1_620_350_439), "2021-05-07 09:20:39");
        assert_eq!(utc8_timestamp(1_609_473_661), "2021-01-01 12:01:01");
        assert_eq!(utc8_timestamp(1_709_179_200), "2024-02-29 12:00:00");
        assert_eq!(utc8_timestamp(1_609_516_799), "2021-01-01 23:59:59");
        assert_eq!(utc8_timestamp(1_609_516_800), "2021-01-02 00:00:00");
    }

    #[test]
    fn percent_decode_restores_utf8_bytes_and_plus_as_space() {
        // 大写 hex %XX 还原 UTF-8 字节（与前端 form.ts 同一语义）
        assert_eq!(percent_decode("%E8%8D%AF%E5%93%81"), "药品");
        // form 惯例「+」还原空格；非编码文本原样
        assert_eq!(percent_decode("a+b%2Bc"), "a b+c");
        assert_eq!(percent_decode("668921"), "668921");
    }

    #[test]
    fn form_encode_value_matches_rfc3986_uppercase() {
        // 非保留字集原样，其余大写 %XX
        assert_eq!(
            form_encode_value("a b+c=d.e~f-g_h"),
            "a%20b%2Bc%3Dd.e~f-g_h"
        );
        assert_eq!(form_encode_value("药品"), "%E8%8D%AF%E5%93%81");
        assert_eq!(form_encode_value(""), "");
    }

    #[test]
    fn form_pairs_decodes_document_order_and_keeps_empty_values() {
        // 文档序解码 kv；无值参数落空串；空段（连续 &）跳过
        let pairs = form_pairs("a=1&b=%E8%8D%AF%E5%93%81&c");
        assert_eq!(
            pairs,
            vec![
                ("a".to_string(), "1".to_string()),
                ("b".to_string(), "药品".to_string()),
                ("c".to_string(), String::new()),
            ]
        );
        assert_eq!(form_pairs("a=1&&b=2").len(), 2);
    }

    #[test]
    fn strip_sig_removes_only_sig_pair_verbatim() {
        // 旧 sig 剔除、其余段原字节保留（重签语义：sig 除外）
        assert_eq!(strip_sig("a=1&sig=abcdef&b=2"), "a=1&b=2");
        assert_eq!(strip_sig("sig=abcdef"), "");
        assert_eq!(strip_sig("signature=x&a=1"), "signature=x&a=1");
    }
}
