package com.dudu.duduserver.channel.alipay;

import com.dudu.duduserver.channel.ChannelInboundMessage;
import com.dudu.duduserver.constant.MessageDirectionEnum;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.Signature;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 支付宝回调验签验证（事实见 docs/research/channels/alipay.md §3.2、§4.3）：回调验签用
 * 支付宝平台公钥（§4.3 第 4 步），向量以本测试自造的平台密钥对加签生成；应用私钥只作
 * 握手回包签名（biz_content 开发者公钥由它推导）。生活号口径为待验签串保留 sign_type
 * （仅剔除 sign，官方示例工程 rsaCheckV2 实证）；mock-pulse 探测按通用 rsaCheckV1 语义
 * 加签（剔除 sign 与 sign_type），官方通用规则亦然，实现须两者都接受（生活号口径优先）。
 * 事实库 §5.1 拼串不可作验签向量。
 */
class AlipayProtocolTest {

    private static final String HANDSHAKE_XML =
        "<?xml version=\"1.0\" encoding=\"gbk\"?><XML><AppId><![CDATA[2014072300007148]]></AppId>"
            + "<FromUserId></FromUserId><CreateTime><![CDATA[1406083506817]]></CreateTime>"
            + "<MsgType><![CDATA[event]]></MsgType><EventType><![CDATA[verifygw]]></EventType>"
            + "<ActionParam></ActionParam><AgreementId></AgreementId><AccountNo></AccountNo></XML>";

    private static KeyPair keyPair;
    private static KeyPair platformKeyPair;
    private static AlipayCredentials credentials;
    private final AlipayProtocol protocol = new AlipayProtocol();

    @BeforeAll
    static void generateKeyPair() throws Exception {
        // 测试自造两对 RSA2 密钥对（2048 位）：应用对作握手回包签名与开发者公钥推导，
        // 平台对模拟支付宝侧加签（channel_info 存其公钥，PKCS#8/X.509 Base64 与生产一致）
        keyPair = KeyPairGenerator.getInstance("RSA").genKeyPair();
        platformKeyPair = KeyPairGenerator.getInstance("RSA").genKeyPair();
        credentials = new AlipayCredentials("2014072300007148",
            Base64.getMimeEncoder().encodeToString(keyPair.getPrivate().getEncoded()),
            Base64.getMimeEncoder().encodeToString(platformKeyPair.getPublic().getEncoded()));
    }

    @Test
    void verifiesSignatureKeepingSignTypePerLifeAccountRule() throws Exception {
        // 生活号口径黄金向量：待验签串保留 sign_type，ASCII 升序 k=v& 拼接（§3.2 示例串）
        String toVerify = "biz_content=" + HANDSHAKE_XML
            + "&charset=GBK&service=alipay.service.check&sign_type=RSA2";
        Map<String, String> params = handshakeParams(sign(toVerify));

        assertThat(protocol.verify(credentials, params)).isTrue();
    }

    @Test
    void rejectsTamperedParamsAndForeignSignatures() throws Exception {
        Map<String, String> params = handshakeParams(sign(
            "biz_content=" + HANDSHAKE_XML + "&charset=GBK&service=alipay.service.check&sign_type=RSA2"));

        // 报文任一参数被篡改（生活号口径）：验签必须失败
        params.put("charset", "UTF-8");
        assertThat(protocol.verify(credentials, params)).isFalse();

        // 用另一把私钥签出的签名：验签必须失败
        KeyPair foreign = KeyPairGenerator.getInstance("RSA").genKeyPair();
        Map<String, String> foreignParams = handshakeParams(signWith(foreign, toVerify()));
        assertThat(protocol.verify(credentials, foreignParams)).isFalse();

        // 用应用私钥签出的签名（官方验签方为支付宝平台公钥）：验签必须失败
        Map<String, String> appSignedParams = handshakeParams(signWith(keyPair, toVerify()));
        assertThat(protocol.verify(credentials, appSignedParams)).isFalse();
    }

    @Test
    void acceptsGenericRuleSignatureExcludingSignTypeForMockPulseProbe() throws Exception {
        // mock-pulse 探测（支付通知形态）按通用规则加签：待验签串剔除 sign 与 sign_type
        String toVerify = "app_id=2014072300007148&charset=utf-8&out_trade_no=6823789339978248"
            + "&trade_no=2013112011001004330000121536&version=1.0";
        Map<String, String> params = new LinkedHashMap<>();
        params.put("app_id", "2014072300007148");
        params.put("charset", "utf-8");
        params.put("out_trade_no", "6823789339978248");
        params.put("trade_no", "2013112011001004330000121536");
        params.put("version", "1.0");
        params.put("sign_type", "RSA2");
        params.put("sign", sign(toVerify));

        assertThat(protocol.verify(credentials, params)).isTrue();
    }

    @Test
    void buildsSignedHandshakeReplyCarryingDerivedPublicKey() throws Exception {
        // 回包形状（§3.2 官方逐字）：GBK 声明 + alipay 信封 + response(biz_content=开发者公钥,
        // success=true) + sign + sign_type=RSA2；节点顺序按官方文档（biz_content 在前）
        String reply = protocol.handshakeReply(credentials);

        assertThat(reply).startsWith("<?xml version=\"1.0\" encoding=\"GBK\"?>")
            .contains("<alipay><response>")
            .contains("<success>true</success>")
            .contains("<sign_type>RSA2</sign_type></alipay>");

        // biz_content 即由 appPrivateKey 推导的应用公钥（X.509 Base64）——测试独立推导复核
        java.security.KeyFactory factory = java.security.KeyFactory.getInstance("RSA");
        String derivedKey = Base64.getMimeEncoder().encodeToString(
            factory.generatePublic(new java.security.spec.RSAPublicKeySpec(
                ((java.security.interfaces.RSAPublicKey) keyPair.getPublic()).getModulus(),
                ((java.security.interfaces.RSAPublicKey) keyPair.getPublic()).getPublicExponent()))
                .getEncoded());
        assertThat(reply).contains("<biz_content>" + derivedKey + "</biz_content>");

        // sign 可用该公钥对 response 节点内容独立验签：信封自洽且出自持私钥方
        String response = reply.replaceAll("(?s).*<response>(.*?)</response>.*", "$1");
        String sign = reply.replaceAll("(?s).*<sign>(.*?)</sign>.*", "$1");
        java.security.Signature verifier = java.security.Signature.getInstance("SHA256withRSA");
        verifier.initVerify(keyPair.getPublic());
        verifier.update(response.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        assertThat(verifier.verify(Base64.getDecoder().decode(sign))).isTrue();
    }

    @Test
    void parsesTextMessagePreferringFromAlipayUserId() {
        // §2.3 文本消息：FromAlipayUserId 为现用 userid，FromUserId（OpenId）已废弃仍下发
        Optional<ChannelInboundMessage> inbound = protocol.parse(7L, envelope(
            "<MsgType><![CDATA[text]]></MsgType>"
                + "<FromUserId><![CDATA[2088102123456789]]></FromUserId>"
                + "<FromAlipayUserId><![CDATA[2088102111111111]]></FromAlipayUserId>"
                + "<CreateTime><![CDATA[1406165628612]]></CreateTime>"
                + "<MsgId><![CDATA[9000123456789012]]></MsgId>"
                + "<Text><Content><![CDATA[Hello]]></Content></Text>"));

        assertThat(inbound).isPresent();
        ChannelInboundMessage message = inbound.get();
        assertThat(message.companyChannelId()).isEqualTo(7L);
        assertThat(message.externalUserId()).isEqualTo("2088102111111111");
        assertThat(message.externalMessageId()).isEqualTo("9000123456789012");
        assertThat(message.direction()).isEqualTo(MessageDirectionEnum.INCOMING);
        assertThat(message.content()).containsEntry("type", "text").containsEntry("text", "Hello");
    }

    @Test
    void parsesImageMessageWithMediaIdForLaterDownload() {
        // §2.3 图片消息：MediaId 为媒体下载凭据（multimedia.do），无公开链接
        Optional<ChannelInboundMessage> inbound = protocol.parse(7L, envelope(
            "<MsgType><![CDATA[image]]></MsgType>"
                + "<FromAlipayUserId><![CDATA[2088102111111111]]></FromAlipayUserId>"
                + "<Image><MediaId><![CDATA[abc123]]></MediaId><Format><![CDATA[jpg]]></Format></Image>"));

        assertThat(inbound).isPresent();
        assertThat(inbound.get().content()).containsEntry("type", "image");
        assertThat((Map<String, Object>) inbound.get().content().get("media"))
            .containsEntry("kind", "image")
            .containsEntry("id", "abc123");
    }

    @Test
    void fallsBackToFromUserIdWhenAlipayUserIdAbsent() {
        Optional<ChannelInboundMessage> inbound = protocol.parse(7L, envelope(
            "<MsgType><![CDATA[text]]></MsgType>"
                + "<FromUserId><![CDATA[2088102123456789]]></FromUserId>"
                + "<Text><Content><![CDATA[hi]]></Content></Text>"));

        assertThat(inbound).isPresent();
        assertThat(inbound.get().externalUserId()).isEqualTo("2088102123456789");
    }

    @Test
    void extractsUserNameFromUserInfoWithoutBlockingOnMalformedJson() {
        // §2.3 UserInfo 为 JSON 字符串（logon_id/user_name）；损坏时名称为 null，不阻塞收信
        Optional<ChannelInboundMessage> named = protocol.parse(7L, envelope(
            "<MsgType><![CDATA[text]]></MsgType>"
                + "<FromAlipayUserId><![CDATA[2088102111111111]]></FromAlipayUserId>"
                + "<UserInfo><![CDATA[{\"logon_id\":\"abc\",\"user_name\":\"张三\"}]]></UserInfo>"
                + "<Text><Content><![CDATA[hi]]></Content></Text>"));
        assertThat(named).isPresent();
        assertThat(named.get().name()).isEqualTo("张三");

        Optional<ChannelInboundMessage> malformed = protocol.parse(7L, envelope(
            "<MsgType><![CDATA[text]]></MsgType>"
                + "<FromAlipayUserId><![CDATA[2088102111111111]]></FromAlipayUserId>"
                + "<UserInfo><![CDATA[not-json]]></UserInfo>"
                + "<Text><Content><![CDATA[hi]]></Content></Text>"));
        assertThat(malformed).isPresent();
        assertThat(malformed.get().name()).isNull();
    }

    @Test
    void returnsEmptyForEventPush() {
        // §2.3 事件（follow/unfollow/enter/click）只应答 ack，不产生访客消息
        assertThat(protocol.parse(7L, envelope(
            "<MsgType><![CDATA[event]]></MsgType>"
                + "<EventType><![CDATA[follow]]></EventType>"
                + "<FromAlipayUserId><![CDATA[2088102111111111]]></FromAlipayUserId>"))).isEmpty();
        assertThat(protocol.parse(7L, envelope(
            "<MsgType><![CDATA[event]]></MsgType>"
                + "<EventType><![CDATA[verifygw]]></EventType>"))).isEmpty();
    }

    @Test
    void rejectsRecognizableMessageWithoutSenderIdentity() {
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> protocol.parse(7L, envelope(
                "<MsgType><![CDATA[text]]></MsgType><Text><Content><![CDATA[hi]]></Content></Text>")))
            .isInstanceOf(IllegalArgumentException.class);
    }

    // §2.3 被动通知 XML 信封：AppId 固定、字段自带 CDATA
    private String envelope(String inner) {
        return "<?xml version=\"1.0\" encoding=\"GBK\"?><XML><AppId><![CDATA[2014072300007148]]></AppId>"
            + inner + "</XML>";
    }

    @Test
    void buildsUnsignedAckCarryingSenderIdAndAppId() {
        // §2.3 官方 ack 形状（无签名，官方示例工程 buildBaseAckMsg 同款）：ToUserId=来报
        // 发送方、AppId、CreateTime 裸毫秒、MsgType=ack
        String ack = protocol.ackReply("2088102111111111", credentials);

        assertThat(ack).isEqualTo("<XML><ToUserId><![CDATA[2088102111111111]]></ToUserId>"
            + "<AppId><![CDATA[2014072300007148]]></AppId>"
            + "<CreateTime>" + ack.replaceAll("(?s).*<CreateTime>(\\d+)</CreateTime>.*", "$1")
            + "</CreateTime><MsgType><![CDATA[ack]]></MsgType></XML>");

        // CreateTime 为当前毫秒：取值应在测试窗口内
        long createTime = Long.parseLong(ack.replaceAll("(?s).*<CreateTime>(\\d+)</CreateTime>.*", "$1"));
        assertThat(createTime).isBetween(System.currentTimeMillis() - 60_000, System.currentTimeMillis() + 60_000);
    }

    private Map<String, String> handshakeParams(String sign) {
        Map<String, String> params = new LinkedHashMap<>();
        params.put("service", "alipay.service.check");
        params.put("charset", "GBK");
        params.put("sign_type", "RSA2");
        params.put("biz_content", HANDSHAKE_XML);
        params.put("sign", sign);
        return params;
    }

    private String toVerify() {
        return "biz_content=" + HANDSHAKE_XML + "&charset=GBK&service=alipay.service.check&sign_type=RSA2";
    }

    // 用本测试平台密钥对作 SHA256withRSA 签名（官方加签算法与验签方，§4.1/§4.3）
    private String sign(String toVerify) throws Exception {
        return signWith(platformKeyPair, toVerify);
    }

    private String signWith(KeyPair pair, String toVerify) throws Exception {
        Signature signature = Signature.getInstance("SHA256withRSA");
        signature.initSign(pair.getPrivate());
        signature.update(toVerify.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        return Base64.getEncoder().encodeToString(signature.sign());
    }
}
