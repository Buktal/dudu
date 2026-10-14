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
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * 微博渠道在共享评审 MySQL 与真实 HTTP 边界验收（docs/research/channels/weibo.md §3、§5、
 * §6）：GET 握手按官方黄金算例回显 echostr、非法签名拒绝；POST JSON 明文推送四类消息按
 * 契约统一落库、事件与被@只应答空串；纯文本客服消息发送成功与渠道失败如实落库；素材读取
 * 经真实读取实现返回字节与内容类型（渠道错误原样透传、未配置凭据如实受限）。报文按官方
 * §5 载荷原文与 mock-pulse weibo 适配器同形构造，渠道 API 用本地替身按官方响应形状应答，
 * 不模拟假成功。评审库在共享服务器上自建自删：测试开始先重置为全新库。
 */
@SpringBootTest(properties = {"dudu.auth.jwt-secret=integration-test-secret"},
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureMockMvc
@EnabledIfEnvironmentVariable(named = "DUDU_INTEGRATION_TEST", matches = "true")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class WeiboChannelIntegrationTest extends DeskIntegrationSupport {

    private static final long COMPANY_ID = 796001L;
    // 官方黄金算例（新手接入指南页逐字）：握手样例 echostr=dnPdpTZz85
    private static final String APP_SECRET = "xyz123xyz";
    private static final String TIMESTAMP = "1397022061823";
    private static final String NONCE = "57155157";
    private static final String SIGNATURE = "90e4c22c90a58f26526c2dd5b6c56c8822edeaa1";
    private static final String ECHOSTR = "dnPdpTZz85";
    private static final String ACCESS_TOKEN = "wb-token-796001";

    // 共享评审服务器：dudu_review 用户只授权 dudu_review_%.*，本渠道用 108 号库
    private static final String SERVER_JDBC_URL = "jdbc:mysql://127.0.0.1:3306";
    private static final String REVIEW_DB = "dudu_review_108";
    private static final String REVIEW_USER = "dudu_review";
    private static final String REVIEW_PASSWORD = "dudu_review_local";

    // 官方成功/错误响应示例形状
    private static final String SEND_OK = "{\"result\": true, \"sender_id\": \"123\","
        + " \"receiver_id\": \"2489518277\", \"type\": \"text\", \"data\": \"%7B%22text%22%3A%22ok%22%7D\"}";
    private static final String SEND_REJECTED = "{\"request\": \"/2/messages/reply.json\","
        + " \"error_code\": \"30001\", \"error\": \"REMOTE_SERVICE_ERROR\"}";
    private static final String MEDIA_FID_NOT_FOUND = "{\"request\": \"/2/mss/msget\","
        + " \"error_code\": \"30021\", \"error\": \"fid not found\"}";
    private static final byte[] IMAGE_BYTES = "weibo-media-bytes".getBytes(StandardCharsets.UTF_8);

    // 渠道 API 替身：静态启动一次，地址经 dudu.channel.weibo.* 注入真实发送/素材实现
    private static final HttpServer API = startApiStub();
    private static final List<String> apiRequests = new CopyOnWriteArrayList<>();
    private static final List<String> sendBodies = new CopyOnWriteArrayList<>();
    private static volatile String sendBody = SEND_OK;
    private static volatile String mediaJson;

    private static HttpServer startApiStub() {
        try {
            HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            // 官方客服消息：POST /2/messages/reply.json?access_token=
            server.createContext("/2/messages/reply.json", exchange -> {
                apiRequests.add(exchange.getRequestMethod() + " " + exchange.getRequestURI());
                sendBodies.add(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
                respond(exchange, sendBody);
            });
            // 官方素材下载：GET /2/mss/msget?access_token=&fid=，成功与普通 HTTP 下载相同
            server.createContext("/2/mss/msget", exchange -> {
                apiRequests.add(exchange.getRequestMethod() + " " + exchange.getRequestURI());
                if (mediaJson != null) {
                    respond(exchange, mediaJson);
                    return;
                }
                exchange.getResponseHeaders().set("Content-Type", "image/jpeg");
                exchange.sendResponseHeaders(200, IMAGE_BYTES.length);
                exchange.getResponseBody().write(IMAGE_BYTES);
                exchange.close();
            });
            server.start();
            return server;
        } catch (IOException e) {
            throw new IllegalStateException("微博 API 替身启动失败", e);
        }
    }

    private static void respond(HttpExchange exchange, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        exchange.sendResponseHeaders(200, bytes.length);
        exchange.getResponseBody().write(bytes);
        exchange.close();
    }

    @DynamicPropertySource
    static void contextProperties(DynamicPropertyRegistry registry) {
        resetReviewDatabase();
        registry.add("spring.datasource.url",
            () -> SERVER_JDBC_URL + "/" + REVIEW_DB + "?connectionTimeZone=Asia/Shanghai&characterEncoding=UTF-8");
        registry.add("spring.datasource.username", () -> REVIEW_USER);
        registry.add("spring.datasource.password", () -> REVIEW_PASSWORD);
        // 真实发送/素材实现全程走本地替身：请求与响应都按官方接口形状对拍
        registry.add("dudu.channel.weibo.api-base", () -> "http://127.0.0.1:" + API.getAddress().getPort());
        registry.add("dudu.channel.weibo.media-base", () -> "http://127.0.0.1:" + API.getAddress().getPort());
    }

    // 共享评审库自建自删：开始先重置为全新库，Flyway 空库迁移建表
    private static void resetReviewDatabase() {
        try (Connection connection = DriverManager.getConnection(SERVER_JDBC_URL, REVIEW_USER, REVIEW_PASSWORD);
             Statement statement = connection.createStatement()) {
            statement.execute("DROP DATABASE IF EXISTS " + REVIEW_DB);
            statement.execute("CREATE DATABASE " + REVIEW_DB + " CHARACTER SET utf8mb4");
        } catch (SQLException e) {
            throw new IllegalStateException("评审库重置失败：" + REVIEW_DB, e);
        }
    }

    @Autowired DeskInboundService deskInboundService;

    private String scopedToken;
    private long channelWeibo;
    private long channelCallbackOnly;
    private long channelNoInfo;

    @BeforeAll
    void seed() throws Exception {
        companies.createCompany(company(COMPANY_ID, "weiboowner", "微博验收企业"), 1L);
        UserGroupDO group = group(COMPANY_ID, "微博组");
        channelWeibo = channel(COMPANY_ID, group.getGroupId(), ChannelEnum.WEIBO, "微博", fullInfo());
        // 只有验签密钥（无 accessToken）的账号：推送可继续，发送/素材凭据如实受限
        channelCallbackOnly = channel(COMPANY_ID, group.getGroupId(), ChannelEnum.WEIBO, "仅回调微博",
            Map.of("url", "https://dudu.example.com/api/channels/weibo-callback/callback",
                "appSecret", APP_SECRET));
        // 无 App Secret 无法验签：回调按不支持应答
        channelNoInfo = channel(COMPANY_ID, group.getGroupId(), ChannelEnum.WEIBO, "空配置微博", Map.of());
        UserDO scoped = plainUser(COMPANY_ID, "weibo.scoped", "坐席丙");
        members.save(member(COMPANY_ID, scoped.getUserId(), group.getGroupId()));
        scopedToken = login(COMPANY_ID, "weibo.scoped");
    }

    @BeforeEach
    void resetStub() {
        apiRequests.clear();
        sendBodies.clear();
        sendBody = SEND_OK;
        mediaJson = null;
    }

    @Test
    void handshakeEchoesEchostrOnlyForValidSignature() throws Exception {
        Map<String, String> params = signedQuery();
        params.put("echostr", ECHOSTR);
        MvcResult ok = mvc.perform(get("/api/channels/" + channelWeibo + "/callback")
                .params(queryParams(params))).andReturn();
        assertThat(ok.getResponse().getStatus()).isEqualTo(200);
        assertThat(ok.getResponse().getContentAsString()).isEqualTo(ECHOSTR);

        Map<String, String> forged = signedQuery();
        forged.put("signature", "0".repeat(40));
        forged.put("echostr", ECHOSTR);
        MvcResult rejected = mvc.perform(get("/api/channels/" + channelWeibo + "/callback")
                .params(queryParams(forged))).andReturn();
        assertThat(rejected.getResponse().getStatus()).isEqualTo(403);
        assertThat(rejected.getResponse().getContentAsString()).isEmpty();

        // 无 App Secret 无法验签按不支持应答；未知账号按不存在应答
        assertThat(mvc.perform(get("/api/channels/" + channelNoInfo + "/callback")
                .params(queryParams(params))).andReturn().getResponse().getStatus()).isEqualTo(501);
        assertThat(mvc.perform(get("/api/channels/99999999/callback")
                .params(queryParams(params))).andReturn().getResponse().getStatus()).isEqualTo(404);
    }

    @Test
    void receiveMapsEveryMessageTypeIntoUnifiedBodiesAndOnlyAnswersEvents() throws Exception {
        // 四种普通消息逐条推送：每次应答 200 空串，统一消息体按契约第 4 节落库
        assertThat(push("7960010001", "text", "私信或留言内容", "{}")).isEmpty();
        assertThat(push("7960010002", "position", "我在这里: http://t.cn/zQgLLYO",
            "{\"longitude\": \"116.308586\", \"latitude\": \"39.982525\"}")).isEmpty();
        assertThat(push("7960010003", "voice", "发了一个语音消息",
            "{\"vfid\": 821804459, \"tovfid\": 821804469}")).isEmpty();
        assertThat(push("7960010004", "image", "发了一张图片",
            "{\"vfid\": 821804459, \"tovfid\": 821804469}")).isEmpty();

        assertContent("7960010001", body -> {
            assertThat(body.getStr("type")).isEqualTo("text");
            assertThat(body.getStr("text")).isEqualTo("私信或留言内容");
        });
        assertContent("7960010002", body -> {
            assertThat(body.getStr("type")).isEqualTo("location");
            assertThat(body.getDouble("latitude")).isEqualTo(39.982525d);
            assertThat(body.getDouble("longitude")).isEqualTo(116.308586d);
        });
        assertContent("7960010003", body -> {
            assertThat(body.getStr("type")).isEqualTo("audio");
            assertThat(body.getJSONObject("media").getStr("kind")).isEqualTo("audio");
            assertThat(body.getJSONObject("media").getStr("id")).isEqualTo("821804469");
        });
        assertContent("7960010004", body -> {
            assertThat(body.getStr("type")).isEqualTo("image");
            assertThat(body.getJSONObject("media").getStr("kind")).isEqualTo("image");
            assertThat(body.getJSONObject("media").getStr("id")).isEqualTo("821804469");
        });

        // 事件与被@推送不是访客消息：只应答 200 空串，不产生访客与消息数据
        assertThat(push("7960010005", "event", "关注事件消息", "{\"subtype\": \"follow\"}")).isEmpty();
        assertThat(push("7960010006", "mention", "被@的微博或评论文本信息",
            "{\"subtype\": \"status\", \"key\": \"MENTION_KEY\"}")).isEmpty();
        assertThat(jdbc.queryForObject(
            "SELECT COUNT(*) FROM visitor WHERE company_id = ? AND external_user_id IN"
                + " ('7960010005', '7960010006')", Integer.class, COMPANY_ID)).isZero();
    }

    @Test
    void sendPersistsRealChannelOutcomeForSuccessAndFailure() throws Exception {
        long visitorId = newVisitor(channelWeibo, "7960019001", "想咨询发货时间");

        // 真实发送实现：form 下发 reply.json，成功以 result==true 为准（无消息标识）
        JSONObject sent = data(send(scopedToken, visitorId, body("weibo-cr-1", "好的，今天发出")));
        assertThat(sent.getJSONObject("delivery").getStr("state")).isEqualTo("sent");
        Map<String, Object> saved = jdbc.queryForMap("""
            SELECT send_status, external_message_id, failure_reason FROM message
            WHERE visitor_id = ? AND client_request_id = 'weibo-cr-1'
            """, visitorId);
        assertThat(saved.get("send_status")).isEqualTo("sent");
        assertThat(saved.get("external_message_id")).isNull();
        assertThat(saved.get("failure_reason")).isNull();
        assertThat(apiRequests.get(0)).startsWith("POST /2/messages/reply.json?")
            .contains("access_token=" + ACCESS_TOKEN);
        Map<String, String> form = formFields(sendBodies.get(0));
        assertThat(form.get("receiver_id")).isEqualTo("7960019001");
        assertThat(form.get("type")).isEqualTo("text");
        assertThat(JSONUtil.parseObj(form.get("data")).getStr("text")).isEqualTo("好的，今天发出");

        // 渠道拒绝（通用错误形状）：失败原因如实落库，不冒成功
        sendBody = SEND_REJECTED;
        JSONObject failed = data(send(scopedToken, visitorId, body("weibo-cr-2", "稍等，我查一下")));
        assertThat(failed.getJSONObject("delivery").getStr("state")).isEqualTo("failed");
        assertThat(failed.getJSONObject("delivery").getStr("reason"))
            .isEqualTo("微博客服消息发送失败：30001 REMOTE_SERVICE_ERROR");
        Map<String, Object> failedRow = jdbc.queryForMap("""
            SELECT send_status, external_message_id, failure_reason FROM message
            WHERE visitor_id = ? AND client_request_id = 'weibo-cr-2'
            """, visitorId);
        assertThat(failedRow.get("send_status")).isEqualTo("failed");
        assertThat(failedRow.get("failure_reason")).isEqualTo("微博客服消息发送失败：30001 REMOTE_SERVICE_ERROR");
        assertThat(failedRow.get("external_message_id")).isNull();
        // 失败不改接待状态：首次成功回复已转入 waiting，失败保持不变
        assertThat(jdbc.queryForObject("SELECT status FROM visitor WHERE visitor_id = ?", String.class, visitorId))
            .isEqualTo("waiting");
    }

    @Test
    void mediaServesBytesThroughRealReaderAndReportsFailuresHonestly() throws Exception {
        long mediaMessageId = seedMessage(channelWeibo, "7960019101",
            Map.of("type", "image", "media", Map.of("kind", "image", "id", "821804469")));

        // 成功：字节与内容类型按渠道响应返回
        MvcResult ok = mvc.perform(get("/api/desk/messages/" + mediaMessageId + "/media")
                .header("Authorization", "Bearer " + scopedToken)).andReturn();
        assertThat(ok.getResponse().getStatus()).isEqualTo(200);
        assertThat(ok.getResponse().getContentAsByteArray()).isEqualTo(IMAGE_BYTES);
        assertThat(ok.getResponse().getContentType()).isEqualTo("image/jpeg");
        assertThat(apiRequests.get(0)).startsWith("GET /2/mss/msget?")
            .contains("access_token=" + ACCESS_TOKEN).contains("fid=821804469");

        // 渠道错误：error_code 原样透传为 13100，不冒成功也不伪装空字节
        mediaJson = MEDIA_FID_NOT_FOUND;
        JSONObject channelError = errorOf(mvc.perform(get("/api/desk/messages/" + mediaMessageId + "/media")
                .header("Authorization", "Bearer " + scopedToken)).andReturn());
        assertThat(channelError.getInt("code")).isEqualTo(13100);
        assertThat(channelError.getStr("msg")).contains("30021").contains("fid not found");

        // 未配置素材凭据的账号：如实受限 12200，不发起渠道请求
        long unconfiguredId = seedMessage(channelCallbackOnly, "7960019102",
            Map.of("type", "image", "media", Map.of("kind", "image", "id", "821804470")));
        JSONObject restricted = errorOf(mvc.perform(get("/api/desk/messages/" + unconfiguredId + "/media")
                .header("Authorization", "Bearer " + scopedToken)).andReturn());
        assertThat(restricted.getInt("code")).isEqualTo(12200);
        assertThat(restricted.getStr("msg")).isEqualTo("渠道素材凭据未配置");
        // 未配置凭据的读取不再发起素材请求
        assertThat(apiRequests).hasSize(2);
    }

    // ---------- 回调报文构造（官方 §5 载荷原文形状与 mock-pulse weibo 适配器同形） ----------

    // 微博推送：POST application/json，签名三参在 query，应答体为 200 空串
    private String push(String senderId, String type, String text, String data) throws Exception {
        String body = "{\"type\": \"" + type + "\", \"receiver_id\": 1902538057, \"sender_id\": " + senderId
            + ", \"created_at\": \"Mon Jul 16 18:09:20 +0800 2012\", \"text\": \"" + text
            + "\", \"data\": " + data + "}";
        return mvc.perform(post("/api/channels/" + channelWeibo + "/callback")
                .params(queryParams(signedQuery()))
                .contentType(MediaType.APPLICATION_JSON)
                .content(body))
            .andReturn().getResponse().getContentAsString();
    }

    // 回调 query：三参 signature 按 App Secret 验签（官方黄金算例原值）
    private Map<String, String> signedQuery() {
        Map<String, String> params = new HashMap<>();
        params.put("timestamp", TIMESTAMP);
        params.put("nonce", NONCE);
        params.put("signature", SIGNATURE);
        return params;
    }

    private LinkedMultiValueMap<String, String> queryParams(Map<String, String> source) {
        LinkedMultiValueMap<String, String> params = new LinkedMultiValueMap<>();
        source.forEach(params::add);
        return params;
    }

    private Map<String, Object> fullInfo() {
        Map<String, Object> info = new HashMap<>();
        info.put("url", "https://dudu.example.com/api/channels/weibo-full/callback");
        info.put("appSecret", APP_SECRET);
        info.put("accessToken", ACCESS_TOKEN);
        return info;
    }

    // form 表单还原：按 & 与 = 切分后逐段 URLDecode
    private Map<String, String> formFields(String body) {
        Map<String, String> fields = new HashMap<>();
        for (String pair : body.split("&")) {
            int eq = pair.indexOf('=');
            fields.put(URLDecoder.decode(pair.substring(0, eq), StandardCharsets.UTF_8),
                URLDecoder.decode(pair.substring(eq + 1), StandardCharsets.UTF_8));
        }
        return fields;
    }

    // ---------- Desk 侧公共小工具（与既有集成测试同口径） ----------

    private void assertContent(String externalUserId, java.util.function.Consumer<JSONObject> assertions) {
        Map<String, Object> row = jdbc.queryForMap("""
            SELECT m.* FROM message m JOIN visitor v ON v.visitor_id = m.visitor_id
            WHERE v.external_user_id = ? ORDER BY m.sequence DESC LIMIT 1
            """, externalUserId);
        assertThat(row.get("direction")).isEqualTo("incoming");
        assertThat(row.get("external_message_id")).isNull();
        assertions.accept(JSONUtil.parseObj(row.get("content").toString()));
    }

    private long newVisitor(long channelId, String externalUserId, String firstText) {
        deskInboundService.accept(channels.getById(channelId), new ChannelInboundMessage(channelId, externalUserId,
            null, null, List.of(), null, MessageDirectionEnum.INCOMING,
            Map.of("type", "text", "text", firstText)));
        return jdbc.queryForObject(
            "SELECT visitor_id FROM visitor WHERE company_id = ? AND company_channel_id = ? AND external_user_id = ?",
            Long.class, COMPANY_ID, channelId, externalUserId);
    }

    private long seedMessage(long channelId, String externalUserId, Map<String, Object> content) {
        deskInboundService.accept(channels.getById(channelId), new ChannelInboundMessage(channelId, externalUserId,
            null, null, List.of(), null, MessageDirectionEnum.INCOMING, content));
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
