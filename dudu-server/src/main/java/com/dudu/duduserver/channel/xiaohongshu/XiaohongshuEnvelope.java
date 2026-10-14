package com.dudu.duduserver.channel.xiaohongshu;

/**
 * 小红书加密推送信封（§11.2 字段表）：四个字段都在 POST body 的 JSON 内——签名材料不在
 * query，这是与企微自建应用的差异点；Timestamp 官方为 i32 秒级，报文可能以 JSON 数字到达，
 * 统一转字符串参与验签。
 */
public record XiaohongshuEnvelope(String nonce, String timestamp, String encrypt, String msgSignature) {
}
