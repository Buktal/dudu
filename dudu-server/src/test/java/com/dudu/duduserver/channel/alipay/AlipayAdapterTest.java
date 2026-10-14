package com.dudu.duduserver.channel.alipay;

import com.dudu.duduserver.channel.ChannelCallbackResult;
import com.dudu.duduserver.channel.ChannelReceiveResult;
import com.dudu.duduserver.constant.ChannelEnum;
import com.dudu.duduserver.entity.CompanyChannelDO;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;

import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.Signature;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 支付宝适配器回调编排验证（事实见 docs/research/channels/alipay.md §2.3、§3.2）：官方
 * 握手为 POST 形态（示例工程 doGet 委托 doPost），无 GET 验证阶段；网关验证回签名 XML
 * 信封；被动通知文本/图片落访客消息并回无签名 ack，事件只应答；mock-pulse 探测（无
 * service 的支付通知形态、通用规则加签）按 success 应答；非法签名拒绝、缺凭据按不支持。
 */
class AlipayAdapterTest {

    private static final String TEXT_ENVELOPE =
        "<?xml version=\"1.0\" encoding=\"GBK\"?><XML><AppId><![CDATA[2014072300007148]]></AppId>"
            + "<FromAlipayUserId><![CDATA[2088102111111111]]></FromAlipayUserId>"
            + "<CreateTime><![CDATA[1406165628612]]></CreateTime>"
            + "<MsgType><![CDATA[text]]></MsgType>"
            + "<Text><Content><![CDATA[Hello]]></Content></Text></XML>";

    private static final String FOLLOW_ENVELOPE =
        "<?xml version=\"1.0\" encoding=\"GBK\"?><XML><AppId><![CDATA[2014072300007148]]></AppId>"
            + "<FromAlipayUserId><![CDATA[2088102111111111]]></FromAlipayUserId>"
            + "<CreateTime><![CDATA[1406165628612]]></CreateTime>"
            + "<MsgType><![CDATA[event]]></MsgType>"
            + "<EventType><![CDATA[follow]]></EventType></XML>";

    private static KeyPair keyPair;
    private static AlipayCredentials credentials;

    private final AlipayProtocol protocol = new AlipayProtocol();
    private final AlipayAdapter adapter = new AlipayAdapter(protocol, null, null);

    @BeforeAll
    static void generateKeyPair() throws Exception {
        keyPair = KeyPairGenerator.getInstance("RSA").genKeyPair();
        credentials = new AlipayCredentials("2014072300007148",
            Base64.getMimeEncoder().encodeToString(keyPair.getPrivate().getEncoded()));
    }

    @Test
    void answersGatewayCheckWithSignedEnvelopeAfterVerification() {
        Map<String, String> params = signedParams(Map.of(
            "service", "alipay.service.check",
            "charset", "GBK",
            "biz_content", "<?xml version=\"1.0\" encoding=\"gbk\"?><XML>"
                + "<AppId><![CDATA[2014072300007148]]></AppId>"
                + "<CreateTime><![CDATA[1406083506817]]></CreateTime>"
                + "<MsgType><![CDATA[event]]></MsgType>"
                + "<EventType><![CDATA[verifygw]]></EventType></XML>"), false);

        ChannelReceiveResult result = adapter.receive(account(credentials), params, new HttpHeaders(), "");

        assertThat(result.message()).isNull();
        assertThat(result.response().status()).isEqualTo(200);
        assertThat(result.response().body())
            .startsWith("<?xml version=\"1.0\" encoding=\"GBK\"?><alipay><response>")
            .contains("<success>true</success>")
            .contains("<sign_type>RSA2</sign_type></alipay>");
    }

    @Test
    void rejectsGatewayCheckWithInvalidSignature() {
        Map<String, String> params = new LinkedHashMap<>(signedParams(Map.of(
            "service", "alipay.service.check", "charset", "GBK", "biz_content", "<XML></XML>"), false));
        params.put("biz_content", "<XML><tampered/></XML>");

        ChannelReceiveResult result = adapter.receive(account(credentials), params, new HttpHeaders(), "");

        assertThat(result.message()).isNull();
        assertThat(result.response().status()).isEqualTo(403);
    }

    @Test
    void acceptsTextNotificationWithAckReply() {
        Map<String, String> params = signedParams(Map.of(
            "service", "alipay.mobile.public.message.notify",
            "charset", "GBK",
            "biz_content", TEXT_ENVELOPE), false);

        ChannelReceiveResult result = adapter.receive(account(credentials), params, new HttpHeaders(), "");

        assertThat(result.message()).isNotNull();
        assertThat(result.message().externalUserId()).isEqualTo("2088102111111111");
        assertThat(result.message().content()).containsEntry("type", "text").containsEntry("text", "Hello");
        // 官方要求同步应答无签名 XML ack（§2.3），不是明文 success
        assertThat(result.response().status()).isEqualTo(200);
        assertThat(result.response().body())
            .startsWith("<XML><ToUserId><![CDATA[2088102111111111]]></ToUserId>")
            .contains("<AppId><![CDATA[2014072300007148]]></AppId>")
            .endsWith("<MsgType><![CDATA[ack]]></MsgType></XML>");
    }

    @Test
    void answersEventNotificationWithAckOnly() {
        Map<String, String> params = signedParams(Map.of(
            "service", "alipay.mobile.public.message.notify",
            "charset", "GBK",
            "biz_content", FOLLOW_ENVELOPE), false);

        ChannelReceiveResult result = adapter.receive(account(credentials), params, new HttpHeaders(), "");

        assertThat(result.message()).isNull();
        assertThat(result.response().status()).isEqualTo(200);
        assertThat(result.response().body()).contains("<MsgType><![CDATA[ack]]></MsgType></XML>");
    }

    @Test
    void answersMockPulseProbeWithoutServiceFieldAsPlainSuccess() {
        // mock-pulse 探测（支付通知形态）：无 service/biz_content，通用规则加签（剔除
        // sign_type），只要求 HTTP 200（no_body_check），明文 success 即兼容应答
        Map<String, String> params = signedParams(Map.of(
            "app_id", "2014072300007148",
            "charset", "utf-8",
            "out_trade_no", "6823789339978248",
            "trade_no", "2013112011001004330000121536",
            "version", "1.0"), true);

        ChannelReceiveResult result = adapter.receive(account(credentials), params, new HttpHeaders(), "");

        assertThat(result.message()).isNull();
        assertThat(result.response().status()).isEqualTo(200);
        assertThat(result.response().body()).isEqualTo("success");
    }

    @Test
    void answersUnconfiguredAccountAsUnsupported() {
        Map<String, String> params = signedParams(Map.of(
            "service", "alipay.service.check", "charset", "GBK", "biz_content", "<XML></XML>"), false);

        ChannelReceiveResult result = adapter.receive(account(null), params, new HttpHeaders(), "");

        assertThat(result.response().status()).isEqualTo(501);
    }

    @Test
    void answersPushWithoutSignatureMaterialAsBadRequest() {
        ChannelReceiveResult result = adapter.receive(account(credentials),
            Map.of("service", "alipay.service.check", "charset", "GBK"), new HttpHeaders(), "");

        assertThat(result.response().status()).isEqualTo(400);
    }

    @Test
    void getVerificationIsUnsupportedSinceOfficialHandshakeIsPostOnly() {
        // 官方握手为 POST 表单（§3.2，示例工程 doGet 委托 doPost），无 GET 验证阶段
        ChannelCallbackResult result = adapter.verifyUrl(account(credentials),
            Map.of("service", "alipay.service.check"), new HttpHeaders());

        assertThat(result.status()).isEqualTo(501);
    }

    @Test
    void restrictionsReportMissingCredentialsHonesty() {
        assertThat(adapter.sendRestriction(account(null))).isEqualTo(AlipayTextSender.SEND_CREDENTIALS_MISSING);
        assertThat(adapter.mediaRestriction(account(null))).isEqualTo(AlipayMediaReader.MEDIA_CREDENTIALS_MISSING);
        assertThat(adapter.sendRestriction(account(credentials))).isNull();
        assertThat(adapter.mediaRestriction(account(credentials))).isNull();
    }

    // 按官方规则对参数加签：生活号口径保留 sign_type（dropGenericSignType=false），
    // mock-pulse 探测口径剔除（true）
    private Map<String, String> signedParams(Map<String, String> params, boolean dropSignType) {        Map<String, String> signed = new LinkedHashMap<>(params);
        signed.put("sign_type", "RSA2");
        signed.put("sign", sign(toVerifyString(signed, dropSignType)));
        return signed;
    }

    private String toVerifyString(Map<String, String> params, boolean dropSignType) {
        Map<String, String> sorted = new java.util.TreeMap<>(params);
        if (dropSignType) {
            sorted.remove("sign_type");
        }
        StringBuilder toVerify = new StringBuilder();
        for (Map.Entry<String, String> entry : sorted.entrySet()) {
            if (toVerify.length() > 0) {
                toVerify.append('&');
            }
            toVerify.append(entry.getKey()).append('=').append(entry.getValue());
        }
        return toVerify.toString();
    }

    private String sign(String toVerify) {
        try {
            Signature signature = Signature.getInstance("SHA256withRSA");
            signature.initSign(keyPair.getPrivate());
            signature.update(toVerify.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            return Base64.getEncoder().encodeToString(signature.sign());
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private CompanyChannelDO account(AlipayCredentials channelCredentials) {
        CompanyChannelDO account = new CompanyChannelDO();
        account.setCompanyChannelId(7L);
        account.setChannel(ChannelEnum.ALIPAY);
        if (channelCredentials != null) {
            account.setChannelInfo(Map.of("appId", channelCredentials.appId(),
                "appPrivateKey", channelCredentials.appPrivateKey()));
        }
        return account;
    }
}
