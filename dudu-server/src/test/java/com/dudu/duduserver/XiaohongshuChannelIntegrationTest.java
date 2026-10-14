package com.dudu.duduserver;

import cn.hutool.crypto.digest.DigestUtil;
import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.dudu.duduserver.channel.ChannelInboundMessage;
import com.dudu.duduserver.channel.xiaohongshu.XiaohongshuCrypto;
import com.dudu.duduserver.constant.ChannelEnum;
import com.dudu.duduserver.constant.MessageDirectionEnum;
import com.dudu.duduserver.entity.UserDO;
import com.dudu.duduserver.entity.UserGroupDO;
import com.dudu.duduserver.service.DeskInboundService;
import com.dudu.duduserver.testutil.IntegrationTestEnv;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.util.LinkedMultiValueMap;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * 小红书渠道在独立 MySQL 与真实 HTTP 边界验收：GET 四参数 echostr 握手（合法原样回显、
 * 非法签名拒绝、未配置凭据不支持）、POST 加密信封入站解析（该渠道全部五型 MsgType 按契约
 * 第 4 节统一落库——image/video 只有公开链接故媒体标识按「消息 ID:0」派生、事件回调族只
 * 应答 success）、纯文本发送成功与渠道失败如实落库、素材读取经真实读取实现返回链接字节与
 * 内容类型（渠道错误原样透传 13100、未配置凭据如实受限 12200、带链接引用按 11000 说明直用）。
 * 报文按官方 DC519884 信封与 mock-pulse xiaohongshu 适配器同形构造（黄金凭据见
 * mock-pulse tests/mod.rs 与 docs/research/channels/xiaohongshu.md §10/§11/§12），渠道 API 用
 * 本地替身按官方响应形状应答（DC010382/DC234367），不模拟假成功。运行前需重建 dudu_review_117。
 */
@SpringBootTest(properties = {"dudu.auth.jwt-secret=integration-test-secret"},
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureMockMvc
@EnabledIfEnvironmentVariable(named = "DUDU_INTEGRATION_TEST", matches = "true")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class XiaohongshuChannelIntegrationTest extends DeskIntegrationSupport {

    private static final long COMPANY_ID = 797001L;
    // mock-pulse xiaohongshu tests/mod.rs 黄金凭据
    private static final String TOKEN = "xhsTestToken";
    private static final String ENCODING_AES_KEY = "jWmYm7qr5nMoAUwZRjGtBxmz3KA1tkAj3ykkR6q2B2C";
    private static final String APP_ID = "wx5823bf96d3bd56c7";
    private static final String APP_SECRET = "xhs-app-secret";
    private static final String TIMESTAMP = "1648714429";
    private static final String NONCE = "0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d";
    // 固定随机数加密，保证用例可复现（§11.3 结构 random(16B) 供解密方跳过）
    private static final byte[] FIXED_RANDOM = "xhs-golden-rand1".getBytes(StandardCharsets.UTF_8);
    // 官方 DC010382/DC234367 响应示例原文形状
    private static final String TOKEN_OK = "{\"data\":{\"access_token\":\"ACCESS_TOKEN\",\"expire_in\":7200},"
        + "\"success\":true,\"msg\":\"success\",\"code\":0}";
    private static final String SEND_OK = "{\"success\":true,\"msg\":\"success\",\"code\":0}";
    private static final String SEND_REJECTED = "{\"success\":false,\"msg\":\"invalid access_token\",\"code\":40001}";
    private static final byte[] IMAGE_BYTES = "xhs-media-bytes".getBytes(StandardCharsets.UTF_8);

    // 渠道 API 替身：静态启动一次，地址经 dudu.channel.xiaohongshu.api-base 注入真实发送实现
    private static final HttpServer API = startApiStub();
    private static final List<String> apiRequests = new CopyOnWriteArrayList<>();
    private static final List<String> sendBodies = new CopyOnWriteArrayList<>();
    private static volatile String tokenBody = TOKEN_OK;
    private static volatile String sendBody = SEND_OK;

    @DynamicPropertySource
    static void contextProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", IntegrationTestEnv::jdbcUrl);
        registry.add("spring.datasource.username", IntegrationTestEnv::dbUser);
        registry.add("spring.datasource.password", IntegrationTestEnv::dbPassword);
        // 真实发送实现全程走本地替身：请求与响应都按官方接口形状对拍
        registry.add("dudu.channel.xiaohongshu.api-base",
            () -> "http://127.0.0.1:" + API.getAddress().getPort());
    }

    private static HttpServer startApiStub() {
        try {
            HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            // 官方 DC010382：POST /api/rmp/token（JSON body appid/secret）
            server.createContext("/api/rmp/token", exchange -> {
                apiRequests.add(exchange.getRequestMethod() + " " + exchange.getRequestURI());
                sendBodies.add(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
                respond(exchange, tokenBody);
            });
            // 官方 DC234367：POST /api/rmp/message/custom?app_id=&access_token=
            server.createContext("/api/rmp/message/custom", exchange -> {
                apiRequests.add(exchange.getRequestMethod() + " " + exchange.getRequestURI());
                sendBodies.add(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
                respond(exchange, sendBody);
            });
            // 素材公开链接替身：读取实现按已存引用直取字节
            server.createContext("/sns/img.jpg", exchange -> {
                apiRequests.add(exchange.getRequestMethod() + " " + exchange.getRequestURI());
                exchange.getResponseHeaders().set("Content-Type", "image/jpeg");
                exchange.sendResponseHeaders(200, IMAGE_BYTES.length);
                exchange.getResponseBody().write(IMAGE_BYTES);
                exchange.close();
            });
            server.start();
            return server;
        } catch (IOException e) {
            throw new IllegalStateException("小红书 API 替身启动失败", e);
        }
    }

    private static void respond(HttpExchange exchange, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        exchange.sendResponseHeaders(200, bytes.length);
        exchange.getResponseBody().write(bytes);
        exchange.close();
    }

    @Autowired DeskInboundService deskInboundService;

    private long channelXhs;
    private long channelCallbackOnly;
    private long channelBare;
    private String scopedToken;
    private String stubBase;

    @BeforeAll
    void seed() throws Exception {
        companies.createCompany(company(COMPANY_ID, "xhsowner", "小红书验收企业"), 1L);
        UserGroupDO group = group(COMPANY_ID, "小红书组");
        stubBase = "http://127.0.0.1:" + API.getAddress().getPort();
        channelXhs = channel(COMPANY_ID, group.getGroupId(), ChannelEnum.XIAOHONGSHU, "小红书", fullInfo());
        // 只有回调三件套（无 appSecret）的账号：推送可继续，发送凭据如实受限
        Map<String, Object> callbackOnly = new HashMap<>(fullInfo());
        callbackOnly.remove("appSecret");
        channelCallbackOnly = channel(COMPANY_ID, group.getGroupId(), ChannelEnum.XIAOHONGSHU, "仅回调小红书",
            callbackOnly);
        // 未配置任何渠道凭据的账号：握手与推送不支持、素材读取受限
        channelBare = channel(COMPANY_ID, group.getGroupId(), ChannelEnum.XIAOHONGSHU, "裸小红书",
            Map.of("url", "https://dudu.example.com/api/channels/xhs-bare/callback"));
        UserDO scoped = plainUser(COMPANY_ID, "xhs.scoped", "坐席丙");
        members.save(member(COMPANY_ID, scoped.getUserId(), group.getGroupId()));
        scopedToken = login(COMPANY_ID, "xhs.scoped");
    }

    @BeforeEach
    void resetStub() {
        apiRequests.clear();
        sendBodies.clear();
        tokenBody = TOKEN_OK;
        sendBody = SEND_OK;
    }

    @Test
    void verifyUrlEchoesEchostrForValidSignatureAndRejectsForgedOnes() throws Exception {
        // 官方 §10.4：校验通过原样返回 echostr 参数内容
        MvcResult ok = mvc.perform(get("/api/channels/" + channelXhs + "/callback")
                .params(query(handshakeQuery("echo-797001")))).andReturn();
        assertThat(ok.getResponse().getStatus()).isEqualTo(200);
        assertThat(ok.getResponse().getContentAsString()).isEqualTo("echo-797001");

        Map<String, String> forged = handshakeQuery("echo-797001");
        forged.put("signature", "0".repeat(40));
        MvcResult rejected = mvc.perform(get("/api/channels/" + channelXhs + "/callback")
                .params(query(forged))).andReturn();
        assertThat(rejected.getResponse().getStatus()).isEqualTo(403);
        assertThat(rejected.getResponse().getContentAsString()).isEmpty();

        // 未配置回调凭据的账号：按不支持应答
        MvcResult unsupported = mvc.perform(get("/api/channels/" + channelBare + "/callback")
                .params(query(handshakeQuery("echo-797001")))).andReturn();
        assertThat(unsupported.getResponse().getStatus()).isEqualTo(501);
    }

    @Test
    void receiveMapsAllFiveMsgTypesIntoUnifiedBodiesAndOnlyAnswersEvents() throws Exception {
        assertThat(push("""
            {"MsgId":"MSG_T","FromOpenId":"xhs-ext-text","ToAppId":"%s","MsgType":"text",
            "CreateTime":1648714429,"Content":"你好，想咨询发货时间"}""".formatted(APP_ID)
        ).getResponse().getContentAsString()).isEqualTo("success");
        assertThat(push("""
            {"MsgId":"MSG_I","FromOpenId":"xhs-ext-image","ToAppId":"%s","MsgType":"image",
            "CreateTime":1648714429,"PicUrl":"%s/sns/pushed.jpg"}""".formatted(APP_ID, stubBase)
        ).getResponse().getContentAsString()).isEqualTo("success");
        assertThat(push("""
            {"MsgId":"MSG_V","FromOpenId":"xhs-ext-video","ToAppId":"%s","MsgType":"video",
            "CreateTime":1648714429,"VideoUrl":"%s/sns/pushed.mp4"}""".formatted(APP_ID, stubBase)
        ).getResponse().getContentAsString()).isEqualTo("success");
        assertThat(push("""
            {"MsgId":"MSG_P","FromOpenId":"xhs-ext-item","ToAppId":"%s","MsgType":"item",
            "CreateTime":1648714429,"OutProductId":"OUT_PROD_1"}""".formatted(APP_ID)
        ).getResponse().getContentAsString()).isEqualTo("success");
        assertThat(push("""
            {"MsgId":"MSG_O","FromOpenId":"xhs-ext-order","ToAppId":"%s","MsgType":"order",
            "CreateTime":1648714429,"OutOrderId":"OUT_ORDER_1"}""".formatted(APP_ID)
        ).getResponse().getContentAsString()).isEqualTo("success");

        assertContent("xhs-ext-text", "MSG_T", body -> {
            assertThat(body.getStr("type")).isEqualTo("text");
            assertThat(body.getStr("text")).isEqualTo("你好，想咨询发货时间");
        });
        assertContent("xhs-ext-image", "MSG_I", body -> {
            assertThat(body.getStr("type")).isEqualTo("image");
            assertThat(body.getJSONObject("media").getStr("kind")).isEqualTo("image");
            // 小红书无媒体编号：标识按「消息 ID:0」派生（契约第 4 节），公开链接原样保存
            assertThat(body.getJSONObject("media").getStr("id")).isEqualTo("MSG_I:0");
            assertThat(body.getJSONObject("media").getStr("url")).isEqualTo(stubBase + "/sns/pushed.jpg");
        });
        assertContent("xhs-ext-video", "MSG_V", body -> {
            assertThat(body.getStr("type")).isEqualTo("video");
            assertThat(body.getJSONObject("media").getStr("kind")).isEqualTo("video");
            assertThat(body.getJSONObject("media").getStr("id")).isEqualTo("MSG_V:0");
            assertThat(body.getJSONObject("media").getStr("url")).isEqualTo(stubBase + "/sns/pushed.mp4");
        });
        assertContent("xhs-ext-item", "MSG_P", body -> {
            assertThat(body.getStr("type")).isEqualTo("card");
            assertThat(body.getStr("kind")).isEqualTo("item");
            assertThat(body.getStr("externalId")).isEqualTo("OUT_PROD_1");
        });
        assertContent("xhs-ext-order", "MSG_O", body -> {
            assertThat(body.getStr("type")).isEqualTo("card");
            assertThat(body.getStr("kind")).isEqualTo("order");
            assertThat(body.getStr("externalId")).isEqualTo("OUT_ORDER_1");
        });

        // 事件回调族不是访客消息：只应答 success，不产生访客与消息数据
        assertThat(push("{\"Event\":\"note_publish\",\"FromOpenId\":\"xhs-ext-event\"}")
            .getResponse().getContentAsString()).isEqualTo("success");
        assertThat(jdbc.queryForObject(
            "SELECT COUNT(*) FROM visitor WHERE company_id = ? AND external_user_id = 'xhs-ext-event'",
            Integer.class, COMPANY_ID)).isZero();
    }

    @Test
    void receiveAnswersHonestlyOnTamperedSignatureMalformedEnvelopeAndForeignAppId() throws Exception {
        // MsgSignature 不符：四参签名比对失败按拒绝应答
        String encrypt = encrypt("{\"MsgType\":\"text\",\"FromOpenId\":\"u\",\"Content\":\"hi\"}");
        String forged = "{\"Nonce\":\"" + NONCE + "\",\"Timestamp\":" + TIMESTAMP
            + ",\"Encrypt\":\"" + encrypt + "\",\"MsgSignature\":\"" + "0".repeat(40) + "\"}";
        MvcResult rejected = mvc.perform(post("/api/channels/" + channelXhs + "/callback")
                .contentType(MediaType.APPLICATION_JSON).content(forged)).andReturn();
        assertThat(rejected.getResponse().getStatus()).isEqualTo(403);
        assertThat(rejected.getResponse().getContentAsString()).isEmpty();

        // 信封缺失字段与非 JSON body：按参数错误应答
        assertThat(mvc.perform(post("/api/channels/" + channelXhs + "/callback")
                .contentType(MediaType.APPLICATION_JSON).content("{\"Nonce\":\"n\"}")).andReturn()
            .getResponse().getStatus()).isEqualTo(400);
        assertThat(mvc.perform(post("/api/channels/" + channelXhs + "/callback")
                .contentType(MediaType.APPLICATION_JSON).content("not-json")).andReturn()
            .getResponse().getStatus()).isEqualTo(400);

        // 签名对得上但密文损坏、尾部 appId 不符（receiveid 须为本账号）：都按参数错误应答
        assertThat(mvc.perform(post("/api/channels/" + channelXhs + "/callback")
                .contentType(MediaType.APPLICATION_JSON).content(envelopeOf("ciphertext"))).andReturn()
            .getResponse().getStatus()).isEqualTo(400);
        String foreign = new XiaohongshuCrypto().encrypt(ENCODING_AES_KEY, FIXED_RANDOM,
            "{\"MsgType\":\"text\",\"FromOpenId\":\"u\",\"Content\":\"hi\"}", "wx_other_appid");
        assertThat(mvc.perform(post("/api/channels/" + channelXhs + "/callback")
                .contentType(MediaType.APPLICATION_JSON).content(envelopeOf(foreign))).andReturn()
            .getResponse().getStatus()).isEqualTo(400);

        // 以上都不产生访客数据
        assertThat(jdbc.queryForObject(
            "SELECT COUNT(*) FROM visitor WHERE company_id = ? AND external_user_id = 'u'",
            Integer.class, COMPANY_ID)).isZero();
    }

    @Test
    void sendPersistsRealChannelOutcomeForSuccessAndFailure() throws Exception {
        long visitorId = newVisitor(channelXhs, "xhs-send-ext-1", "想咨询发货时间");

        // 真实发送实现：先取官方 DC010382 凭证再下发 DC234367 报文；接口不返回消息标识
        JSONObject sent = data(send(scopedToken, visitorId, body("xhs-cr-1", "好的，今天发出")));
        assertThat(sent.getJSONObject("delivery").getStr("state")).isEqualTo("sent");
        Map<String, Object> saved = jdbc.queryForMap("""
            SELECT send_status, external_message_id, failure_reason FROM message
            WHERE visitor_id = ? AND client_request_id = 'xhs-cr-1'
            """, visitorId);
        assertThat(saved.get("send_status")).isEqualTo("sent");
        assertThat(saved.get("external_message_id")).isNull();
        assertThat(saved.get("failure_reason")).isNull();
        assertThat(apiRequests.get(0)).isEqualTo("POST /api/rmp/token");
        JSONObject tokenPayload = JSONUtil.parseObj(sendBodies.get(0));
        assertThat(tokenPayload.getStr("appid")).isEqualTo(APP_ID);
        assertThat(tokenPayload.getStr("secret")).isEqualTo(APP_SECRET);
        assertThat(apiRequests.get(1)).startsWith("POST /api/rmp/message/custom?")
            .contains("app_id=" + APP_ID).contains("access_token=ACCESS_TOKEN");
        JSONObject sendPayload = JSONUtil.parseObj(sendBodies.get(1));
        assertThat(sendPayload.getStr("openid")).isEqualTo("xhs-send-ext-1");
        assertThat(sendPayload.getStr("msg_type")).isEqualTo("text");
        assertThat(sendPayload.getStr("content")).isEqualTo("好的，今天发出");

        // 渠道拒绝（success=false + code 非 0）：失败原因如实落库，不冒成功
        sendBody = SEND_REJECTED;
        JSONObject failed = data(send(scopedToken, visitorId, body("xhs-cr-2", "稍等，我查一下")));
        assertThat(failed.getJSONObject("delivery").getStr("state")).isEqualTo("failed");
        assertThat(failed.getJSONObject("delivery").getStr("reason"))
            .isEqualTo("小红书客服消息发送失败：40001 invalid access_token");
        Map<String, Object> failedRow = jdbc.queryForMap("""
            SELECT send_status, external_message_id, failure_reason FROM message
            WHERE visitor_id = ? AND client_request_id = 'xhs-cr-2'
            """, visitorId);
        assertThat(failedRow.get("send_status")).isEqualTo("failed");
        assertThat(failedRow.get("failure_reason")).isEqualTo("小红书客服消息发送失败：40001 invalid access_token");
        assertThat(failedRow.get("external_message_id")).isNull();
        // 失败不改接待状态：首次成功回复已转入 waiting，失败保持不变
        assertThat(jdbc.queryForObject("SELECT status FROM visitor WHERE visitor_id = ?", String.class, visitorId))
            .isEqualTo("waiting");
    }

    @Test
    void mediaServesLinkBytesThroughRealReaderAndReportsFailuresHonestly() throws Exception {
        // 小红书素材引用即公开链接：已存链接直取字节，内容类型按渠道响应返回
        long linkMessageId = seedMessage(channelXhs, "xhs-media-ext-1",
            Map.of("type", "image", "media", Map.of("kind", "image", "id", stubBase + "/sns/img.jpg")));
        MvcResult ok = mvc.perform(get("/api/desk/messages/" + linkMessageId + "/media")
                .header("Authorization", "Bearer " + scopedToken)).andReturn();
        assertThat(ok.getResponse().getStatus()).isEqualTo(200);
        assertThat(ok.getResponse().getContentAsByteArray()).isEqualTo(IMAGE_BYTES);
        assertThat(ok.getResponse().getContentType()).isEqualTo("image/jpeg");

        // 渠道错误（链接 404）：按第三方错误如实返回 13100，不冒成功也不伪装空字节
        long goneId = seedMessage(channelXhs, "xhs-media-ext-2",
            Map.of("type", "image", "media", Map.of("kind", "image", "id", stubBase + "/sns/gone.jpg")));
        JSONObject channelError = errorOf(mvc.perform(get("/api/desk/messages/" + goneId + "/media")
                .header("Authorization", "Bearer " + scopedToken)).andReturn());
        assertThat(channelError.getInt("code")).isEqualTo(13100);
        assertThat(channelError.getStr("msg")).contains("404");

        // 未配置回调凭据的账号：如实受限 12200，不发起渠道请求
        long unconfiguredId = seedMessage(channelBare, "xhs-media-ext-3",
            Map.of("type", "image", "media", Map.of("kind", "image", "id", stubBase + "/sns/img.jpg")));
        JSONObject restricted = errorOf(mvc.perform(get("/api/desk/messages/" + unconfiguredId + "/media")
                .header("Authorization", "Bearer " + scopedToken)).andReturn());
        assertThat(restricted.getInt("code")).isEqualTo(12200);
        assertThat(restricted.getStr("msg")).isEqualTo("渠道素材凭据未配置");

        // 解析入库的图片消息带公开链接：按参数错误说明直用 URL，不经本接口代理（11000）
        long withUrlId = seedMessage(channelXhs, "xhs-media-ext-4",
            Map.of("type", "image", "media",
                Map.of("kind", "image", "id", "MSG_I:0", "url", stubBase + "/sns/pushed.jpg")));
        JSONObject linked = errorOf(mvc.perform(get("/api/desk/messages/" + withUrlId + "/media")
                .header("Authorization", "Bearer " + scopedToken)).andReturn());
        assertThat(linked.getInt("code")).isEqualTo(11000);
        assertThat(linked.getStr("msg")).isEqualTo("该素材为公开链接，请直接使用其 URL");
        // 除成功一次下载外，其余用例不再触碰素材替身
        assertThat(apiRequests.stream().filter(r -> r.contains("/sns/img.jpg"))).hasSize(1);
    }

    // ---------- 回调报文构造（官方 §10.4/§11 与 mock-pulse build_crypto_push 同形） ----------

    // 明文加密后按信封字段序 Nonce → Timestamp(数字) → Encrypt → MsgSignature 推送
    private MvcResult push(String plaintextJson) throws Exception {
        return mvc.perform(post("/api/channels/" + channelXhs + "/callback")
                .contentType(MediaType.APPLICATION_JSON).content(envelopeOf(encrypt(plaintextJson))))
            .andReturn();
    }

    private String envelopeOf(String encrypt) {
        return "{\"Nonce\":\"" + NONCE + "\",\"Timestamp\":" + TIMESTAMP
            + ",\"Encrypt\":\"" + encrypt + "\",\"MsgSignature\":\"" + msgSignature(encrypt) + "\"}";
    }

    private String encrypt(String plaintext) {
        return new XiaohongshuCrypto().encrypt(ENCODING_AES_KEY, FIXED_RANDOM, plaintext, APP_ID);
    }

    private String msgSignature(String encrypt) {
        String[] parts = {TOKEN, TIMESTAMP, NONCE, encrypt};
        Arrays.sort(parts);
        return DigestUtil.sha1Hex(String.join("", parts));
    }

    // 握手 query：三参 signature（§10.4）
    private Map<String, String> handshakeQuery(String echostr) {
        String[] parts = {TOKEN, TIMESTAMP, NONCE};
        Arrays.sort(parts);
        Map<String, String> params = new HashMap<>();
        params.put("timestamp", TIMESTAMP);
        params.put("nonce", NONCE);
        params.put("signature", DigestUtil.sha1Hex(String.join("", parts)));
        params.put("echostr", echostr);
        return params;
    }

    private LinkedMultiValueMap<String, String> query(Map<String, String> source) {
        LinkedMultiValueMap<String, String> params = new LinkedMultiValueMap<>();
        source.forEach(params::add);
        return params;
    }

    private Map<String, Object> fullInfo() {
        Map<String, Object> info = new HashMap<>();
        info.put("url", "https://dudu.example.com/api/channels/xhs-full/callback");
        info.put("token", TOKEN);
        info.put("encodingAesKey", ENCODING_AES_KEY);
        info.put("appId", APP_ID);
        info.put("appSecret", APP_SECRET);
        return info;
    }

    // ---------- Desk 侧公共小工具（与既有集成测试同口径） ----------

    private void assertContent(String externalUserId, String externalMessageId,
                               java.util.function.Consumer<JSONObject> assertions) {
        Map<String, Object> row = jdbc.queryForMap("""
            SELECT m.* FROM message m JOIN visitor v ON v.visitor_id = m.visitor_id
            WHERE v.external_user_id = ? ORDER BY m.sequence DESC LIMIT 1
            """, externalUserId);
        assertThat(row.get("direction")).isEqualTo("incoming");
        assertThat(row.get("external_message_id")).isEqualTo(externalMessageId);
        assertions.accept(JSONUtil.parseObj(row.get("content").toString()));
    }

    private long newVisitor(long channelId, String externalUserId, String firstText) {
        deskInboundService.accept(channels.getById(channelId), new ChannelInboundMessage(channelId, externalUserId,
            null, null, List.of(), "seed-" + externalUserId, MessageDirectionEnum.INCOMING,
            Map.of("type", "text", "text", firstText)));
        return jdbc.queryForObject(
            "SELECT visitor_id FROM visitor WHERE company_id = ? AND company_channel_id = ? AND external_user_id = ?",
            Long.class, COMPANY_ID, channelId, externalUserId);
    }

    private long seedMessage(long channelId, String externalUserId, Map<String, Object> content) {
        deskInboundService.accept(channels.getById(channelId), new ChannelInboundMessage(channelId, externalUserId,
            null, null, List.of(), "seed-" + externalUserId, MessageDirectionEnum.INCOMING, content));
        return jdbc.queryForObject("""
            SELECT m.message_id FROM message m JOIN visitor v ON v.visitor_id = m.visitor_id
            WHERE v.external_user_id = ? ORDER BY m.sequence DESC LIMIT 1
            """, Long.class, externalUserId);
    }

    private JSONObject send(String token, long visitorId, String body) throws Exception {
        return JSONUtil.parseObj(mvc.perform(post("/api/desk/visitors/" + visitorId + "/messages")
                .header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isOk())
            .andReturn().getResponse().getContentAsString());
    }

    private String body(String clientRequestId, String text) {
        return JSONUtil.createObj().set("clientRequestId", clientRequestId).set("text", text).toString();
    }

    private JSONObject errorOf(MvcResult result) throws Exception {
        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        return JSONUtil.parseObj(result.getResponse().getContentAsString());
    }
}
