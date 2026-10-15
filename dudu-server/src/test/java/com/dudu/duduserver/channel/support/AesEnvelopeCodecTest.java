package com.dudu.duduserver.channel.support;

import org.junit.jupiter.api.Test;

import javax.crypto.Cipher;
import javax.crypto.spec.IvParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.util.Arrays;
import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 信封骨架的 msg_len 字段边界验收：该字段是密文解出的外部输入，越界值必须在拆包前
 * 按参数错误拒绝；越界检查用减法口径，加法在 msg_len 接近 int 上限时回绕为负绕过
 * 检查、让越界值带着负偏移逃进字符串截取。负值拒绝与正常回填由各渠道官方向量覆盖。
 */
class AesEnvelopeCodecTest {

    // 官方向量 A 的密钥（钉钉事实库 §4.1）：43 位 EncodingAESKey 解出 AES-256
    private static final String ENCODING_AES_KEY = "4g5j64qlyl3zvetqxz5jiocdr586fn2zvjpa8zls3ij";

    @Test
    void rejectsMessageLengthNearIntegerOverflow() throws Exception {
        // msg_len = 0x7FFFFFFF：加法 20 + msg_len 回绕为负（-2147483629 > 28 不成立），
        // 旧口径放行后以负偏移取尾部直接抛 StringIndexOutOfBoundsException 逃出参数错误契约
        SecretKeySpec key = AesEnvelopeCodec.decodeKey(ENCODING_AES_KEY);
        byte[] full = new byte[28];
        full[16] = 0x7F;
        full[17] = (byte) 0xFF;
        full[18] = (byte) 0xFF;
        full[19] = 0x7F;
        // 28 字节补 4 字节到 32 字节块，信封结构对 unpad 成立
        byte[] padded = Arrays.copyOf(full, 32);
        Arrays.fill(padded, 28, 32, (byte) 4);

        assertThatThrownBy(() -> AesEnvelopeCodec.decrypt(key, seal(key, padded), null))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("msg_len");
    }

    // 手工按共享件同口径加密：encrypt 会按消息体实际长度正确写 msg_len，无法构造越界值
    private static String seal(SecretKeySpec key, byte[] padded) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/CBC/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key, new IvParameterSpec(key.getEncoded(), 0, 16));
        return Base64.getEncoder().encodeToString(cipher.doFinal(padded));
    }
}
