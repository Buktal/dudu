package com.dudu.duduserver.channel.wecom;

import cn.hutool.crypto.digest.DigestUtil;
import com.dudu.duduserver.channel.ChannelAdapter;
import com.dudu.duduserver.channel.ChannelCallbackResult;
import com.dudu.duduserver.channel.ChannelReceiveResult;
import com.dudu.duduserver.constant.ChannelEnum;
import com.dudu.duduserver.entity.CompanyChannelDO;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.web.client.RestClient;

import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 企业微信适配器边界验收（协议事实见 docs/research/channels/wecom.md，报文按 mock-pulse
 * wecom 适配器同形构造）：GET echostr 握手回显解密明文、POST 密文信封验签解密解析、
 * 事件推送只应答、非 agent 通道与缺凭据账号按不支持/限制如实应答；凭据不写日志不外传。
 */
class WecomAdapterTest {

    // 官方 90968 加解密完整示例凭据（docs/research/channels/wecom.md §5.1）
    private static final String CORP_ID = "wx5823bf96d3bd56c7";
    private static final String TOKEN = "QDG6eK";
    private static final String ENCODING_AES_KEY = "jWmYm7qr5nMoAUwZRjGtBxmz3KA1tkAj3ykkR6q2B2C";
    private static final String AGENT_ID = "218";
    private static final String TIMESTAMP = "1409659813";
    private static final String NONCE = "1372623149";
    private static final long CHANNEL_ID = 9301L;
    // 本机保留端口：适配器边界用例不应发起发送/素材请求，误请求会以连接失败暴露
    private static final String UNUSED_BASE = "http://127.0.0.1:9";
    private static final HttpHeaders HEADERS = new HttpHeaders();

    private final WecomProtocol protocol = new WecomProtocol();
    private final WecomAdapter adapter = new WecomAdapter(protocol,
        new WecomTextSender(RestClient.builder(), UNUSED_BASE),
        new WecomMediaReader(RestClient.builder(), UNUSED_BASE));

    @Test
    void verifyUrlEchoesTheDecryptedPlaintextExactlyForValidSignature() {
        // 官方 §3.2：echostr 加密串解密所得明文本身即响应体——不加引号、不带 BOM、不带换行
        String plaintext = "3f7a1c9e5b2d4f809a6b7c1d3e5f7082";
        String echostr = encrypt(plaintext, CORP_ID);

        ChannelCallbackResult result = adapter.verifyUrl(account(fullInfo()),
            echoQuery(echostr), HEADERS);

        assertThat(result.status()).isEqualTo(200);
        assertThat(result.body()).isEqualTo(plaintext);
    }

    @Test
    void verifyUrlRejectsTamperedSignatureAndForeignReceiveid() {
        String echostr = encrypt("echo-plaintext", CORP_ID);

        Map<String, String> tampered = echoQuery(echostr);
        tampered.put("msg_signature", "0".repeat(40));
        assertThat(adapter.verifyUrl(account(fullInfo()), tampered, HEADERS))
            .isEqualTo(ChannelCallbackResult.rejected());

        // 解密尾部 receiveid 须与 corpId 校验（官方 §4.4，官方库 -40005 同语义）
        String foreign = encrypt("echo-plaintext", "ww_other_corp");
        assertThat(adapter.verifyUrl(account(fullInfo()), echoQuery(foreign), HEADERS).status())
            .isEqualTo(403);
    }

    @Test
    void verifyUrlAnswersUnsupportedWithoutCallbackCredentialsOrForOtherSystems() {
        Map<String, Object> withoutAesKey = fullInfo();
        withoutAesKey.remove("encodingAesKey");
        assertThat(adapter.verifyUrl(account(withoutAesKey), echoQuery("echo"), HEADERS).status()).isEqualTo(501);

        // system 缺省 agent；aibot JSON 通道本票不做，按不支持应答
        Map<String, Object> aibot = fullInfo();
        aibot.put("system", "aibot");
        assertThat(adapter.verifyUrl(account(aibot), echoQuery("echo"), HEADERS).status()).isEqualTo(501);

        // 合法账号缺 echostr 按参数错误处理
        assertThat(adapter.verifyUrl(account(fullInfo()), signedQuery(null), HEADERS).status()).isEqualTo(400);
    }

    @Test
    void receiveDecryptsEnvelopeIntoVisitorMessageAndAnswersSuccess() {
        // 报文取官方 §5.1 黄金样本明文（密文可解得），POST 信封按 §5.1 元素序构造
        String plaintext = protocol.decrypt(ENCODING_AES_KEY, goldenEncrypt()).xml();
        String envelope = envelope(goldenEncrypt());

        ChannelReceiveResult result = adapter.receive(account(fullInfo()),
            signedQuery(goldenEncrypt()), HEADERS, envelope);

        assertThat(result.response().status()).isEqualTo(200);
        assertThat(result.response().body()).isEqualTo("success");
        assertThat(result.message()).isNotNull();
        assertThat(result.message().companyChannelId()).isEqualTo(CHANNEL_ID);
        assertThat(result.message().externalUserId()).isEqualTo("mycreate");
        assertThat(result.message().externalMessageId()).isEqualTo("4561255354251345929");
        assertThat(result.message().content()).isEqualTo(Map.of("type", "text", "text", "hello"));
    }

    @Test
    void receiveRejectsTamperedSignatureMalformedEnvelopeAndForeignReceiveid() {
        String plaintext = protocol.decrypt(ENCODING_AES_KEY, goldenEncrypt()).xml();
        String envelope = envelope(goldenEncrypt());

        Map<String, String> tampered = signedQuery(goldenEncrypt());
        tampered.put("msg_signature", "0".repeat(40));
        ChannelReceiveResult rejected = adapter.receive(account(fullInfo()), tampered, HEADERS, envelope);
        assertThat(rejected.response()).isEqualTo(ChannelCallbackResult.rejected());
        assertThat(rejected.message()).isNull();

        // 信封缺 Encrypt：参数错误，不发起解密
        assertThat(adapter.receive(account(fullInfo()), signedQuery("x"), HEADERS,
            "<xml><ToUserName><![CDATA[" + CORP_ID + "]]></ToUserName></xml>").response().status()).isEqualTo(400);

        // 明文用他企业 receiveid 加密：同 token 签名可复算，但解密 receiveid 校验拒绝
        String foreign = envelope(encrypt(plaintext, "ww_other_corp"));
        assertThat(adapter.receive(account(fullInfo()), signedQuery(encrypt(plaintext, "ww_other_corp")),
            HEADERS, foreign).response().status()).isEqualTo(403);
    }

    @Test
    void receiveAcknowledgesEventPushWithoutVisitorMessage() {
        // 官方 §5.3 subscribe 事件明文 → 加密信封 → 只应答 success，不产生访客消息
        String event = "<xml><ToUserName><![CDATA[" + CORP_ID + "]]></ToUserName>"
            + "<FromUserName><![CDATA[UserID]]></FromUserName>"
            + "<CreateTime>1348831860</CreateTime><MsgType><![CDATA[event]]></MsgType>"
            + "<Event><![CDATA[subscribe]]></Event><AgentID>1</AgentID></xml>";
        String encrypt = encrypt(event, CORP_ID);

        ChannelReceiveResult result = adapter.receive(account(fullInfo()),
            signedQuery(encrypt), HEADERS, envelope(encrypt));

        assertThat(result.response()).isEqualTo(ChannelCallbackResult.success());
        assertThat(result.message()).isNull();
    }

    @Test
    void restrictionsDescribeMissingCredentialsAndUnsupportedSystemHonestly() {
        assertThat(adapter.sendRestriction(account(fullInfo()))).isNull();
        assertThat(adapter.mediaRestriction(account(fullInfo()))).isNull();

        // 只有回调材料：握手与推送可继续（receive 用例已覆盖），发送/素材按未配置如实说明
        Map<String, Object> callbackOnly = fullInfo();
        callbackOnly.remove("corpSecret");
        assertThat(adapter.sendRestriction(account(callbackOnly))).isEqualTo("渠道发送凭据未配置");
        assertThat(adapter.mediaRestriction(account(callbackOnly))).isEqualTo("渠道素材凭据未配置");

        // system 缺省 agent；aibot JSON 通道本票不做，能力说明如实告知
        Map<String, Object> aibot = fullInfo();
        aibot.put("system", "aibot");
        assertThat(adapter.sendRestriction(account(aibot))).isEqualTo("企业微信智能机器人通道暂未接入发送");
        assertThat(adapter.mediaRestriction(account(aibot))).isEqualTo("企业微信智能机器人通道暂未接入素材读取");
    }

    @Test
    void adapterRoutesUnderTheWecomChannelCode() {
        assertThat(adapter).isInstanceOf(ChannelAdapter.class);
        assertThat(adapter.channel()).isEqualTo(ChannelEnum.WECOM);
    }

    // 官方 §5.1 密文（可解得官方明文）：receive 用例的真报文来源
    private String goldenEncrypt() {
        return "RypEvHKD8QQKFhvQ6QleEB4J58tiPdvo+rtK1I9qca6aM/wvqnLSV5zEPeusUiX"
            + "5L5X/0lWfrf0QADHHhGd3QczcdCUpj911L3vg3W/sYYvuJTs3TUUkSUXxaccAS0qhxchrRYt66wiSpGLYL42aM6A8dTT+6k4a"
            + "SknmPj48kzJs8qLjvd4Xgpue06DOdnLxAUHzM6+kDZ+HMZfJYuR+LtwGc2hgf5gsijff0ekUNXZiqATP7PF5mZxZ3Izoun1s4"
            + "zG4LUMnvw2r+KqCKIw+3IQH03v+BCA9nMELNqbSf6tiWSrXJB3LAVGUcallcrw8V2t9EL4EhzJWrQUax5wLVMNS0+rUPA3k22"
            + "Ncx4XXZS9o0MBH27Bo6BpNelZpS+/uh9KsNlY6bHCmJU9p8g7m3fVKn28H3KDYA5Pl/T8Z1ptDAVe0lXdQ2YoyyH2uyPIGHBZ"
            + "ZIs2pDBS8R07+qN+E7Q==";
    }

    // 固定随机数加密，便于用例构造可复现密文
    private String encrypt(String plaintext, String receiveid) {
        return protocol.encrypt(ENCODING_AES_KEY, "0123456789abcdef".getBytes(StandardCharsets.UTF_8),
            plaintext.getBytes(StandardCharsets.UTF_8), receiveid);
    }

    // 官方 §5.1 POST 信封元素序：ToUserName → Encrypt → AgentID（mock-pulse agent 通道同形）
    private String envelope(String encrypt) {
        return "<xml><ToUserName><![CDATA[" + CORP_ID + "]]></ToUserName>"
            + "<Encrypt><![CDATA[" + encrypt + "]]></Encrypt>"
            + "<AgentID><![CDATA[" + AGENT_ID + "]]></AgentID></xml>";
    }

    // GET 握手查询：echostr 加密串本身参与四值签名（官方 §3.2）
    private Map<String, String> echoQuery(String echostr) {
        Map<String, String> query = signedQuery(echostr);
        query.put("echostr", echostr);
        return query;
    }

    // msg_signature/timestamp/nonce 三查询参数：签名 = sha1(四值字典序拼接)，密文参与签名
    private Map<String, String> signedQuery(String msgEncrypt) {
        Map<String, String> query = new HashMap<>();
        query.put("timestamp", TIMESTAMP);
        query.put("nonce", NONCE);
        query.put("msg_signature", signatureOf(msgEncrypt == null ? "" : msgEncrypt));
        return query;
    }

    private String signatureOf(String msgEncrypt) {
        String[] parts = {TOKEN, TIMESTAMP, NONCE, msgEncrypt};
        Arrays.sort(parts);
        return DigestUtil.sha1Hex(String.join("", parts));
    }

    private Map<String, Object> fullInfo() {
        Map<String, Object> info = new HashMap<>();
        info.put("url", "https://dudu.example.com/api/channels/9301/callback");
        info.put("corpId", CORP_ID);
        info.put("token", TOKEN);
        info.put("encodingAesKey", ENCODING_AES_KEY);
        info.put("agentId", AGENT_ID);
        info.put("corpSecret", "test-corp-secret");
        return info;
    }

    private CompanyChannelDO account(Map<String, Object> channelInfo) {
        CompanyChannelDO account = new CompanyChannelDO();
        account.setCompanyChannelId(CHANNEL_ID);
        account.setChannel(ChannelEnum.WECOM);
        account.setAccountName("企业微信");
        account.setChannelInfo(channelInfo);
        return account;
    }
}
