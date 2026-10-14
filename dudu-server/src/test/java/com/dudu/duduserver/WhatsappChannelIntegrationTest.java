package com.dudu.duduserver;

import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.dudu.duduserver.channel.ChannelInboundMessage;
import com.dudu.duduserver.constant.ChannelEnum;
import com.dudu.duduserver.constant.MessageDirectionEnum;
import com.dudu.duduserver.entity.UserDO;
import com.dudu.duduserver.entity.UserGroupDO;
import com.dudu.duduserver.service.DeskInboundService;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MvcResult;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.function.Consumer;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * WhatsApp 渠道四件套在共享 MySQL 评审库（dudu_review_whatsapp，本类自建自删，不触开发库）
 * 与真实 HTTP 边界验收（issue #112）：GET 三参握手按官方口径回显 hub.challenge 裸值纯文本、
 * X-Hub-Signature-256 验签通过后官方信封的全部消息类型按契约落库（statuses 与管理面字段变更
 * 只应答）、纯文本发送经 Messages API 如实落库受理与渠道拒绝、入站素材按两步下载代理经
 * Bearer 取回字节（回调三键账号如实受限）。报文与黄金密钥见 {@link WhatsappGolden}，渠道
 * Graph API 用本地替身按官方响应形状应答，不模拟假成功。
 */
@SpringBootTest(properties = {"dudu.auth.jwt-secret=integration-test-secret"},
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureMockMvc
@EnabledIfEnvironmentVariable(named = "DUDU_INTEGRATION_TEST", matches = "true")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class WhatsappChannelIntegrationTest extends DeskIntegrationSupport {

    private static final long COMPANY_ID = 796112L;

    // 渠道 API 替身：静态启动一次，地址经 dudu.channel.whatsapp.api-base 注入真实实现
    private static final HttpServer API = startApiStub();
    private static final List<String> sendRequests = new CopyOnWriteArrayList<>();
    private static final List<String> sendBodies = new CopyOnWriteArrayList<>();
    private static final List<String> sendAuth = new CopyOnWriteArrayList<>();
    private static final List<String> metaRequests = new CopyOnWriteArrayList<>();
    private static final List<String> metaAuth = new CopyOnWriteArrayList<>();
    private static final List<String> downloadRequests = new CopyOnWriteArrayList<>();
    private static final List<String> downloadAuth = new CopyOnWriteArrayList<>();
    private static volatile int sendStatus = 200;
    private static volatile String sendBody = WhatsappGolden.SEND_OK;
    private static volatile int metaStatus = 200;
    private static volatile int downloadStatus = 200;

    // 评审库连接参数由环境变量给出（任务规定四件套），缺失即失败禁止回落开发库
    private static volatile String database;
    private static volatile String dbUser;
    private static volatile String dbPassword;
    private static volatile String dbAdminUrl;

    private static HttpServer startApiStub() {
        try {
            HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            // 官方 §5.3：POST /{version}/{phone_number_id}/messages
            server.createContext("/v23.0/" + WhatsappGolden.PHONE_NUMBER_ID + "/messages", exchange -> {
                sendRequests.add(exchange.getRequestMethod() + " " + exchange.getRequestURI());
                sendBodies.add(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
                sendAuth.add(exchange.getRequestHeaders().getFirst("Authorization"));
                respond(exchange, sendStatus, sendBody);
            });
            // 官方 §5.6 第一步：GET /{version}/{media_id} 换临时下载地址；失效（7 天后）回官方 error
            server.createContext("/v23.0/" + WhatsappGolden.MEDIA_ID, exchange -> {
                metaRequests.add(exchange.getRequestMethod() + " " + exchange.getRequestURI());
                metaAuth.add(exchange.getRequestHeaders().getFirst("Authorization"));
                String downloadUrl = "http://127.0.0.1:" + server.getAddress().getPort()
                    + "/whatsapp_business/attachments/?mid=" + WhatsappGolden.MEDIA_ID;
                respond(exchange, metaStatus, metaStatus == 200
                    ? WhatsappGolden.MEDIA_META.formatted(downloadUrl) : WhatsappGolden.MEDIA_ERROR);
            });
            // 官方 §5.6 第二步：对 url 带 Bearer 取媒体二进制；失效时按纯文本拒绝
            server.createContext("/whatsapp_business/attachments/", exchange -> {
                downloadRequests.add(exchange.getRequestMethod() + " " + exchange.getRequestURI());
                downloadAuth.add(exchange.getRequestHeaders().getFirst("Authorization"));
                if (downloadStatus == 200) {
                    exchange.getResponseHeaders().set("Content-Type", "image/jpeg");
                    exchange.sendResponseHeaders(200, WhatsappGolden.IMAGE_BYTES.length);
                    exchange.getResponseBody().write(WhatsappGolden.IMAGE_BYTES);
                    exchange.close();
                } else {
                    respond(exchange, downloadStatus, "lookaside expired");
                }
            });
            server.start();
            return server;
        } catch (IOException e) {
            throw new IllegalStateException("WhatsApp API 替身启动失败", e);
        }
    }

    private static void respond(HttpExchange exchange, int status, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        exchange.sendResponseHeaders(status, bytes.length);
        exchange.getResponseBody().write(bytes);
        exchange.close();
    }

    @DynamicPropertySource
    static void contextProperties(DynamicPropertyRegistry registry) {
        String url = System.getenv("DUDU_TEST_JDBC_URL");
        dbUser = System.getenv("DUDU_TEST_DB_USER");
        dbPassword = System.getenv("DUDU_TEST_DB_PASSWORD");
        // 环境变量四件套缺一即失败：杜绝回落 application.yaml 直连开发库 dudu
        if (url == null || dbUser == null || dbPassword == null) {
            throw new IllegalStateException("WhatsApp 集成测试必须显式提供 DUDU_TEST_JDBC_URL/"
                + "DUDU_TEST_DB_USER/DUDU_TEST_DB_PASSWORD，禁止回落默认数据源");
        }
        String pathless = url.split("\\?")[0];
        database = pathless.substring(pathless.lastIndexOf('/') + 1);
        if (!database.startsWith("dudu_review_whatsapp")) {
            throw new IllegalStateException("本测试只允许使用 dudu_review_whatsapp 评审库，实际库：" + database);
        }
        // 管理连接指向实例根（去掉库名段、保留连接参数），负责评审库自建自删
        dbAdminUrl = url.replaceFirst("/" + database + "\\?", "?");
        JdbcTemplate admin = new JdbcTemplate(new DriverManagerDataSource(dbAdminUrl, dbUser, dbPassword));
        admin.execute("DROP DATABASE IF EXISTS " + database);
        admin.execute("CREATE DATABASE " + database + " CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci");
        registry.add("spring.datasource.url", () -> url);
        registry.add("spring.datasource.username", () -> dbUser);
        registry.add("spring.datasource.password", () -> dbPassword);
        registry.add("dudu.channel.whatsapp.api-base",
            () -> "http://127.0.0.1:" + API.getAddress().getPort());
    }

    @AfterAll
    void dropDatabase() {
        new JdbcTemplate(new DriverManagerDataSource(dbAdminUrl, dbUser, dbPassword))
            .execute("DROP DATABASE IF EXISTS " + database);
    }

    @Autowired DeskInboundService deskInboundService;

    private long channelWhatsapp;
    private long channelCallbackOnly;
    private long channelThin;
    private String scopedToken;

    @BeforeAll
    void seed() throws Exception {
        companies.createCompany(company(COMPANY_ID, "waowner", "WhatsApp验收企业"), 1L);
        UserGroupDO group = group(COMPANY_ID, "WhatsApp组");
        channelWhatsapp = channel(COMPANY_ID, group.getGroupId(), ChannelEnum.WHATSAPP, "WhatsApp全量",
            Map.of("url", "https://dudu.example.com/api/channels/wa-full/callback",
                "appSecret", WhatsappGolden.APP_SECRET, "verifyToken", WhatsappGolden.VERIFY_TOKEN,
                "accessToken", "SYSTEM_USER_TOKEN", "phoneNumberId", WhatsappGolden.PHONE_NUMBER_ID));
        // 只配回调三键：可握手可收推送，发送与素材读取如实受限
        channelCallbackOnly = channel(COMPANY_ID, group.getGroupId(), ChannelEnum.WHATSAPP, "仅回调三键",
            Map.of("url", "https://dudu.example.com/api/channels/wa-callback/callback",
                "appSecret", WhatsappGolden.APP_SECRET, "verifyToken", WhatsappGolden.VERIFY_TOKEN));
        // 缺验签材料：握手按不支持应答
        channelThin = channel(COMPANY_ID, group.getGroupId(), ChannelEnum.WHATSAPP, "仅配置回调地址",
            Map.of("url", "https://dudu.example.com/api/channels/wa-thin/callback"));
        UserDO scoped = plainUser(COMPANY_ID, "wa.scoped", "坐席甲");
        members.save(member(COMPANY_ID, scoped.getUserId(), group.getGroupId()));
        scopedToken = login(COMPANY_ID, "wa.scoped");
    }

    @BeforeEach
    void resetStub() {
        sendRequests.clear();
        sendBodies.clear();
        sendAuth.clear();
        metaRequests.clear();
        metaAuth.clear();
        downloadRequests.clear();
        downloadAuth.clear();
        sendStatus = 200;
        sendBody = WhatsappGolden.SEND_OK;
        metaStatus = 200;
        downloadStatus = 200;
    }

    @Test
    void handshakeEchoesChallengeBareValueAndRejectsEverythingElse() throws Exception {
        // 官方三参握手（whatsapp.md §3.2）：200 + hub.challenge 裸值纯文本（回 JSON 即握手失败）
        MvcResult ok = mvc.perform(get("/api/channels/" + channelWhatsapp + "/callback")
                .queryParam("hub.mode", "subscribe").queryParam("hub.challenge", WhatsappGolden.CHALLENGE)
                .queryParam("hub.verify_token", WhatsappGolden.VERIFY_TOKEN)).andReturn();
        assertThat(ok.getResponse().getStatus()).isEqualTo(200);
        assertThat(ok.getResponse().getContentAsString()).isEqualTo(WhatsappGolden.CHALLENGE);
        assertThat(ok.getResponse().getContentType()).startsWith("text/plain");

        // verify_token 不匹配、hub.mode 非 subscribe 或缺失：拒绝；缺验签材料账号按不支持应答
        assertThat(handshakeStatus("wrong-token", "subscribe")).isEqualTo(403);
        assertThat(handshakeStatus(WhatsappGolden.VERIFY_TOKEN, "denied")).isEqualTo(403);
        assertThat(handshakeStatus(WhatsappGolden.VERIFY_TOKEN, null)).isEqualTo(403);
        assertThat(mvc.perform(get("/api/channels/" + channelThin + "/callback")
                    .queryParam("hub.mode", "subscribe").queryParam("hub.challenge", WhatsappGolden.CHALLENGE)
                    .queryParam("hub.verify_token", WhatsappGolden.VERIFY_TOKEN))
                .andReturn().getResponse().getStatus()).isEqualTo(501);
    }

    // 指定 verify_token 与 hub.mode 的握手状态码（mode 为 null 即参数缺失）
    private int handshakeStatus(String token, String mode) throws Exception {
        var request = get("/api/channels/" + channelWhatsapp + "/callback")
            .queryParam("hub.challenge", WhatsappGolden.CHALLENGE)
            .queryParam("hub.verify_token", token);
        if (mode != null) {
            request = request.queryParam("hub.mode", mode);
        }
        return mvc.perform(request).andReturn().getResponse().getStatus();
    }

    @Test
    void signedInboundPersistsEveryMessageTypeAndOnlyAnswersEvents() throws Exception {
        // 官方 §5.1 黄金文本：签名验证 + 访客与消息落库（名称取 contacts[].profile.name）
        MvcResult text = push(WhatsappGolden.GOLDEN_TEXT, WhatsappGolden.GOLDEN_SIGNATURE);
        assertThat(text.getResponse().getStatus()).isEqualTo(200);
        assertThat(text.getResponse().getContentAsString()).isEqualTo("success");
        Map<String, Object> visitor = jdbc.queryForMap(
            "SELECT name, external_user_id FROM visitor WHERE company_channel_id = ? AND external_user_id = ?",
            channelWhatsapp, "16505551234");
        assertThat(visitor.get("name")).isEqualTo("Sheena Nelson");
        assertMessage(WhatsappGolden.WAMID_IN, body -> {
            assertThat(body.getStr("type")).isEqualTo("text");
            assertThat(body.getStr("text")).isEqualTo("Does it come in another color?");
        });
        // 同 wamid 重放幂等：仍只有一条
        assertThat(push(WhatsappGolden.GOLDEN_TEXT, WhatsappGolden.GOLDEN_SIGNATURE)
            .getResponse().getContentAsString()).isEqualTo("success");
        assertThat(messageCount(WhatsappGolden.WAMID_IN)).isEqualTo(1);

        // 媒体与位置各 type（whatsapp.md §2.3 官方样例同形）：按契约映射统一消息体
        assertInbound("wamid.IMAGE1", "image", "\"image\":{\"caption\":\"Check out this product listing\","
            + "\"id\":\"" + WhatsappGolden.MEDIA_ID + "\",\"mime_type\":\"image/jpeg\",\"sha256\":\"SfI=\"}",
            body -> {
                assertThat(body.getJSONObject("media").getStr("id")).isEqualTo(WhatsappGolden.MEDIA_ID);
                // 载荷灰度直带的 url 需 Bearer 下载，不是公开直链，绝不进媒体引用
                assertThat(body.getJSONObject("media").containsKey("url")).isFalse();
            });
        assertInbound("wamid.AUDIO1", "audio",
            "\"audio\":{\"id\":\"AUD1\",\"mime_type\":\"audio/ogg; codecs=opus\",\"sha256\":\"A\",\"voice\":true}",
            body -> assertThat(body.getJSONObject("media").getStr("id")).isEqualTo("AUD1"));
        assertInbound("wamid.VIDEO1", "video",
            "\"video\":{\"caption\":\"Look at this\",\"id\":\"VID1\",\"mime_type\":\"video/mp4\",\"sha256\":\"V\"}",
            body -> assertThat(body.getJSONObject("media").getStr("id")).isEqualTo("VID1"));
        assertInbound("wamid.DOC1", "document", "\"document\":{\"caption\":\"Catalog\","
            + "\"filename\":\"product catalog.pdf\",\"id\":\"DOC1\",\"mime_type\":\"application/pdf\","
            + "\"sha256\":\"D\"}", body -> {
                assertThat(body.getStr("type")).isEqualTo("file");
                assertThat(body.getJSONObject("media").getStr("name")).isEqualTo("product catalog.pdf");
            });
        assertInbound("wamid.STK1", "sticker",
            "\"sticker\":{\"id\":\"STK1\",\"mime_type\":\"image/webp\",\"sha256\":\"S\"}",
            body -> assertThat(body.getJSONObject("media").getStr("id")).isEqualTo("STK1"));
        // 官方 location 样例：名称优先作 label
        assertInbound("wamid.LOC1", "location", "\"location\":{\"address\":\"H menjal rank lane street\","
            + "\"latitude\":22.913324,\"longitude\":72.670941,\"name\":\"Rocket Shop\"}", body -> {
                assertThat(body.getStr("label")).isEqualTo("Rocket Shop");
                assertThat(body.getDouble("latitude")).isEqualTo(22.913324);
                assertThat(body.getDouble("longitude")).isEqualTo(72.670941);
            });

        // 点按即来语：interactive.button_reply 与模板 quick-reply 的 button
        assertInbound("wamid.IBT1", "interactive", "\"interactive\":{\"type\":\"button_reply\","
            + "\"button_reply\":{\"id\":\"btn1\",\"title\":\"Yes, this works for me\"}}",
            body -> assertThat(body.getStr("text")).isEqualTo("Yes, this works for me"));
        assertInbound("wamid.BTN1", "button", "\"button\":{\"text\":\"No, thanks\",\"payload\":\"btn-no\"}",
            body -> assertThat(body.getStr("text")).isEqualTo("No, thanks"));

        // 契约无对应形态：reaction/contacts/order 如实落 unknown(originalType)
        assertInbound("wamid.RCT1", "reaction", "\"reaction\":{\"message_id\":\""
            + WhatsappGolden.WAMID_IN + "\",\"emoji\":\"👍\"}",
            body -> assertThat(body.getStr("type") + "/" + body.getStr("originalType"))
                .isEqualTo("unknown/reaction"));
        assertInbound("wamid.CTC1", "contacts",
            "\"contacts\":[{\"wa_id\":\"16315551234\",\"profile\":{\"name\":\"Contact Person\"}}]",
            body -> assertThat(body.getStr("type") + "/" + body.getStr("originalType"))
                .isEqualTo("unknown/contacts"));
        assertInbound("wamid.ORD1", "order", "\"order\":{\"catalog_id\":\"CAT1\",\"text\":\"order-text\","
            + "\"product_items\":[{\"product_retailer_id\":\"SKU1\",\"quantity\":1,\"item_price\":10.0,"
            + "\"currency\":\"USD\"}]}", body -> assertThat(body.getStr("originalType")).isEqualTo("order"));

        // statuses（官方 §5.2 delivered）与管理面字段变更：只应答 success，不落任何消息
        int beforeEvents = totalMessages();
        String statuses = WhatsappGolden.envelope(null, null).replace("\"messages\":[]", "\"statuses\":[{"
            + "\"id\":\"wamid.ST1\",\"status\":\"delivered\",\"timestamp\":\"1750263773\","
            + "\"recipient_id\":\"16505551234\"}]");
        assertThat(push(statuses, sign(statuses)).getResponse().getContentAsString()).isEqualTo("success");
        String management = "{\"object\":\"whatsapp_business_account\",\"entry\":[{\"id\":"
            + "\"102290129340398\",\"changes\":[{\"field\":\"account_update\",\"value\":{"
            + "\"event\":\"ACCOUNT_UPDATE\"}}]}]}";
        assertThat(push(management, sign(management)).getResponse().getContentAsString()).isEqualTo("success");
        assertThat(totalMessages()).isEqualTo(beforeEvents);

        // 签名篡改 / 缺头 / appSecret 不符：一律拒绝且不落库；验签通过但报文损坏按参数错误
        int before = totalMessages();
        assertThat(push(WhatsappGolden.GOLDEN_TEXT, "sha256=" + "0".repeat(64))
            .getResponse().getStatus()).isEqualTo(403);
        assertThat(push(WhatsappGolden.GOLDEN_TEXT, sign(WhatsappGolden.GOLDEN_TEXT, "another-secret"))
            .getResponse().getStatus()).isEqualTo(403);
        assertThat(mvc.perform(post("/api/channels/" + channelWhatsapp + "/callback")
                .contentType(new MediaType(MediaType.APPLICATION_JSON, StandardCharsets.UTF_8))
                .content(WhatsappGolden.GOLDEN_TEXT)).andReturn().getResponse().getStatus()).isEqualTo(403);
        assertThat(push("not json", sign("not json")).getResponse().getStatus()).isEqualTo(400);
        assertThat(totalMessages()).isEqualTo(before);
    }

    @Test
    void sendPersistsRealReceiptAndChannelRejectionHonestly() throws Exception {
        long visitorId = newVisitor(channelWhatsapp, "16315551234", "想咨询发货时间");

        // 真实发送实现：Bearer 系统令牌 POST /{version}/{phone_number_id}/messages（官方 §5.3）
        JSONObject sent = data(send(scopedToken, visitorId, body("wa-cr-1", "好的，今天发出")));
        assertThat(sent.getJSONObject("delivery").getStr("state")).isEqualTo("sent");
        Map<String, Object> saved = jdbc.queryForMap("""
            SELECT send_status, external_message_id, failure_reason FROM message
            WHERE visitor_id = ? AND client_request_id = 'wa-cr-1'
            """, visitorId);
        assertThat(saved.get("send_status")).isEqualTo("sent");
        assertThat(saved.get("external_message_id")).isEqualTo(WhatsappGolden.WAMID_SENT);
        assertThat(saved.get("failure_reason")).isNull();
        assertThat(sendRequests).containsExactly("POST /v23.0/" + WhatsappGolden.PHONE_NUMBER_ID + "/messages");
        assertThat(sendAuth).containsExactly("Bearer SYSTEM_USER_TOKEN");
        JSONObject payload = JSONUtil.parseObj(sendBodies.get(0));
        assertThat(payload.getStr("messaging_product")).isEqualTo("whatsapp");
        assertThat(payload.getStr("recipient_type")).isEqualTo("individual");
        assertThat(payload.getStr("to")).isEqualTo("16315551234");
        assertThat(payload.getJSONObject("text").getStr("body")).isEqualTo("好的，今天发出");

        // 渠道拒绝（官方错误码 131047）：失败原因原样透出并落库，不冒成功
        sendStatus = 400;
        sendBody = WhatsappGolden.SEND_REJECTED;
        JSONObject failed = data(send(scopedToken, visitorId, body("wa-cr-2", "稍等，我查一下")));
        assertThat(failed.getJSONObject("delivery").getStr("state")).isEqualTo("failed");
        assertThat(failed.getJSONObject("delivery").getStr("reason"))
            .isEqualTo("WhatsApp消息发送失败：131047 (#131047) Re-engagement message"
                + " Message failed to send because more than 24 hours have passed");
        Map<String, Object> failedRow = jdbc.queryForMap("""
            SELECT send_status, external_message_id, failure_reason FROM message
            WHERE visitor_id = ? AND client_request_id = 'wa-cr-2'
            """, visitorId);
        assertThat(failedRow.get("send_status")).isEqualTo("failed");
        assertThat(failedRow.get("external_message_id")).isNull();
        assertThat(failedRow.get("failure_reason").toString()).contains("131047")
            .contains("more than 24 hours have passed");

        // 只配回调三键的账号：能力受限（12200），未发起任何渠道调用
        long restrictedVisitor = newVisitor(channelCallbackOnly, "CALLBACK_ONLY_1", "受限访客");
        int callsBefore = sendRequests.size();
        JSONObject restricted = send(scopedToken, restrictedVisitor, body("wa-cr-3", "试试发送"));
        assertThat(restricted.getInt("code")).isEqualTo(12200);
        assertThat(restricted.getStr("msg")).contains("渠道发送凭据未配置");
        assertThat(sendRequests).hasSize(callsBefore);
    }

    @Test
    void mediaProxiesTwoStepDownloadAndRestrictsHonestWithoutCredentials() throws Exception {
        // 入站图片（webhook 媒体 id）：媒体读取按契约走服务端两步代理
        long mediaMessageId = newMediaMessage(channelWhatsapp, "16505551000");
        MvcResult ok = mvc.perform(get("/api/desk/messages/" + mediaMessageId + "/media")
                .header("Authorization", "Bearer " + scopedToken)).andReturn();
        assertThat(ok.getResponse().getStatus()).isEqualTo(200);
        assertThat(ok.getResponse().getContentAsByteArray()).isEqualTo(WhatsappGolden.IMAGE_BYTES);
        assertThat(ok.getResponse().getContentType()).startsWith("image/jpeg");
        // 官方 §5.6 两步都带 Bearer：GET /{version}/{media_id} → 临时 url → 二进制
        assertThat(metaRequests).containsExactly("GET /v23.0/" + WhatsappGolden.MEDIA_ID);
        assertThat(metaAuth).containsExactly("Bearer SYSTEM_USER_TOKEN");
        assertThat(downloadRequests).containsExactly("GET /whatsapp_business/attachments/?mid="
            + WhatsappGolden.MEDIA_ID);
        assertThat(downloadAuth).containsExactly("Bearer SYSTEM_USER_TOKEN");

        // 媒体 id 失效（webhook 内 7 天后）：渠道 error 原样透出（13100）
        metaStatus = 404;
        JSONObject channelError = errorOf(mvc.perform(get("/api/desk/messages/" + mediaMessageId + "/media")
                .header("Authorization", "Bearer " + scopedToken)).andReturn());
        assertThat(channelError.getInt("code")).isEqualTo(13100);
        assertThat(channelError.getStr("msg")).contains("Media expired or not available");

        // 只配回调三键的账号：素材读取受限（12200），未发起任何渠道调用
        long restrictedMessage = newMediaMessage(channelCallbackOnly, "CALLBACK_ONLY_2");
        int callsBefore = metaRequests.size();
        JSONObject restricted = errorOf(mvc.perform(get("/api/desk/messages/" + restrictedMessage + "/media")
                .header("Authorization", "Bearer " + scopedToken)).andReturn());
        assertThat(restricted.getInt("code")).isEqualTo(12200);
        assertThat(restricted.getStr("msg")).contains("渠道素材凭据未配置");
        assertThat(metaRequests).hasSize(callsBefore);
    }

    // ---------- 回调推送与 Desk 侧公共小工具（与既有集成测试同口径） ----------

    // 推送一条类型消息并断言落库内容；签名现场计算（HMAC 正确性由 WhatsappProtocolTest 锚定）
    private void assertInbound(String wamid, String type, String typeJson,
                               Consumer<JSONObject> assertions) throws Exception {
        String payload = WhatsappGolden.envelope("16505551234", WhatsappGolden.message(wamid, type, typeJson));
        MvcResult result = push(payload, sign(payload));
        assertThat(result.getResponse().getContentAsString()).isEqualTo("success");
        assertMessage(wamid, assertions);
    }

    // X-Hub-Signature-256 = "sha256=" + hex(HMAC-SHA256(appSecret, body 字节))（官方 §4.1）；
    // 报文含 emoji 且签名字节敏感，显式声明 UTF-8 保证与真实 WhatsApp 网关同为 UTF-8 字节
    private MvcResult push(String body, String signature) throws Exception {
        return mvc.perform(post("/api/channels/" + channelWhatsapp + "/callback")
                .header("X-Hub-Signature-256", signature)
                .contentType(new MediaType(MediaType.APPLICATION_JSON, StandardCharsets.UTF_8))
                .content(body))
            .andReturn();
    }

    private String sign(String body) {
        return sign(body, WhatsappGolden.APP_SECRET);
    }

    // 供错误密钥场景使用：用指定 secret 现场签名
    private String sign(String body, String secret) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return "sha256=" + java.util.HexFormat.of().formatHex(
                mac.doFinal(body.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException("测试签名构造失败", e);
        }
    }

    private void assertMessage(String wamid, Consumer<JSONObject> assertions) {
        Map<String, Object> row = jdbc.queryForMap("""
            SELECT m.* FROM message m JOIN visitor v ON v.visitor_id = m.visitor_id
            WHERE m.external_message_id = ?
            """, wamid);
        assertThat(row.get("direction")).isEqualTo("incoming");
        assertions.accept(JSONUtil.parseObj(row.get("content").toString()));
    }

    private int messageCount(String wamid) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM message WHERE external_message_id = ?",
            Integer.class, wamid);
    }

    private int totalMessages() {
        return jdbc.queryForObject("SELECT COUNT(*) FROM message", Integer.class);
    }

    private long newVisitor(long channelId, String externalUserId, String firstText) {
        deskInboundService.accept(channels.getById(channelId), new ChannelInboundMessage(channelId,
            externalUserId, null, null, List.of(), "seed-" + externalUserId,
            MessageDirectionEnum.INCOMING, Map.of("type", "text", "text", firstText)));
        return jdbc.queryForObject(
            "SELECT visitor_id FROM visitor WHERE company_id = ? AND company_channel_id = ? AND external_user_id = ?",
            Long.class, COMPANY_ID, channelId, externalUserId);
    }

    // 入站图片消息（webhook 媒体 id 同形），供媒体代理契约验收
    private long newMediaMessage(long channelId, String externalUserId) {
        deskInboundService.accept(channels.getById(channelId), new ChannelInboundMessage(channelId,
            externalUserId, null, null, List.of(), "seed-media-" + externalUserId,
            MessageDirectionEnum.INCOMING, Map.of("type", "image",
                "media", Map.of("kind", "image", "id", WhatsappGolden.MEDIA_ID))));
        return jdbc.queryForObject("""
            SELECT m.message_id FROM message m JOIN visitor v ON v.visitor_id = m.visitor_id
            WHERE v.company_channel_id = ? AND v.external_user_id = ? ORDER BY m.sequence DESC LIMIT 1
            """, Long.class, channelId, externalUserId);
    }

    private JSONObject send(String token, long visitorId, String requestBody) throws Exception {
        return JSONUtil.parseObj(mvc.perform(post("/api/desk/visitors/" + visitorId + "/messages")
                .header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON).content(requestBody))
            .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isOk())
            .andReturn().getResponse().getContentAsString());
    }

    private String body(String clientRequestId, String text) {
        return JSONUtil.createObj().set("clientRequestId", clientRequestId).set("text", text).toString();
    }

    private JSONObject errorOf(MvcResult result) throws Exception {
        return JSONUtil.parseObj(result.getResponse().getContentAsString());
    }
}
