package com.dudu.duduserver.channel.xiaohongshu;

import com.dudu.duduserver.channel.support.AesEnvelopeCodec;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;

/**
 * 小红书回调报文 AES 加解密（官方 MsgDecrypt 包实锤，事实见
 * docs/research/channels/xiaohongshu.md §11.3）：信封骨架（43 位 EncodingAESKey 解码、
 * AES-256-CBC、IV 取 AESKey 前 16 字节、32 字节块 PKCS#7、random+msg_len+msg+尾部
 * 结构）收敛到 {@link AesEnvelopeCodec} 统一口径；本类保留渠道语义——尾部 appId
 * （§11.4 receiveid=appId）不在此校验，原样交调用方验证与本账号一致。解密失败、密文
 * 结构不符与密钥非法都抛出 {@link IllegalArgumentException}，由调用方按参数错误应答，
 * 不伪装成功。
 */
@Component
public class XiaohongshuCrypto {

    // 解密结果：message 为回调解密后的报文 JSON，appId 为明文尾部的来源小程序 AppID
    public record PlainMessage(String message, String appId) {
    }

    public PlainMessage decrypt(String encodingAesKey, String ciphertext) {
        AesEnvelopeCodec.Plain plain = AesEnvelopeCodec.decrypt(
            AesEnvelopeCodec.decodeKey(encodingAesKey), ciphertext, null);
        return new PlainMessage(plain.message(), plain.receiveId());
    }

    // random 16 字节 + msg + appId 拼装后补位加密，输出 Base64（对拍 mock-pulse build_crypto_push）
    public String encrypt(String encodingAesKey, byte[] random, String message, String appId) {
        return AesEnvelopeCodec.encrypt(AesEnvelopeCodec.decodeKey(encodingAesKey), random,
            message.getBytes(StandardCharsets.UTF_8), appId.getBytes(StandardCharsets.UTF_8));
    }
}
