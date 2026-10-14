package com.dudu.duduserver.channel.xiaohongshu;

import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 小红书回调报文加解密验收：算法与微信族同源（官方 MsgDecrypt 包实锤，事实见
 * docs/research/channels/xiaohongshu.md §11.2/§11.3），数值例按同一算法以 Python
 * 独立复算生成（密钥取 mock-pulse 黄金常量），覆盖 AESKey 推导（43 位 + "="）、
 * IV=AESKey 前 16 字节、PKCS#7(32) 补位、明文结构 random+msg_len+msg+appId 尾部
 * 提取；解密失败如实报错不伪装成功。
 */
class XiaohongshuCryptoTest {

    // mock-pulse 黄金常量（tests/mod.rs）：回调用 token 体系下的 EncodingAESKey 与 AppID
    private static final String ENCODING_AES_KEY = "jWmYm7qr5nMoAUwZRjGtBxmz3KA1tkAj3ykkR6q2B2C";
    private static final String APP_ID = "wx5823bf96d3bd56c7";

    // Python 独立复算密文：明文为 mock-pulse GOLDEN_MESSAGE_PLAINTEXT，random 固定 16 字节
    private static final String GOLDEN_ENCRYPT =
        "bS0z/nkx36HboyUEjKbr3IeovXTyF7WXkLs5qQ+KCJeH4f3ulcJ29G6PZhgrIwci3EFFlx0w8xgg1DEHb+B86QFtGYINft6w0F0vYjGFw"
            + "onm9lJOneT6D+WUGA0vrhKzSuD++9lhrJdMhLNOAWDpEhLivLuIQgqerUieof5TsedE5+RIc5sw9Z/i+0pzvArXgyLmPFvzlWP/n53"
            + "ZOTIo5b+r6uRSRxCJCkh6MhpCuD4GRPUiltTLLjg8hoZxdH5A";
    private static final String GOLDEN_PLAINTEXT = "{\"MsgId\":\"MSG_ID\",\"FromOpenId\":\"USER_OPEN_ID\","
        + "\"ToAppId\":\"SELLER_APP_ID\",\"MsgType\":\"text\",\"CreateTime\":1648714429,\"Content\":\"...\"}";
    private static final byte[] GOLDEN_RANDOM = "xhs-golden-rand1".getBytes(StandardCharsets.US_ASCII);

    private final XiaohongshuCrypto crypto = new XiaohongshuCrypto();

    @Test
    void decryptsGoldenCiphertextToPushJsonWithMatchingTailAppId() {
        XiaohongshuCrypto.PlainMessage plain = crypto.decrypt(ENCODING_AES_KEY, GOLDEN_ENCRYPT);

        assertThat(plain.message()).isEqualTo(GOLDEN_PLAINTEXT);
        assertThat(plain.appId()).isEqualTo(APP_ID);
    }

    @Test
    void encryptsFixedRandomPushJsonToTheGoldenCiphertextByteForByte() {
        assertThat(crypto.encrypt(ENCODING_AES_KEY, GOLDEN_RANDOM, GOLDEN_PLAINTEXT, APP_ID))
            .isEqualTo(GOLDEN_ENCRYPT);
    }

    @Test
    void rejectsEncodingAesKeyNotFortyThreeChars() {
        // 官方规格 43 位：42 位补 "=" 仍可解出 32 字节，仍按规格直接拒绝（企微族统一口径）
        assertThatThrownBy(() -> crypto.decrypt("A".repeat(42), GOLDEN_ENCRYPT))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("43 位");
    }

    @Test
    void roundTripsArbitraryPayloadAndRejectsAlteredCiphertextOrBadKey() {
        String payload = "{\"MsgType\":\"text\",\"Content\":\"你好，请问这款有货吗\"}";
        String encrypted = crypto.encrypt(ENCODING_AES_KEY, GOLDEN_RANDOM, payload, APP_ID);
        assertThat(crypto.decrypt(ENCODING_AES_KEY, encrypted).message()).isEqualTo(payload);

        // 密文被篡改与密钥不符都按解密失败处理，不给调用方一个看似合法的明文
        String flipped = encrypted.substring(0, encrypted.length() - 2) + "xy";
        assertThatThrownBy(() -> crypto.decrypt(ENCODING_AES_KEY, flipped))
            .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> crypto.decrypt("kWmYm7qr5nMoAUwZRjGtBxmz3KA1tkAj3ykkR6q2B2D", GOLDEN_ENCRYPT))
            .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> crypto.decrypt("不是base64!!", GOLDEN_ENCRYPT))
            .isInstanceOf(IllegalArgumentException.class);
    }
}
