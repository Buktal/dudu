package com.dudu.duduserver.channel.feishu;

import cn.hutool.crypto.Mode;
import cn.hutool.crypto.Padding;
import cn.hutool.crypto.digest.DigestUtil;
import cn.hutool.crypto.symmetric.AES;
import com.dudu.duduserver.channel.ChannelCallbackResult;
import com.dudu.duduserver.channel.ChannelReceiveResult;
import com.dudu.duduserver.constant.ChannelEnum;
import com.dudu.duduserver.entity.CompanyChannelDO;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.web.client.RestClient;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Base64;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 飞书适配器回调四态验收：缺凭据按不支持、签名不符按拒绝、url_verification 按
 * challenge 原样回显（明文/加密双格式）、消息事件落统一入站消息、其余事件只应答、
 * 无法解析的明文按参数错误；发送/素材与限制说明按凭据如实回答
 * （事实见 docs/research/channels/feishu.md，mock-pulse 握手/直发剧本同构）。
 */
class FeishuAdapterTest {

    private static final long CHANNEL_ID = 9102L;
    private static final String TOKEN = "rvaYgkND1GOiu5MM0E1rncYC6PLtF7JV";
    private static final String ENCRYPT_KEY = "test key";
    private static final String CHALLENGE = "ajls384kdjxxxx";

    private final HttpHeaders headers = new HttpHeaders();

    private FeishuAdapter adapter;

    @BeforeEach
    void setUp() {
        // 发送与素材实现不参与回调路径：接口地址指向本机保留端口，误请求会以连接失败暴露
        adapter = new FeishuAdapter(new FeishuProtocol(),
            new FeishuTextSender(RestClient.builder(), "http://127.0.0.1:9"),
            new FeishuMediaReader(RestClient.builder(), "http://127.0.0.1:9"));
    }

    @Test
    void channelRegistersFeishu() {
        assertThat(adapter.channel()).isEqualTo(ChannelEnum.FEISHU);
    }

    @Test
    void receiveWithoutRequiredCredentialsAnswersUnsupported() {
        // 回调组必填键 verificationToken 缺失即凭据未配置（发送侧 appSecret 不属回调组），
        // 不模拟成功
        CompanyChannelDO incomplete = new CompanyChannelDO();
        incomplete.setCompanyChannelId(CHANNEL_ID);
        incomplete.setChannel(ChannelEnum.FEISHU);
        incomplete.setChannelInfo(Map.of("appId", "cli_9f5343c580712544"));
        assertThat(adapter.receive(incomplete, Map.of(), headers, "{}").response().status()).isEqualTo(501);

        // 只配回调组（无 appSecret）的账号仍可正常完成回调验签与解析
        CompanyChannelDO callbackOnly = new CompanyChannelDO();
        callbackOnly.setCompanyChannelId(CHANNEL_ID);
        callbackOnly.setChannel(ChannelEnum.FEISHU);
        callbackOnly.setChannelInfo(Map.of("appId", "cli_9f5343c580712544", "verificationToken", TOKEN));
        String handshake = "{\"challenge\":\"" + CHALLENGE + "\",\"token\":\"" + TOKEN
            + "\",\"type\":\"url_verification\"}";
        assertThat(adapter.receive(callbackOnly, Map.of(), headers, handshake).response().status()).isEqualTo(200);
    }

    @Test
    void plaintextHandshakeEchoesChallengeVerbatim() {
        String body = "{\"challenge\":\"" + CHALLENGE + "\",\"token\":\"" + TOKEN + "\",\"type\":\"url_verification\"}";
        ChannelCallbackResult response = adapter.receive(account(null), Map.of(), headers, body).response();

        assertThat(response.status()).isEqualTo(200);
        assertThat(response.body()).isEqualTo("{\"challenge\":\"" + CHALLENGE + "\"}");
    }

    @Test
    void plaintextEventBecomesInboundMessageAndOtherEventsOnlyAcknowledge() {
        String event = "{\"schema\":\"2.0\",\"header\":{\"event_type\":\"im.message.receive_v1\",\"token\":\""
            + TOKEN + "\"},\"event\":{\"sender\":{\"sender_id\":{\"open_id\":\"ou_84aad35d084aa403a838cf73ee18467\"}},"
            + "\"message\":{\"message_id\":\"om_5ce6d572455d361153b7cb51da133945\",\"message_type\":\"text\","
            + "\"content\":\"{\\\"text\\\":\\\"hello\\\"}\"}}}";

        ChannelReceiveResult result = adapter.receive(account(null), Map.of(), headers, event);
        assertThat(result.response()).isEqualTo(ChannelCallbackResult.success());
        assertThat(result.message()).isNotNull();
        assertThat(result.message().externalUserId()).isEqualTo("ou_84aad35d084aa403a838cf73ee18467");
        assertThat(result.message().content()).isEqualTo(Map.of("type", "text", "text", "hello"));

        // 已读事件只应答，没有可落库的访客消息
        ChannelReceiveResult read = adapter.receive(account(null), Map.of(), headers,
            "{\"header\":{\"token\":\"" + TOKEN + "\"},\"event\":{\"reader\":{\"reader_id\":{}}}}");
        assertThat(read.response()).isEqualTo(ChannelCallbackResult.success());
        assertThat(read.message()).isNull();
    }

    @Test
    void encryptedHandshakeVerifiesSignatureHeaderAndEchoesChallenge() {
        String plaintext = "{\"challenge\":\"" + CHALLENGE + "\",\"token\":\"" + TOKEN + "\",\"type\":\"url_verification\"}";
        String body = envelope(ENCRYPT_KEY, plaintext);
        sign(body);

        ChannelCallbackResult response = adapter.receive(account(ENCRYPT_KEY), Map.of(), headers, body).response();
        assertThat(response.status()).isEqualTo(200);
        assertThat(response.body()).isEqualTo("{\"challenge\":\"" + CHALLENGE + "\"}");

        // 签名任一位不符按拒绝，不回显也不落库
        sign(body);
        headers.set("X-Lark-Signature", "0".repeat(64));
        assertThat(adapter.receive(account(ENCRYPT_KEY), Map.of(), headers, body).response())
            .isEqualTo(ChannelCallbackResult.rejected());
    }

    @Test
    void signedButUndecryptablePlaintextIsRejectedAndUnparsablePlaintextIsBadRequest() {
        // 签名合法但解出垃圾（密钥不符的密文会在 PKCS#7 校验失败）→ 拒绝
        String body = envelope("another-key", "{\"challenge\":\"c\",\"type\":\"url_verification\"}");
        sign(body);
        assertThat(adapter.receive(account(ENCRYPT_KEY), Map.of(), headers, body).response().status()).isEqualTo(403);

        // 解密成功但明文不是合法 JSON → 按参数错误
        String broken = envelope(ENCRYPT_KEY, "not-json");
        sign(broken);
        assertThat(adapter.receive(account(ENCRYPT_KEY), Map.of(), headers, broken).response().status()).isEqualTo(400);
    }

    @Test
    void restrictionsReflectConfiguredCredentials() {
        // 无 channel_info 的账号缺少必填凭据，如实说明不可发不可读
        CompanyChannelDO incomplete = new CompanyChannelDO();
        incomplete.setChannel(ChannelEnum.FEISHU);
        assertThat(adapter.sendRestriction(incomplete)).isEqualTo("渠道发送凭据未配置");
        assertThat(adapter.mediaRestriction(incomplete)).isEqualTo("渠道素材凭据未配置");

        // 完整凭据（含明文模式）不设限制
        assertThat(adapter.sendRestriction(account(ENCRYPT_KEY))).isNull();
        assertThat(adapter.mediaRestriction(account(ENCRYPT_KEY))).isNull();
        assertThat(adapter.sendRestriction(account(null))).isNull();
    }

    // ---- 夹具 ----

    // 完整凭据账号；encryptKey 为 null 表示明文模式（不写 encryptKey 键）
    private CompanyChannelDO account(String encryptKey) {
        CompanyChannelDO account = new CompanyChannelDO();
        account.setCompanyChannelId(CHANNEL_ID);
        account.setChannel(ChannelEnum.FEISHU);
        Map<String, Object> info = new HashMap<>();
        info.put("appId", "cli_9f5343c580712544");
        info.put("appSecret", "dskLLdkasdjlasdKK");
        info.put("verificationToken", TOKEN);
        if (encryptKey != null) {
            info.put("encryptKey", encryptKey);
        }
        account.setChannelInfo(info);
        return account;
    }

    // 测试侧按官方 §4.3 构造加密信封：key = sha256(encrypt_key)，16B IV 置于密文头部。
    // IV 固定取值——错钥密文的 PKCS#7 校验是概率事件（约 1/256 概率侥幸过填充校验），
    // 随机 IV 会让「错钥拒绝」用例偶发翻车，固定后结果可复现
    private static final byte[] FIXED_IV = "0123456789abcdef".getBytes(StandardCharsets.US_ASCII);

    private String envelope(String encryptKey, String plaintextJson) {
        byte[] iv = FIXED_IV.clone();
        AES aes = new AES(Mode.CBC, Padding.PKCS5Padding, DigestUtil.sha256(encryptKey), iv);
        byte[] encrypted = aes.encrypt(plaintextJson.getBytes(StandardCharsets.UTF_8));
        byte[] data = ByteBuffer.allocate(16 + encrypted.length).put(iv).put(encrypted).array();
        return "{\"encrypt\":\"" + java.util.Base64.getEncoder().encodeToString(data) + "\"}";
    }

    // 按官方 §4.2 计算签名并写入三签名头
    private void sign(String body) {
        String timestamp = String.valueOf(System.currentTimeMillis() / 1000);
        String nonce = "nonce-" + System.nanoTime();
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            digest.update(timestamp.getBytes(StandardCharsets.UTF_8));
            digest.update(nonce.getBytes(StandardCharsets.UTF_8));
            digest.update(ENCRYPT_KEY.getBytes(StandardCharsets.UTF_8));
            String signature = HexFormat.of().formatHex(digest.digest(body.getBytes(StandardCharsets.UTF_8)));
            headers.set("X-Lark-Request-Timestamp", timestamp);
            headers.set("X-Lark-Request-Nonce", nonce);
            headers.set("X-Lark-Signature", signature);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
