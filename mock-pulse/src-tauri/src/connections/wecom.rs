//! 企业微信回调加解密与 GET echostr 握手。
//! 依据 docs/research/channels/wecom.md（官方文档 90968/90930 摄取）：
//! - AESKey = Base64_Decode(EncodingAESKey + "=")，32 字节；AES-256-CBC，IV = AESKey 前 16 字节
//! - PKCS#7 以 32 字节块补位（RFC 2315；不是常见 AES 的 16，需自实现填充）
//! - 加密串结构 rand_msg = random(16B) + msg_len(4B 大端) + msg + receiveid(corpid)
//! - 签名 = sha1(token/timestamp/nonce/msg_encrypt 四值字典序排序拼接) 40 位小写 hex
//! - echostr 握手：GET 目标 URL，期望 1 秒内响应解密出的明文（无引号/无 BOM/无换行）

use aes::cipher::{block_padding::NoPadding, BlockDecryptMut, BlockEncryptMut, KeyIvInit};
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::engine::{DecodePaddingMode, GeneralPurpose, GeneralPurposeConfig};
use base64::Engine;
use sha1::{Digest, Sha1};
use std::time::Duration;

use super::{ConnectionConfig, HandshakeOutcome};

/// 企微 Base64 解码引擎：43 位 EncodingAESKey + "=" 的末字符带悬空位，
/// 官方算法按宽松解码处理（canonical 严格模式会拒），故解码走此引擎。
const BASE64_LENIENT: GeneralPurpose = GeneralPurpose::new(
    &base64::alphabet::STANDARD,
    GeneralPurposeConfig::new()
        .with_decode_padding_mode(DecodePaddingMode::Indifferent)
        .with_decode_allow_trailing_bits(true),
);

/// AES-256-CBC 编码器（底层块运算；补位按企微 PKCS#7-32 自实现，故用 NoPadding）。
type Aes256CbcEnc = cbc::Encryptor<aes::Aes256>;

// 解密路径：生产链路当前仅加密（本工具模拟企微推送方）；解密是官方算法的
// 成对实现——黄金例验收载体，也是后续解析加密被动回复的现成入口。
#[allow(dead_code)]
type Aes256CbcDec = cbc::Decryptor<aes::Aes256>;

/// 企微补位块大小：RFC 2315 语义下的 32 字节（不是常见 AES 的 16）。
const PAD_BLOCK: usize = 32;

/// 官方签名算法：token/timestamp/nonce/msg_encrypt 四个值按字典序排序拼接后
/// sha1，结果编码为 40 位小写 hex。
pub fn build_signature(token: &str, timestamp: &str, nonce: &str, msg_encrypt: &str) -> String {
    let mut values = [token, timestamp, nonce, msg_encrypt];
    values.sort_unstable();
    let joined = values.concat();
    let mut hasher = Sha1::new();
    hasher.update(joined.as_bytes());
    hex::encode(hasher.finalize())
}

/// 从 43 位 EncodingAESKey 派生 32 字节 AESKey：Base64_Decode(key + "=")。
pub fn derive_aes_key(encoding_aes_key: &str) -> Result<[u8; 32], String> {
    let decoded = BASE64_LENIENT
        .decode(format!("{encoding_aes_key}="))
        .map_err(|err| format!("EncodingAESKey 无法解码为 AESKey：{err}"))?;
    decoded.try_into().map_err(|decoded: Vec<u8>| {
        format!(
            "AESKey 应为 32 字节，实际 {} 字节（EncodingAESKey 需为 43 位）",
            decoded.len()
        )
    })
}

/// 企微 PKCS#7 去补位：以 32 字节块为单位（补位值 1..=32，整段同值）。
#[allow(dead_code)]
fn pkcs7_unpad_32(data: &[u8]) -> Result<&[u8], String> {
    let Some((&last, _)) = data.split_last() else {
        return Err("解密结果为空，无法去补位".into());
    };
    let pad_len = last as usize;
    let valid = (1..=PAD_BLOCK).contains(&pad_len)
        && pad_len <= data.len()
        && data[data.len() - pad_len..].iter().all(|&b| b == last);
    if !valid {
        return Err(format!("PKCS#7 补位非法（末字节 0x{last:02x}）"));
    }
    Ok(&data[..data.len() - pad_len])
}

/// 企微 AES-256-CBC 解密：IV = key 前 16 字节，密文须为 16 字节块整数倍，
/// 解出后按 32 字节块 PKCS#7 去补位。
#[allow(dead_code)]
pub fn aes_decrypt(key: &[u8; 32], data: &[u8]) -> Result<Vec<u8>, String> {
    let decryptor = Aes256CbcDec::new_from_slices(key, &key[..16])
        .map_err(|err| format!("AES 解密器初始化失败：{err}"))?;
    let mut buf = data.to_vec();
    let raw = decryptor
        .decrypt_padded_mut::<NoPadding>(&mut buf)
        .map_err(|_| format!("密文长度 {} 不是 16 字节块的整数倍", data.len()))?;
    pkcs7_unpad_32(raw).map_err(|err| format!("AES 解密失败：{err}")).map(|slice| slice.to_vec())
}

/// 解密结果：明文字节 + 尾部 receiveid（企业应用回调即 corpid）。
#[allow(dead_code)]
#[derive(Clone, Debug, PartialEq)]
pub struct DecryptedMsg {
    pub msg: Vec<u8>,
    pub receiveid: String,
}

/// 解密 msg_encrypt：Base64 → AES 解密 → 去 16 随机字节 → 读 4 字节大端
/// msg_len → 截 msg → 余下为 receiveid。
#[allow(dead_code)]
pub fn decrypt_msg(encoding_aes_key: &str, msg_encrypt: &str) -> Result<DecryptedMsg, String> {
    let key = derive_aes_key(encoding_aes_key)?;
    let raw = BASE64
        .decode(msg_encrypt)
        .map_err(|err| format!("密文 Base64 解码失败：{err}"))?;
    let unpadded = aes_decrypt(&key, &raw)?;
    if unpadded.len() < 16 + 4 {
        return Err("解密结果过短，缺少 random(16B) + msg_len(4B) 结构".into());
    }
    let msg_len = u32::from_be_bytes([unpadded[16], unpadded[17], unpadded[18], unpadded[19]])
        as usize;
    if 16 + 4 + msg_len > unpadded.len() {
        return Err(format!(
            "msg_len（{msg_len}）超出解密结果长度（{}）",
            unpadded.len()
        ));
    }
    let msg = unpadded[20..20 + msg_len].to_vec();
    let receiveid = String::from_utf8_lossy(&unpadded[20 + msg_len..]).to_string();
    Ok(DecryptedMsg { msg, receiveid })
}

/// receiveid 校验（官方 -40005：ReceiveId 校验错误）。
#[allow(dead_code)]
pub fn verify_receiveid(decrypted: &DecryptedMsg, expect: &str) -> Result<(), String> {
    if decrypted.receiveid == expect {
        Ok(())
    } else {
        Err(format!(
            "ReceiveId 校验错误：期望 {expect}，实际 {}",
            decrypted.receiveid
        ))
    }
}

/// 企微 PKCS#7 补位：以 32 字节块为单位，补位值 1..=32，整段同值。
fn pkcs7_pad_32(data: &[u8]) -> Vec<u8> {
    let pad_len = PAD_BLOCK - (data.len() % PAD_BLOCK);
    let mut padded = data.to_vec();
    padded.resize(data.len() + pad_len, pad_len as u8);
    padded
}

/// 企微 AES-256-CBC 加密：先按 32 字节块 PKCS#7 补位，IV 取 key 前 16 字节。
pub fn aes_encrypt(key: &[u8; 32], data: &[u8]) -> Result<Vec<u8>, String> {
    let encryptor = Aes256CbcEnc::new_from_slices(key, &key[..16])
        .map_err(|err| format!("AES 加密器初始化失败：{err}"))?;
    let mut buf = pkcs7_pad_32(data);
    let msg_len = buf.len();
    let encrypted = encryptor
        .encrypt_padded_mut::<NoPadding>(&mut buf, msg_len)
        .map_err(|_| "明文补位后不是 16 字节块的整数倍".to_string())?;
    Ok(encrypted.to_vec())
}

/// 拼接明文结构 rand_msg = random(16B) + msg_len(4B 网络字节序大端) + msg + receiveid。
pub fn build_rand_msg(random16: &[u8; 16], msg: &[u8], receiveid: &str) -> Vec<u8> {
    let mut rand_msg = Vec::with_capacity(16 + 4 + msg.len() + receiveid.len());
    rand_msg.extend_from_slice(random16);
    rand_msg.extend_from_slice(&(msg.len() as u32).to_be_bytes());
    rand_msg.extend_from_slice(msg);
    rand_msg.extend_from_slice(receiveid.as_bytes());
    rand_msg
}

/// 加密 msg：拼 rand_msg → AES 加密 → Base64（即 msg_encrypt / echostr 密文）。
pub fn encrypt_msg(
    encoding_aes_key: &str,
    random16: &[u8; 16],
    msg: &[u8],
    receiveid: &str,
) -> Result<String, String> {
    let key = derive_aes_key(encoding_aes_key)?;
    let rand_msg = build_rand_msg(random16, msg, receiveid);
    let encrypted = aes_encrypt(&key, &rand_msg)?;
    Ok(BASE64.encode(encrypted))
}

/// 16 字节随机数：复用 uuid v4（已在依赖内），一个 v4 即 16 随机字节。
fn random_16() -> [u8; 16] {
    *uuid::Uuid::new_v4().as_bytes()
}

/// echostr 握手的随机明文：32 位 hex（可打印、无引号换行，官方仅要求原样回显）。
fn random_plaintext() -> String {
    uuid::Uuid::new_v4().simple().to_string()
}

fn unix_timestamp_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|elapsed| elapsed.as_secs())
        .unwrap_or(0)
}

/// 按官方 GET echostr 协议测试连接：
/// 生成随机明文 → 加密成 echostr → 四值字典序签名 → GET 目标 URL →
/// 期望 HTTP 200 且响应体与明文逐字节一致（无引号/无 BOM/无换行即逐字节相等）。
pub fn verify_handshake(
    client: &reqwest::blocking::Client,
    config: &ConnectionConfig,
) -> HandshakeOutcome {
    let ConnectionConfig::Wecom {
        url,
        corp_id,
        token,
        encoding_aes_key,
        ..
    } = config
    else {
        return HandshakeOutcome {
            ok: false,
            message: "配置不是企业微信渠道，无法执行 echostr 握手".into(),
        };
    };

    let plaintext = random_plaintext();
    let echostr = match encrypt_msg(encoding_aes_key, &random_16(), plaintext.as_bytes(), corp_id)
    {
        Ok(value) => value,
        Err(reason) => {
            return HandshakeOutcome {
                ok: false,
                message: reason,
            }
        }
    };
    let timestamp = unix_timestamp_secs().to_string();
    let nonce = uuid::Uuid::new_v4().simple().to_string();
    let signature = build_signature(token, &timestamp, &nonce, &echostr);

    let response = client
        .get(url)
        .query(&[
            ("msg_signature", signature.as_str()),
            ("timestamp", timestamp.as_str()),
            ("nonce", nonce.as_str()),
            ("echostr", echostr.as_str()),
        ])
        .send();

    let response = match response {
        Ok(response) => response,
        Err(err) => {
            let reason = if err.is_timeout() {
                "等待响应超时（官方要求 1 秒内应答）"
            } else if err.is_connect() {
                "无法连接到目标地址"
            } else {
                "请求发送失败"
            };
            return HandshakeOutcome {
                ok: false,
                message: format!("{reason}：{err}"),
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
    if body.as_ref() == plaintext.as_bytes() {
        HandshakeOutcome {
            ok: true,
            message: "echostr 握手成功：随机明文经 AES 加密签名 GET，解密明文原样回显（HTTP 200）".into(),
        }
    } else {
        let echoed = String::from_utf8_lossy(&body).to_string();
        HandshakeOutcome {
            ok: false,
            message: format!("HTTP 200 但回显与解密明文不一致：{echoed:?}"),
        }
    }
}

/// 生产用默认客户端：官方要求 echostr 1 秒内响应，本地留 1s 上限。
pub fn handshake_client() -> reqwest::blocking::Client {
    reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(1))
        .build()
        .expect("构造 reqwest 客户端失败")
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 官方 90968 文档可复算黄金例（研究文档 §5.1 逐字拷贝）。
    const GOLDEN_CORP_ID: &str = "wx5823bf96d3bd56c7";
    const GOLDEN_TOKEN: &str = "QDG6eK";
    const GOLDEN_ENCODING_AES_KEY: &str = "jWmYm7qr5nMoAUwZRjGtBxmz3KA1tkAj3ykkR6q2B2C";
    const GOLDEN_ENCRYPT: &str = "RypEvHKD8QQKFhvQ6QleEB4J58tiPdvo+rtK1I9qca6aM/wvqnLSV5zEPeusUiX5L5X/0lWfrf0QADHHhGd3QczcdCUpj911L3vg3W/sYYvuJTs3TUUkSUXxaccAS0qhxchrRYt66wiSpGLYL42aM6A8dTT+6k4aSknmPj48kzJs8qLjvd4Xgpue06DOdnLxAUHzM6+kDZ+HMZfJYuR+LtwGc2hgf5gsijff0ekUNXZiqATP7PF5mZxZ3Izoun1s4zG4LUMnvw2r+KqCKIw+3IQH03v+BCA9nMELNqbSf6tiWSrXJB3LAVGUcallcrw8V2t9EL4EhzJWrQUax5wLVMNS0+rUPA3k22Ncx4XXZS9o0MBH27Bo6BpNelZpS+/uh9KsNlY6bHCmJU9p8g7m3fVKn28H3KDYA5Pl/T8Z1ptDAVe0lXdQ2YoyyH2uyPIGHBZZIs2pDBS8R07+qN+E7Q==";
    const GOLDEN_TIMESTAMP: &str = "1409659813";
    const GOLDEN_NONCE: &str = "1372623149";
    const GOLDEN_SIGNATURE: &str = "477715d11cdb4164915debcba66cb864d751f3e6";

    /// 黄金例密文解密出的明文（284 字节）。研究文档 §5.1 的代码块渲染带缩进，
    /// 真实字节无缩进、行间 \n 分隔、无结尾换行——以密文可复算的字节为准。
    const GOLDEN_PLAINTEXT: &str = concat!(
        "<xml><ToUserName><![CDATA[wx5823bf96d3bd56c7]]></ToUserName>\n",
        "<FromUserName><![CDATA[mycreate]]></FromUserName>\n",
        "<CreateTime>1409659813</CreateTime>\n",
        "<MsgType><![CDATA[text]]></MsgType>\n",
        "<Content><![CDATA[hello]]></Content>\n",
        "<MsgId>4561255354251345929</MsgId>\n",
        "<AgentID>218</AgentID>\n",
        "</xml>",
    );

    #[test]
    fn golden_ciphertext_decrypts_to_official_plaintext() {
        let decrypted = decrypt_msg(GOLDEN_ENCODING_AES_KEY, GOLDEN_ENCRYPT).unwrap();

        assert_eq!(decrypted.msg, GOLDEN_PLAINTEXT.as_bytes());
        assert_eq!(decrypted.receiveid, GOLDEN_CORP_ID);
    }

    #[test]
    fn golden_plaintext_reencrypts_to_official_ciphertext() {
        // 解密路径已独立验证；取官方密文的 random(16B)，用同随机数重新加密，
        // 必须逐字节复现官方密文（覆盖补位、CBC 链、Base64 全链路）。
        let key = derive_aes_key(GOLDEN_ENCODING_AES_KEY).unwrap();
        let ciphertext = BASE64.decode(GOLDEN_ENCRYPT).unwrap();
        let rand_msg = aes_decrypt(&key, &ciphertext).unwrap();
        let mut random16 = [0u8; 16];
        random16.copy_from_slice(&rand_msg[..16]);

        let encrypt = encrypt_msg(
            GOLDEN_ENCODING_AES_KEY,
            &random16,
            GOLDEN_PLAINTEXT.as_bytes(),
            GOLDEN_CORP_ID,
        )
        .unwrap();

        assert_eq!(encrypt, GOLDEN_ENCRYPT);
    }

    #[test]
    fn encrypt_decrypt_roundtrips_across_pkcs7_32_boundaries() {
        // rand_msg = 16 + 4 + msg：取跨 32 字节块边界两侧的明文长度（含 0），
        // receiveid 用空串（智能机器人场景）与 corpid 各验一遍。
        for msg_len in [0, 1, 11, 12, 13, 27, 28, 43, 44, 45, 64, 100] {
            let msg: Vec<u8> = (0..msg_len).map(|i| (i % 251) as u8).collect();
            for receiveid in ["", "ww_roundtrip_corp"] {
                let random16 = [7u8; 16];
                let encrypt = encrypt_msg(
                    GOLDEN_ENCODING_AES_KEY,
                    &random16,
                    &msg,
                    receiveid,
                )
                .unwrap();
                let decrypted = decrypt_msg(GOLDEN_ENCODING_AES_KEY, &encrypt).unwrap();

                assert_eq!(decrypted.msg, msg, "msg_len={msg_len} rid={receiveid}");
                assert_eq!(decrypted.receiveid, receiveid, "msg_len={msg_len}");
            }
        }
    }

    #[test]
    fn ciphertext_length_reflects_pkcs7_32_padding() {
        // 总长（16+4+msg）补到 32 的倍数：恰好对齐时仍补整块 32 字节（PKCS#7 规则）。
        let random16 = [0u8; 16];
        let cases = [
            (0usize, 32usize),
            (12usize, 64usize),
            (13usize, 64usize),
            (43usize, 64usize),
            (44usize, 96usize),
        ];
        for (msg_len, expect_ct_len) in cases {
            let msg = vec![b'x'; msg_len];
            let encrypt = encrypt_msg(GOLDEN_ENCODING_AES_KEY, &random16, &msg, "").unwrap();
            let ciphertext = BASE64.decode(encrypt).unwrap();

            assert_eq!(ciphertext.len(), expect_ct_len, "msg_len={msg_len}");
        }
    }

    #[test]
    fn decrypt_rejects_receiveid_mismatch() {
        let decrypted = decrypt_msg(GOLDEN_ENCODING_AES_KEY, GOLDEN_ENCRYPT).unwrap();

        assert!(verify_receiveid(&decrypted, "ww_other_corp").is_err());
        assert!(verify_receiveid(&decrypted, GOLDEN_CORP_ID).is_ok());
    }

    #[test]
    fn derive_aes_key_rejects_wrong_shape_keys() {
        // 长度非 43 位（官方：长度固定 43 位）
        assert!(derive_aes_key(&GOLDEN_ENCODING_AES_KEY[..42]).is_err());
        assert!(derive_aes_key(&format!("{GOLDEN_ENCODING_AES_KEY}X")).is_err());
        // 43 位但含 Base64 字母表外字符
        let mut bad = GOLDEN_ENCODING_AES_KEY.to_string();
        bad.replace_range(0..1, "*");
        assert!(derive_aes_key(&bad).is_err());
    }

    #[test]
    fn decrypt_rejects_malformed_ciphertext() {
        // 非 Base64
        assert!(decrypt_msg(GOLDEN_ENCODING_AES_KEY, "not-base64!!!").is_err());
        // 合法 Base64 但长度非 16 字节块整数倍
        assert!(decrypt_msg(GOLDEN_ENCODING_AES_KEY, &BASE64.encode([0u8; 20])).is_err());
        // 结构损坏：msg_len 声称超出实际长度
        let key = derive_aes_key(GOLDEN_ENCODING_AES_KEY).unwrap();
        let mut rand_msg = vec![0u8; 16];
        rand_msg.extend_from_slice(&u32::MAX.to_be_bytes());
        let ct = BASE64.encode(aes_encrypt(&key, &rand_msg).unwrap());
        assert!(decrypt_msg(GOLDEN_ENCODING_AES_KEY, &ct).is_err());
    }

    // ---- echostr 握手全链路：本地 TcpListener 演示成功/失败路径 ----

    use std::collections::HashMap;
    use std::io::{Read, Write};
    use std::net::{Shutdown, SocketAddr, TcpListener, TcpStream};
    use std::sync::mpsc::{channel, Receiver};
    use std::time::Duration;

    fn read_request_head(stream: &mut TcpStream) -> String {
        let mut buf = Vec::new();
        let mut chunk = [0u8; 4096];
        loop {
            let n = stream.read(&mut chunk).unwrap();
            assert!(n > 0, "客户端提前断开");
            buf.extend_from_slice(&chunk[..n]);
            if let Some(split) = buf.windows(4).position(|w| w == b"\r\n\r\n") {
                return String::from_utf8_lossy(&buf[..split]).to_string();
            }
        }
    }

    /// 表单风格 urldecode（官方握手第①步「参数值 urldecode」）。
    fn urldecode(value: &str) -> String {
        let bytes = value.as_bytes();
        let mut out = Vec::with_capacity(bytes.len());
        let mut i = 0;
        while i < bytes.len() {
            match bytes[i] {
                b'+' => out.push(b' '),
                b'%' if i + 2 < bytes.len() => {
                    let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).unwrap_or("");
                    if let Ok(byte) = u8::from_str_radix(hex, 16) {
                        out.push(byte);
                        i += 3;
                        continue;
                    }
                    out.push(b'%');
                }
                byte => out.push(byte),
            }
            i += 1;
        }
        String::from_utf8_lossy(&out).to_string()
    }

    fn query_of(request_line: &str) -> HashMap<String, String> {
        let url = request_line.split_whitespace().nth(1).unwrap_or_default();
        let query = url.split_once('?').map(|(_, q)| q).unwrap_or_default();
        query
            .split('&')
            .filter(|kv| !kv.is_empty())
            .map(|kv| {
                let (key, value) = kv.split_once('=').unwrap_or((kv, ""));
                (urldecode(key), urldecode(value))
            })
            .collect()
    }

    /// 起一个只处理一次 GET 的本地监听；responder 决定状态行与响应体。
    fn start_get_server(
        responder: fn(&str, &HashMap<String, String>) -> (String, String),
        delay: Duration,
    ) -> (SocketAddr, Receiver<(String, HashMap<String, String>)>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        let (tx, rx) = channel();
        std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let head = read_request_head(&mut stream);
            let request_line = head.lines().next().unwrap_or_default().to_string();
            let query = query_of(&request_line);
            tx.send((request_line.clone(), query.clone())).unwrap();
            std::thread::sleep(delay);
            let (status_line, body) = responder(&request_line, &query);
            let response = format!(
                "{status_line}\r\nContent-Type: text/plain\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                body.len()
            );
            stream.write_all(response.as_bytes()).unwrap();
            stream.shutdown(Shutdown::Both).unwrap();
        });
        (addr, rx)
    }

    /// 忠实实现官方四步：① urldecode（query_of 已做）② 重算签名比对
    /// ③ 解密 echostr 取 msg ④ 回显明文（无引号/无换行）。
    fn wecom_echo_ok(
        _request_line: &str,
        query: &HashMap<String, String>,
    ) -> (String, String) {
        let echostr = &query["echostr"];
        let expect_sig = build_signature(GOLDEN_TOKEN, &query["timestamp"], &query["nonce"], echostr);
        assert_eq!(expect_sig, query["msg_signature"], "签名应可复算");
        let decrypted = decrypt_msg(GOLDEN_ENCODING_AES_KEY, echostr).unwrap();
        assert_eq!(decrypted.receiveid, GOLDEN_CORP_ID, "receiveid 应为 corpid");
        (
            "HTTP/1.1 200 OK".into(),
            String::from_utf8(decrypted.msg).unwrap(),
        )
    }

    fn quick_client(timeout: Duration) -> reqwest::blocking::Client {
        reqwest::blocking::Client::builder()
            .timeout(timeout)
            .build()
            .unwrap()
    }

    fn wecom_config(url: String) -> ConnectionConfig {
        ConnectionConfig::Wecom {
            url,
            corp_id: GOLDEN_CORP_ID.into(),
            token: GOLDEN_TOKEN.into(),
            encoding_aes_key: GOLDEN_ENCODING_AES_KEY.into(),
            agent_id: "218".into(),
        }
    }

    #[test]
    fn handshake_succeeds_when_plaintext_echoed() {
        let (addr, rx) = start_get_server(wecom_echo_ok, Duration::ZERO);
        let config = wecom_config(format!("http://{addr}/webhooks/wecom"));
        let outcome = verify_handshake(&quick_client(Duration::from_secs(2)), &config);

        assert!(outcome.ok, "应成功：{outcome:?}");
        assert!(outcome.message.contains("回显"), "{outcome:?}");

        // 请求侧逐项核对官方协议要素
        let (request_line, query) = rx.recv_timeout(Duration::from_secs(2)).unwrap();
        assert!(request_line.starts_with("GET /webhooks/wecom"), "{request_line}");
        for key in ["msg_signature", "timestamp", "nonce", "echostr"] {
            assert!(query.contains_key(key), "缺少 {key} 参数：{query:?}");
        }
        // echostr 可解出非空随机明文，receiveid 为 corpid
        let decrypted = decrypt_msg(GOLDEN_ENCODING_AES_KEY, &query["echostr"]).unwrap();
        assert!(!decrypted.msg.is_empty());
        assert_eq!(decrypted.receiveid, GOLDEN_CORP_ID);
        // 签名 = sha1(四值字典序拼接)，与请求里的 msg_signature 一致
        assert_eq!(
            query["msg_signature"],
            build_signature(
                GOLDEN_TOKEN,
                &query["timestamp"],
                &query["nonce"],
                &query["echostr"]
            )
        );
    }

    #[test]
    fn handshake_fails_when_echo_wrapped_in_quotes() {
        // 官方明确「不能加引号」——回显带引号即逐字节不一致
        let quoted: fn(&str, &HashMap<String, String>) -> (String, String) =
            |_request_line, query| {
                let decrypted =
                    decrypt_msg(GOLDEN_ENCODING_AES_KEY, &query["echostr"]).unwrap();
                (
                    "HTTP/1.1 200 OK".into(),
                    format!("\"{}\"", String::from_utf8(decrypted.msg).unwrap()),
                )
            };
        let (addr, _rx) = start_get_server(quoted, Duration::ZERO);
        let config = wecom_config(format!("http://{addr}/hook"));
        let outcome = verify_handshake(&quick_client(Duration::from_secs(2)), &config);

        assert!(!outcome.ok);
        assert!(outcome.message.contains("不一致"), "{outcome:?}");
    }

    #[test]
    fn handshake_fails_on_non_200() {
        let responder: fn(&str, &HashMap<String, String>) -> (String, String) =
            |_, _| ("HTTP/1.1 500 Internal Server Error".into(), "boom".into());
        let (addr, _rx) = start_get_server(responder, Duration::ZERO);
        let config = wecom_config(format!("http://{addr}/hook"));
        let outcome = verify_handshake(&quick_client(Duration::from_secs(2)), &config);

        assert!(!outcome.ok);
        assert!(outcome.message.contains("500"), "{outcome:?}");
    }

    #[test]
    fn handshake_fails_on_timeout() {
        // 官方要求 1 秒内响应；客户端 200ms 超时 vs 服务器 1s 延迟
        let (addr, _rx) = start_get_server(wecom_echo_ok, Duration::from_secs(1));
        let config = wecom_config(format!("http://{addr}/hook"));
        let outcome = verify_handshake(&quick_client(Duration::from_millis(200)), &config);

        assert!(!outcome.ok);
        assert!(outcome.message.contains("超时"), "{outcome:?}");
    }

    #[test]
    fn golden_signature_recomputes_official_value() {
        // 官方示例：sort_str = "13726231491409659813QDG6eK" + 密文全串 → sha1 小写 hex
        let signature = build_signature(
            GOLDEN_TOKEN,
            GOLDEN_TIMESTAMP,
            GOLDEN_NONCE,
            GOLDEN_ENCRYPT,
        );
        assert_eq!(signature, GOLDEN_SIGNATURE);
    }
}
