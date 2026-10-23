package com.dudu.duduserver.channel.dingtalk;

import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.dudu.duduserver.channel.ChannelAdapterRegistry;
import com.dudu.duduserver.channel.ChannelCallbackResult;
import com.dudu.duduserver.channel.ChannelReceiveResult;
import com.dudu.duduserver.constant.ChannelEnum;
import com.dudu.duduserver.entity.CompanyChannelDO;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.web.client.RestClient;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 钉钉适配器回调路径验收（事实库 §3.2/§5.6/§5.11）：无 GET 验证阶段默认不支持、
 * 凭据与通道形态缺失不支持、验签失败拒绝、解密失败按参数错误应答、握手事件与未知明文只应答加密
 * success 包、机器人消息解析落库且应答仍为加密包、非 JSON 明文按参数错误拒绝、
 * 发送/素材凭据缺失如实限制且不发起渠道请求。
 */
class DingtalkAdapterTest {

    // 本机保留端口：拒绝与凭据缺失路径不应发起任何请求，误请求会以连接失败暴露
    private static final String UNUSED_BASE = "http://127.0.0.1:9";
    private static final String TOKEN = "callback-token";
    private static final String AES_KEY = "4g5j64qlyl3zvetqxz5jiocdr586fn2zvjpa8zls3ij";
    private static final String OWNER = "ding9f50b15bxxxx16741";
    private static final String TIMESTAMP = "1708327204136";
    private static final String NONCE = "nEXhMP4r";

    private final DingtalkAdapter adapter = new DingtalkAdapter(new DingtalkProtocol(),
        new DingtalkTextSender(RestClient.builder(), UNUSED_BASE, UNUSED_BASE),
        new DingtalkMediaReader(RestClient.builder(), UNUSED_BASE));

    @Test
    void answersUnsupportedForUrlVerificationAndMissingChannelForm() {
        assertThat(adapter.channel()).isEqualTo(ChannelEnum.DINGTALK);
        // 钉钉无 GET URL 验证阶段：check_url 以加密事件形态走 POST receive
        assertThat(adapter.verifyUrl(account(fullInfo()), Map.of(), new HttpHeaders()))
            .isEqualTo(ChannelCallbackResult.unsupported());

        assertThat(adapter.receive(account(infoWithout("token")), Map.of(), new HttpHeaders(), "{}").response())
            .isEqualTo(ChannelCallbackResult.unsupported());
        // 机器人通道（system=bot）不在本票范围
        Map<String, Object> botInfo = fullInfo();
        botInfo.put("system", "bot");
        assertThat(adapter.receive(account(botInfo), Map.of(), new HttpHeaders(), "{}").response())
            .isEqualTo(ChannelCallbackResult.unsupported());
    }

    @Test
    void rejectsInvalidSignaturesAndUndecryptableCiphertext() {
        Map<String, String> query = query("hello", "密文占位");
        // 签名与密文不匹配
        ChannelReceiveResult badSignature = adapter.receive(account(fullInfo()), query, new HttpHeaders(),
            body("hello"));
        assertThat(badSignature.message()).isNull();
        assertThat(badSignature.response()).isEqualTo(ChannelCallbackResult.rejected());

        // 签名按篡改密文重算（形式有效）但解密失败：按参数错误应答且不抛（与微信三系口径一致）
        String tampered = "not-a-real-ciphertext";
        Map<String, String> tamperedQuery = query(timestampSigned(tampered), tampered);
        ChannelReceiveResult undecryptable = adapter.receive(account(fullInfo()), tamperedQuery,
            new HttpHeaders(), body(tampered));
        assertThat(undecryptable.message()).isNull();
        assertThat(undecryptable.response()).isEqualTo(ChannelCallbackResult.badRequest());
    }

    @Test
    void answersEncryptedSuccessForHandshakeEvents() {
        // 握手 check_url（MockPulse HANDSHAKE_PLAINTEXT）：只应答加密 success 包，不落库
        ChannelReceiveResult result = receive("{\"EventType\":\"check_url\"}");

        assertThat(result.message()).isNull();
        assertThat(result.response().status()).isEqualTo(200);
        JSONObject reply = JSONUtil.parseObj(result.response().body());
        assertThat(DingtalkCrypto.decrypt(reply.getStr("encrypt"), AES_KEY, OWNER).message()).isEqualTo("success");
        assertThat(DingtalkCrypto.verify(reply.getStr("msg_signature"), TOKEN, reply.getStr("timeStamp"),
            reply.getStr("nonce"), reply.getStr("encrypt"))).isTrue();
    }

    @Test
    void acceptsRobotMessagesAndAnswersEncryptedSuccess() {
        String plaintext = JSONUtil.createObj()
            .set("msgtype", "text")
            .set("senderId", "$:LWCP_v1:$6GYsn+zrv5WZ77xc2v4zsyXfBv1MhAv9")
            .set("senderNick", "小钉")
            .set("msgId", "msgrK2ckHkMbaiUWt5xQU+riw==")
            .set("text", Map.of("content", " text"))
            .toString();
        ChannelReceiveResult result = receive(plaintext);

        assertThat(result.message()).isNotNull();
        assertThat(result.message().externalUserId()).isEqualTo("$:LWCP_v1:$6GYsn+zrv5WZ77xc2v4zsyXfBv1MhAv9");
        assertThat(result.message().content()).isEqualTo(Map.of("type", "text", "text", " text"));
        assertThat(result.response().status()).isEqualTo(200);
        assertThat(DingtalkCrypto.decrypt(
            JSONUtil.parseObj(result.response().body()).getStr("encrypt"), AES_KEY, OWNER).message())
            .isEqualTo("success");
    }

    @Test
    void answersEncryptedSuccessForUnroutedPlaintextWithoutSaving() {
        // 既非事件信封也无 msgtype：如实告警只应答，不落库也不拒绝
        ChannelReceiveResult result = receive("{\"foo\":\"bar\"}");

        assertThat(result.message()).isNull();
        assertThat(result.response().status()).isEqualTo(200);
        assertThat(DingtalkCrypto.decrypt(
            JSONUtil.parseObj(result.response().body()).getStr("encrypt"), AES_KEY, OWNER).message())
            .isEqualTo("success");
    }

    @Test
    void rejectsDecryptedNonJsonPlaintextAsBadRequest() {
        // 解密得到非 JSON（网关页/损坏转发）：按参数错误拒绝而非应答 success
        ChannelReceiveResult result = receive("<html>bad gateway</html>");

        assertThat(result.message()).isNull();
        assertThat(result.response()).isEqualTo(ChannelCallbackResult.badRequest());
    }

    @Test
    void restrictsSendAndMediaHonestlyByCredentialsAndNeverCallsTheChannel() {
        Map<String, Object> receiveOnly = fullInfo();
        assertThat(adapter.sendRestriction(account(receiveOnly))).isEqualTo("渠道发送凭据未配置");
        assertThat(adapter.mediaRestriction(account(receiveOnly))).isEqualTo("渠道素材凭据未配置");
        // 发送与素材读取经注册表分派：凭据缺失在 restriction 即拦截，不进入适配器
        ChannelAdapterRegistry registry = new ChannelAdapterRegistry(List.of(adapter));
        assertThat(registry.send(account(receiveOnly), "sender-1", "在吗").failureReason())
            .isEqualTo("渠道发送凭据未配置");
        assertThat(registry.readMedia(account(receiveOnly), "mIofN…").failureReason())
            .isEqualTo("渠道素材凭据未配置");

        Map<String, Object> complete = fullInfo();
        complete.put("appKey", "dingeqqpkv3xxxxxx");
        complete.put("appSecret", "GT-lsu-taDAxxx");
        complete.put("agentId", "123456789");
        assertThat(adapter.sendRestriction(account(complete))).isNull();
        assertThat(adapter.mediaRestriction(account(complete))).isNull();
    }

    // 以真实密钥加密明文并按四参签名构造回调请求
    private ChannelReceiveResult receive(String plaintext) {
        String encrypt = DingtalkCrypto.encrypt(plaintext, AES_KEY, OWNER);
        Map<String, String> query = query(timestampSigned(encrypt), encrypt);
        return adapter.receive(account(fullInfo()), query, new HttpHeaders(), body(encrypt));
    }

    private Map<String, String> query(String signature, String encrypt) {
        Map<String, String> query = new HashMap<>();
        query.put("signature", signature);
        query.put("timestamp", TIMESTAMP);
        query.put("nonce", NONCE);
        query.put("encrypt", encrypt);
        return query;
    }

    private String timestampSigned(String encrypt) {
        return DingtalkCrypto.buildSignature(TOKEN, TIMESTAMP, NONCE, encrypt);
    }

    private String body(String encrypt) {
        return JSONUtil.createObj().set("encrypt", encrypt).toString();
    }

    private Map<String, Object> fullInfo() {
        Map<String, Object> info = new HashMap<>();
        info.put("url", "https://desk.example/api/channels/1/callback");
        info.put("token", TOKEN);
        info.put("encodingAesKey", AES_KEY);
        info.put("ownerKey", OWNER);
        return info;
    }

    private Map<String, Object> infoWithout(String key) {
        Map<String, Object> info = fullInfo();
        info.remove(key);
        return info;
    }

    private CompanyChannelDO account(Map<String, Object> channelInfo) {
        CompanyChannelDO account = new CompanyChannelDO();
        account.setChannel(ChannelEnum.DINGTALK);
        account.setChannelInfo(channelInfo);
        return account;
    }
}
