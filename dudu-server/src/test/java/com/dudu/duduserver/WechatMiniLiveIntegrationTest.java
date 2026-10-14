package com.dudu.duduserver;

import cn.hutool.crypto.digest.DigestUtil;
import com.dudu.duduserver.channel.wechatmini.WechatMiniCrypto;
import com.dudu.duduserver.constant.ChannelEnum;
import com.dudu.duduserver.entity.UserGroupDO;
import com.dudu.duduserver.testutil.IntegrationTestEnv;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.util.LinkedMultiValueMap;

import java.util.Arrays;
import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 小程序回调在真实 HTTP 与 MySQL 边界验收（docs/research/channels/wechat-mini.md §3、§4）：
 * GET 握手原样回显、明文/兼容/安全三模式经注册表分派落库、密文校验用 msg_signature、
 * 缺密钥按不支持、签名不符按拒绝、他用密文按参数错误；真实客服发送与素材读取需官方凭据，
 * 由单元替身覆盖。通过环境变量显式启用，运行前需重建 dudu_review。
 */
@SpringBootTest(properties = {"dudu.auth.jwt-secret=integration-test-secret"},
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureMockMvc
@EnabledIfEnvironmentVariable(named = "DUDU_INTEGRATION_TEST", matches = "true")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class WechatMiniLiveIntegrationTest extends DeskIntegrationSupport {

    private static final long COMPANY_ID = 788101L;
    private static final String CALLBACK_TOKEN = "mini-callback-token";
    // 官方服务器配置示例值（事实库 §3.2/§5.2）：AESKey 43 个 A、AppID
    private static final String ENCODING_AES_KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    private static final String APP_ID = "wxba5fad812f8e6fb9";
    private static final String TIMESTAMP = "1714112445";
    private static final String NONCE = "415670741";
    private static final byte[] FIXED_RANDOM = "707722b803182950".getBytes();

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", IntegrationTestEnv::jdbcUrl);
        registry.add("spring.datasource.username", IntegrationTestEnv::dbUser);
        registry.add("spring.datasource.password", IntegrationTestEnv::dbPassword);
    }

    private final WechatMiniCrypto crypto = new WechatMiniCrypto();

    private long channelMini;
    private long channelMiniTokenOnly;
    private long channelMiniNoInfo;

    @BeforeAll
    void seed() {
        companies.createCompany(company(COMPANY_ID, "miniowner", "小程序验收企业"), 1L);
        UserGroupDO group = group(COMPANY_ID, "小程序组");
        channelMini = channel(COMPANY_ID, group.getGroupId(), ChannelEnum.WECHAT_MINI, "微信小程序",
            Map.of("token", CALLBACK_TOKEN, "appId", APP_ID, "appSecret", "live-secret",
                "encodingAesKey", ENCODING_AES_KEY));
        // 只配回调 Token：可握手与明文验签，加密模式按不支持应答
        channelMiniTokenOnly = channel(COMPANY_ID, group.getGroupId(), ChannelEnum.WECHAT_MINI, "小程序缺密钥",
            Map.of("token", CALLBACK_TOKEN));
        channelMiniNoInfo = channel(COMPANY_ID, group.getGroupId(), ChannelEnum.WECHAT_MINI, "小程序空配置", Map.of());
    }

    @Test
    void handshakeEchoesEchostrOnlyForValidSignature() throws Exception {
        Map<String, String> params = plainParams();
        params.put("echostr", "echo-mini");
        assertThat(mvc.perform(get("/api/channels/" + channelMini + "/callback").params(queryParams(params)))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).isEqualTo("echo-mini");

        params.put("signature", "0".repeat(40));
        assertThat(mvc.perform(get("/api/channels/" + channelMini + "/callback").params(queryParams(params)))
            .andExpect(status().isForbidden()).andReturn().getResponse().getContentAsString()).isEmpty();

        // 无 Token 账号无法验签，按不支持应答；未知账号按不存在应答
        assertThat(mvc.perform(get("/api/channels/" + channelMiniNoInfo + "/callback")
            .params(queryParams(plainParams()))).andReturn().getResponse().getStatus()).isEqualTo(501);
        assertThat(mvc.perform(get("/api/channels/99999999/callback").params(queryParams(plainParams())))
            .andReturn().getResponse().getStatus()).isEqualTo(404);
    }

    @Test
    void plainPushCreatesVisitorAndMessage() throws Exception {
        MvcResult result = callback(channelMini, plainParams(), textPush("gh_mini", "mini-ext-plain", "你好，想咨询发货时间", "mini-m1"));
        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        assertThat(result.getResponse().getContentAsString()).isEqualTo("success");
        assertThat(messagesOf("mini-ext-plain")).isEqualTo(1);
    }

    @Test
    void tamperedPlainPushIsRejectedWithoutVisitorData() throws Exception {
        Map<String, String> tampered = plainParams();
        tampered.put("signature", "0".repeat(40));
        MvcResult result = callback(channelMini, tampered, textPush("gh_mini", "mini-ext-forged", "伪造", "mini-m2"));
        assertThat(result.getResponse().getStatus()).isEqualTo(403);
        assertThat(messagesOf("mini-ext-forged")).isZero();
    }

    @Test
    void compatibleEncryptedPushVerifiesMsgSignatureAndCreatesVisitor() throws Exception {
        // 兼容模式：明文殿后附 Encrypt（mock 同族包形），密文校验用 msg_signature
        String inner = """
            <xml>
               <ToUserName><![CDATA[gh_mini]]></ToUserName>
               <FromUserName><![CDATA[mini-ext-compat]]></FromUserName>
               <CreateTime>1482048670</CreateTime>
               <MsgType><![CDATA[text]]></MsgType>
               <Content><![CDATA[this is a test]]></Content>
               <MsgId>1234567890123456</MsgId>
            </xml>
            """;
        String cipher = crypto.encrypt(ENCODING_AES_KEY, FIXED_RANDOM, inner, APP_ID);
        String body = inner.stripTrailing().substring(0, inner.stripTrailing().length() - "</xml>".length())
            + "<Encrypt><![CDATA[" + cipher + "]]></Encrypt>\n</xml>";

        MvcResult result = callback(channelMini, encryptedParams(cipher), body);
        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        assertThat(result.getResponse().getContentAsString()).isEqualTo("success");
        assertThat(messagesOf("mini-ext-compat")).isEqualTo(1);
    }

    @Test
    void secureEncryptedPushAcceptsXmlAndOfficialJsonEnvelopes() throws Exception {
        // 安全模式 XML 信封（mock 基线包形）
        String cipher = crypto.encrypt(ENCODING_AES_KEY, FIXED_RANDOM,
            textPush("gh_mini", "mini-ext-secure-xml", "安全模式", "mini-m3"), APP_ID);
        String xmlEnvelope = "<xml><ToUserName><![CDATA[" + APP_ID + "]]></ToUserName>"
            + "<Encrypt><![CDATA[" + cipher + "]]></Encrypt></xml>";
        MvcResult xmlResult = callback(channelMini, encryptedParams(cipher), xmlEnvelope);
        assertThat(xmlResult.getResponse().getStatus()).isEqualTo(200);
        assertThat(messagesOf("mini-ext-secure-xml")).isEqualTo(1);

        // 官方安全模式 JSON 信封原文形状（§5.2）：数据格式选 JSON 的账号同包不同形
        cipher = crypto.encrypt(ENCODING_AES_KEY, FIXED_RANDOM,
            textPush("gh_mini", "mini-ext-secure-json", "JSON 信封", "mini-m4"), APP_ID);
        String jsonEnvelope = "{\"ToUserName\": \"" + APP_ID + "\", \"Encrypt\": \"" + cipher + "\"}";
        MvcResult jsonResult = callback(channelMini, encryptedParams(cipher), jsonEnvelope);
        assertThat(jsonResult.getResponse().getStatus()).isEqualTo(200);
        assertThat(messagesOf("mini-ext-secure-json")).isEqualTo(1);
    }

    @Test
    void encryptedPushAnswersHonestlyOnMissingKeyBadSignatureAndForeignAppId() throws Exception {
        String cipher = crypto.encrypt(ENCODING_AES_KEY, FIXED_RANDOM,
            textPush("gh_mini", "mini-ext-denied", "不应落库", "mini-m5"), APP_ID);
        String envelope = "<xml><Encrypt><![CDATA[" + cipher + "]]></Encrypt></xml>";

        // 未配置 EncodingAESKey/AppID：加密模式按不支持应答
        MvcResult unsupported = callback(channelMiniTokenOnly, encryptedParams(cipher), envelope);
        assertThat(unsupported.getResponse().getStatus()).isEqualTo(501);

        // msg_signature 不符按拒绝；签名相符但密文属于他小程序按参数错误
        Map<String, String> badSignature = encryptedParams(cipher);
        badSignature.put("msg_signature", "0".repeat(40));
        assertThat(callback(channelMini, badSignature, envelope).getResponse().getStatus()).isEqualTo(403);

        String foreign = crypto.encrypt(ENCODING_AES_KEY, FIXED_RANDOM,
            textPush("gh_mini", "mini-ext-denied", "他用密文", "mini-m6"), "wx_other_appid");
        MvcResult badRequest = callback(channelMini, encryptedParams(foreign),
            "<xml><Encrypt><![CDATA[" + foreign + "]]></Encrypt></xml>");
        assertThat(badRequest.getResponse().getStatus()).isEqualTo(400);

        assertThat(messagesOf("mini-ext-denied")).isZero();
    }

    // 渠道入站推送：真实 HTTP POST text/xml，返回完整 MVC 结果供状态与应答体断言
    private MvcResult callback(long channelId, Map<String, String> params, String body) throws Exception {
        return mvc.perform(post("/api/channels/" + channelId + "/callback").params(queryParams(params))
                .contentType(MediaType.valueOf("text/xml")).content(body))
            .andReturn();
    }

    private LinkedMultiValueMap<String, String> queryParams(Map<String, String> source) {
        LinkedMultiValueMap<String, String> params = new LinkedMultiValueMap<>();
        source.forEach(params::add);
        return params;
    }

    // 明文模式 query：三参 signature（官方 §5.1 口径）
    private Map<String, String> plainParams() {
        Map<String, String> params = new HashMap<>();
        params.put("timestamp", TIMESTAMP);
        params.put("nonce", NONCE);
        params.put("signature", signature(CALLBACK_TOKEN, TIMESTAMP, NONCE));
        return params;
    }

    // 加密模式 query：官方安全模式六参并存（§5.2），密文校验只用 msg_signature
    private Map<String, String> encryptedParams(String encrypt) {
        Map<String, String> params = plainParams();
        params.put("openid", "o9AgO5Kd5ggOC-bXrbNODIiE3bGY");
        params.put("encrypt_type", "aes");
        params.put("msg_signature", signature(CALLBACK_TOKEN, TIMESTAMP, NONCE, encrypt));
        return params;
    }

    private String signature(String... parts) {
        Arrays.sort(parts);
        return DigestUtil.sha1Hex(String.join("", parts));
    }

    private int messagesOf(String externalUserId) {
        Integer count = jdbc.queryForObject("""
            SELECT COUNT(*) FROM message m JOIN visitor v ON v.visitor_id = m.visitor_id
            WHERE v.company_id = ? AND v.external_user_id = ?
            """, Integer.class, COMPANY_ID, externalUserId);
        return count == null ? 0 : count;
    }
}
