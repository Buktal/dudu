package com.dudu.duduserver.channel.wechatmini;

import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 小程序回调加解密验收：官方数值例逐字节复算（docs/research/channels/wechat-mini.md
 * §4.3、§5.2、§5.6），覆盖 AESKey 推导、IV=AESKey 前 16 字节、PKCS#7(32) 补位与
 * 尾部 AppID 提取；解密失败如实报错不伪装成功。
 */
class WechatMiniCryptoTest {

    // 官方服务器配置示例值（事实库 §3.2/§5.2）：EncodingAESKey 43 个 A、AppID
    private static final String ENCODING_AES_KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    private static final String APP_ID = "wxba5fad812f8e6fb9";

    // 官方安全模式推送密文（§5.2 全串）：解出 167 字节 debug_demo JSON、尾部 AppID 相符
    private static final String GOLDEN_PUSH_ENCRYPT = "+qdx1OKCy+5JPCBFWw70tm0fJGb2Jmeia4FCB7kao+/Q5c/ohsOzQHi8khUOb05JCpj0JB4RvQMkUyus8TPxLKJGQqcvZqzDpVza"
        + "zhZv6JsXUnnR8XGT740XgXZUXQ7vJVnAG+tE8NUd4yFyjPy7GgiaviNrlCTj+l5kdfMuFUPpRSrfMZuMcp3Fn2Pede2IuQrKEYwK"
        + "SqFIZoNqJ4M8EajAsjLY2km32IIjdf8YL/P50F7mStwntrA2cPDrM1kb6mOcfBgRtWygb3VIYnSeOBrebufAlr7F9mFUPAJGj04=";
    private static final String GOLDEN_PUSH_PLAINTEXT = "{\"ToUserName\":\"gh_97417a04a28d\","
        + "\"FromUserName\":\"o9AgO5Kd5ggOC-bXrbNODIiE3bGY\",\"CreateTime\":1714112445,"
        + "\"MsgType\":\"event\",\"Event\":\"debug_demo\",\"debug_str\":\"hello world\"}";

    // 官方加密回复算例（§5.6）：random/msg/appid 重加密应得官方密文逐字节一致
    private static final byte[] GOLDEN_REPLY_RANDOM = "707722b803182950".getBytes(StandardCharsets.US_ASCII);
    private static final String GOLDEN_REPLY_PLAINTEXT = "{\"demo_resp\":\"good luck\"}";
    private static final String GOLDEN_REPLY_ENCRYPT =
        "ELGduP2YcVatjqIS+eZbp80MNLoAUWvzzyJxgGzxZO/5sAvd070Bs6qrLARC9nVHm48Y4hyRbtzve1L32tmxSQ==";

    private final WechatMiniCrypto crypto = new WechatMiniCrypto();

    @Test
    void decryptsOfficialPushCiphertextToDemoJsonWithMatchingTailAppId() {
        WechatMiniCrypto.PlainMessage plain = crypto.decrypt(ENCODING_AES_KEY, GOLDEN_PUSH_ENCRYPT);

        assertThat(plain.message()).isEqualTo(GOLDEN_PUSH_PLAINTEXT);
        assertThat(plain.message().getBytes(StandardCharsets.UTF_8)).hasSize(167);
        assertThat(plain.appId()).isEqualTo(APP_ID);
    }

    @Test
    void reencryptsOfficialReplyExampleToTheOfficialCiphertextByteForByte() {
        assertThat(crypto.encrypt(ENCODING_AES_KEY, GOLDEN_REPLY_RANDOM, GOLDEN_REPLY_PLAINTEXT, APP_ID))
            .isEqualTo(GOLDEN_REPLY_ENCRYPT);
    }

    @Test
    void roundTripsArbitraryPayloadAndRejectsAlteredCiphertextOrKey() {
        String payload = "<xml><MsgType><![CDATA[text]]></MsgType></xml>";
        String encrypted = crypto.encrypt(ENCODING_AES_KEY, GOLDEN_REPLY_RANDOM, payload, APP_ID);
        assertThat(crypto.decrypt(ENCODING_AES_KEY, encrypted).message()).isEqualTo(payload);

        // 密文被篡改与密钥不符都按解密失败处理，不给调用方一个看似合法的明文
        String flipped = encrypted.substring(0, encrypted.length() - 2) + "xy";
        assertThatThrownBy(() -> crypto.decrypt(ENCODING_AES_KEY, flipped))
            .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> crypto.decrypt("BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB", GOLDEN_PUSH_ENCRYPT))
            .isInstanceOf(IllegalArgumentException.class);
    }
}
