package com.dudu.duduserver;

import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.dudu.duduserver.channel.ChannelInboundMessage;
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
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MvcResult;

import java.io.IOException;
import java.net.InetSocketAddress;
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
 * Telegram 渠道在共享评审 MySQL 与真实 HTTP 边界验收（docs/research/channels/telegram.md
 * §2、§4.1、§5.2、§5.3、§6；mock-pulse telegram 适配器探针语义同构）：Update 推送按恒等头
 * 原样比对验签——合法探针（GOLDEN_PROBE_BODY 官方 §5.2 逐字）放行落库、伪造与缺失头 403、
 * 半配置 501、未知账号 404；message 文本与全部媒体类型按契约统一落库、事件族只应答；
 * 纯文本 sendMessage 经真实发送实现打到本地替身（token 走 URL 路径、官方包络成功与 429
 * 频控失败如实落库）；素材经 getFile 换 file_path 下载字节与渠道错误如实透传。
 * 评审库在共享服务器上自建自删：测试开始先重置为全新库。
 */
@SpringBootTest(properties = {"dudu.auth.jwt-secret=integration-test-secret"},
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureMockMvc
@EnabledIfEnvironmentVariable(named = "DUDU_INTEGRATION_TEST", matches = "true")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class TelegramChannelIntegrationTest extends DeskIntegrationSupport {

    private static final long COMPANY_ID = 797107L;
    // 恒等头比对值与 Bot API 鉴权 token（官方教程页 token 原文形态）
    private static final String SECRET_TOKEN = "dudu-telegram-webhook-secret";
    private static final String BOT_TOKEN = "4839574812:AAFD39kkdpWt3ywyRZergyOLMaJhac60qc";
    private static final String SECRET_TOKEN_HEADER = "X-Telegram-Bot-Api-Secret-Token";
    private static final String SEND_PATH = "/bot" + BOT_TOKEN + "/sendMessage";
    private static final String GET_FILE_PATH = "/bot" + BOT_TOKEN + "/getFile";
    private static final String DOWNLOAD_PATH = "/file/bot" + BOT_TOKEN + "/documents/file_1.pdf";

    // mock-pulse 探针（GOLDEN_PROBE_PLAINTEXT 逐字 = 官方 §5.2 文本消息自测样本）
    private static final String GOLDEN_PROBE_BODY = """
        {
        "update_id":10000,
        "message":{
            "date":1441645532,
            "chat":{
               "last_name":"Test Lastname",
               "id":1111111,
               "type": "private",
               "first_name":"Test Firstname",
               "username":"Testusername"
            },
            "message_id":1365,
            "from":{
               "last_name":"Test Lastname",
               "id":1111111,
               "first_name":"Test Firstname",
               "username":"Testusername"
            },
            "text":"/start"
        }
        }""";

    // 官方 §5.3 成功包络与频控失败包络（#making-requests + #responseparameters 形状）
    private static final String SEND_OK =
        "{\"ok\":true,\"result\":{\"message_id\":1366,\"date\":1441645533,\"text\":\"ok\"}}";
    private static final String SEND_FLOOD =
        "{\"ok\":false,\"error_code\":429,\"description\":\"Too Many Requests\","
            + "\"parameters\":{\"retry_after\":3}}";
    private static final String FILE_INFO_OK =
        "{\"ok\":true,\"result\":{\"file_id\":\"doc-1\",\"file_unique_id\":\"uniq-1\","
            + "\"file_size\":19,\"file_path\":\"documents/file_1.pdf\"}}";
    private static final String FILE_TOO_BIG =
        "{\"ok\":false,\"error_code\":400,\"description\":\"Bad Request: file is too big\"}";
    private static final byte[] FILE_BYTES = "telegram-file-bytes".getBytes(StandardCharsets.UTF_8);

    // 共享评审服务器：dudu_review 用户只授权 dudu_review_%.*，本渠道用 telegram 号库
    private static final String SERVER_JDBC_URL = "jdbc:mysql://127.0.0.1:3306";
    private static final String REVIEW_DB = "dudu_review_telegram";

    // 渠道 API 替身：静态启动一次，channel_info 的 url 直接指向替身 bot 基址
    private static final HttpServer API = startApiStub();
    private static final List<String> apiRequests = new CopyOnWriteArrayList<>();
    private static final List<String> sendBodies = new CopyOnWriteArrayList<>();
    private static volatile String sendBody = SEND_OK;
    private static volatile String getFileBody = FILE_INFO_OK;
    private static volatile boolean downloadOk = true;

    private static HttpServer startApiStub() {
        try {
            HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            // 官方 sendMessage：POST JSON 包络，ok=true 成功、ok:false 如实失败
            server.createContext(SEND_PATH, exchange -> {
                apiRequests.add(exchange.getRequestMethod() + " " + exchange.getRequestURI().getPath());
                sendBodies.add(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
                respond(exchange, sendBody, "application/json");
            });
            // 官方 getFile：凭 file_id 换 file_path（下载超 20MB 时渠道在此拒绝）
            server.createContext(GET_FILE_PATH, exchange -> {
                apiRequests.add(exchange.getRequestMethod() + " " + exchange.getRequestURI().getPath()
                    + "?" + exchange.getRequestURI().getQuery());
                respond(exchange, getFileBody, "application/json");
            });
            // 官方文件下载：<源>/file/bot<token>/<file_path>，成功返回字节流
            server.createContext(DOWNLOAD_PATH, exchange -> {
                apiRequests.add(exchange.getRequestMethod() + " " + exchange.getRequestURI().getPath());
                if (!downloadOk) {
                    respond(exchange, FILE_TOO_BIG, "application/json");
                    return;
                }
                exchange.getResponseHeaders().set("Content-Type", "application/pdf");
                exchange.sendResponseHeaders(200, FILE_BYTES.length);
                exchange.getResponseBody().write(FILE_BYTES);
                exchange.close();
            });
            server.start();
            return server;
        } catch (IOException e) {
            throw new IllegalStateException("Telegram API 替身启动失败", e);
        }
    }

    private static void respond(HttpExchange exchange, String body, String contentType) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", contentType);
        exchange.sendResponseHeaders(200, bytes.length);
        exchange.getResponseBody().write(bytes);
        exchange.close();
    }

    @DynamicPropertySource
    static void contextProperties(DynamicPropertyRegistry registry) {
        // 事故防线（曾两次误连开发库 dudu）：四变量缺一即失败，URL 必须指向本票独立评审库
        String url = IntegrationTestEnv.required(IntegrationTestEnv.JDBC_URL);
        String user = IntegrationTestEnv.required(IntegrationTestEnv.DB_USER);
        String password = IntegrationTestEnv.required(IntegrationTestEnv.DB_PASSWORD);
        if (!url.contains("/" + REVIEW_DB + "?")) {
            throw new IllegalStateException("DUDU_TEST_JDBC_URL 必须指向独立评审库 " + REVIEW_DB + "，当前：" + url);
        }
        resetReviewDatabase(user, password);
        registry.add("spring.datasource.url", () -> url);
        registry.add("spring.datasource.username", () -> user);
        registry.add("spring.datasource.password", () -> password);
    }

    // 共享评审库自建自删：开始先重置为全新库，Flyway 空库迁移建表
    private static void resetReviewDatabase(String user, String password) {
        try (Connection connection = DriverManager.getConnection(SERVER_JDBC_URL, user, password);
             Statement statement = connection.createStatement()) {
            statement.execute("DROP DATABASE IF EXISTS " + REVIEW_DB);
            statement.execute("CREATE DATABASE " + REVIEW_DB + " CHARACTER SET utf8mb4");
        } catch (SQLException e) {
            throw new IllegalStateException("评审库重置失败：" + REVIEW_DB, e);
        }
    }

    @Autowired DeskInboundService deskInboundService;
    @Autowired JdbcTemplate jdbc;

    private String scopedToken;
    private long channelTelegram;
    private long channelHalfConfigured;
    private long channelSendHalfConfigured;

    @BeforeAll
    void seed() throws Exception {
        companies.createCompany(company(COMPANY_ID, "telegramowner", "Telegram验收企业"), 1L);
        UserGroupDO group = group(COMPANY_ID, "Telegram组");
        // channel_info.url = 含 /bot<token> 路径段的 Bot API 基址，指向本地替身
        Map<String, Object> fullInfo = new HashMap<>();
        fullInfo.put("url", "http://127.0.0.1:" + API.getAddress().getPort() + "/bot" + BOT_TOKEN);
        fullInfo.put("secretToken", SECRET_TOKEN);
        channelTelegram = channel(COMPANY_ID, group.getGroupId(), ChannelEnum.TELEGRAM, "Telegram", fullInfo);
        // 只配 url 缺 secretToken：回调无法验签按不支持应答（发送/素材凭据在发送组，不受影响）
        channelHalfConfigured = channel(COMPANY_ID, group.getGroupId(), ChannelEnum.TELEGRAM, "半配置Telegram",
            Map.of("url", "https://api.telegram.org/bot" + BOT_TOKEN));
        // 只配 secretToken 缺 url：回调可验签，但发送/素材按发送组凭据缺失如实受限
        channelSendHalfConfigured = channel(COMPANY_ID, group.getGroupId(), ChannelEnum.TELEGRAM, "缺基址Telegram",
            Map.of("secretToken", SECRET_TOKEN));
        UserDO scoped = plainUser(COMPANY_ID, "telegram.scoped", "坐席甲");
        members.save(member(COMPANY_ID, scoped.getUserId(), group.getGroupId()));
        scopedToken = login(COMPANY_ID, "telegram.scoped");
    }

    @BeforeEach
    void resetStubAndDeskData() {
        apiRequests.clear();
        sendBodies.clear();
        sendBody = SEND_OK;
        getFileBody = FILE_INFO_OK;
        downloadOk = true;
        // 类级共享评审库跨用例残留清理：本企业 Desk 数据每个用例前清空
        jdbc.update("DELETE FROM message WHERE visitor_id IN"
            + " (SELECT visitor_id FROM visitor WHERE company_id = ?)", COMPANY_ID);
        jdbc.update("DELETE FROM visitor_profile WHERE visitor_id IN"
            + " (SELECT visitor_id FROM visitor WHERE company_id = ?)", COMPANY_ID);
        jdbc.update("DELETE FROM visitor WHERE company_id = ?", COMPANY_ID);
    }

    @Test
    void webhookProbeVerifiesSecretTokenAndStoresUnifiedBody() throws Exception {
        // mock-pulse 探针语义（GOLDEN_PROBE_BODY 逐字 + 合规恒等头）：官方无 challenge 握手
        MvcResult ok = mvc.perform(post("/api/channels/" + channelTelegram + "/callback")
                .header(SECRET_TOKEN_HEADER, SECRET_TOKEN)
                .contentType(MediaType.APPLICATION_JSON)
                .content(GOLDEN_PROBE_BODY))
            .andReturn();
        assertThat(ok.getResponse().getStatus()).isEqualTo(200);
        assertContent("1111111", body -> {
            assertThat(body.getStr("type")).isEqualTo("text");
            assertThat(body.getStr("text")).isEqualTo("/start");
        });
        // 身份与幂等：from.id 64 位、姓名 first+last 拼接、update_id 作渠道消息标识
        Map<String, Object> visitor = jdbc.queryForMap(
            "SELECT external_user_id, name FROM visitor WHERE company_id = ?", COMPANY_ID);
        assertThat(visitor.get("external_user_id")).isEqualTo("1111111");
        assertThat(visitor.get("name")).isEqualTo("Test Firstname Test Lastname");
        assertThat(jdbc.queryForObject(
            "SELECT external_message_id FROM message WHERE direction = 'incoming'", String.class))
            .isEqualTo("10000");

        // 伪造头值与缺失头都拒绝，且不产生新访客数据
        MvcResult forged = mvc.perform(post("/api/channels/" + channelTelegram + "/callback")
                .header(SECRET_TOKEN_HEADER, "forged-secret")
                .contentType(MediaType.APPLICATION_JSON)
                .content(GOLDEN_PROBE_BODY))
            .andReturn();
        assertThat(forged.getResponse().getStatus()).isEqualTo(403);
        MvcResult missing = mvc.perform(post("/api/channels/" + channelTelegram + "/callback")
                .contentType(MediaType.APPLICATION_JSON)
                .content(GOLDEN_PROBE_BODY))
            .andReturn();
        assertThat(missing.getResponse().getStatus()).isEqualTo(403);

        // 缺 secretToken 无法验签按不支持应答；未知账号按不存在应答
        assertThat(mvc.perform(post("/api/channels/" + channelHalfConfigured + "/callback")
                .header(SECRET_TOKEN_HEADER, SECRET_TOKEN)
                .contentType(MediaType.APPLICATION_JSON)
                .content(GOLDEN_PROBE_BODY))
            .andReturn().getResponse().getStatus()).isEqualTo(501);
        assertThat(mvc.perform(post("/api/channels/99999999/callback")
                .header(SECRET_TOKEN_HEADER, SECRET_TOKEN)
                .contentType(MediaType.APPLICATION_JSON)
                .content(GOLDEN_PROBE_BODY))
            .andReturn().getResponse().getStatus()).isEqualTo(404);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM visitor", Integer.class)).isEqualTo(1);
    }

    @Test
    void inboundMapsAllMessageTypesAndAnswersEventsOnly() throws Exception {
        // 文本与媒体消息按契约映射（photo 取最大档 file_id；file_id 即素材引用）
        assertThat(contentOf(push("""
            {"update_id":10001,"message":{"date":1,"message_id":1,
             "from":{"id":1111112,"first_name":"Photo","last_name":"User"},
             "photo":[{"width":90,"height":90,"file_id":"photo-small"},
                      {"width":800,"height":600,"file_id":"photo-large"}]}}
            """))).isEqualTo(Map.of("type", "image",
            "media", Map.of("kind", "image", "id", "photo-large")));
        assertThat(contentOf(push("""
            {"update_id":10002,"message":{"date":1,"message_id":2,
             "from":{"id":1111112,"first_name":"Photo","last_name":"User"},
             "voice":{"duration":3,"mime_type":"audio/ogg","file_id":"voice-1"}}}
            """))).isEqualTo(Map.of("type", "audio",
            "media", Map.of("kind", "audio", "id", "voice-1")));
        assertThat(contentOf(push("""
            {"update_id":10003,"message":{"date":1,"message_id":3,
             "from":{"id":1111112,"first_name":"Photo","last_name":"User"},
             "audio":{"duration":203,"title":"Sleep","file_name":"sleep.mp3","file_id":"audio-1"}}}
            """))).isEqualTo(Map.of("type", "audio",
            "media", Map.of("kind", "audio", "id", "audio-1", "name", "Sleep")));
        assertThat(contentOf(push("""
            {"update_id":10004,"message":{"date":1,"message_id":4,
             "from":{"id":1111112,"first_name":"Photo","last_name":"User"},
             "video":{"duration":52,"file_name":"clip.mp4","file_id":"video-1"}}}
            """))).isEqualTo(Map.of("type", "video",
            "media", Map.of("kind", "video", "id", "video-1", "name", "clip.mp4")));
        assertThat(contentOf(push("""
            {"update_id":10005,"message":{"date":1,"message_id":5,
             "from":{"id":1111112,"first_name":"Photo","last_name":"User"},
             "video_note":{"duration":7,"file_id":"note-1"}}}
            """))).isEqualTo(Map.of("type", "video",
            "media", Map.of("kind", "video", "id", "note-1")));
        assertThat(contentOf(push("""
            {"update_id":10006,"message":{"date":1,"message_id":6,
             "from":{"id":1111112,"first_name":"Photo","last_name":"User"},
             "document":{"file_name":"a.pdf","mime_type":"application/pdf","file_id":"doc-1"}}}
            """))).isEqualTo(Map.of("type", "file",
            "media", Map.of("kind", "file", "id", "doc-1", "name", "a.pdf")));
        // 契约外内容（sticker）与纯服务消息如实落 unknown，事件族只应答不落库
        assertThat(contentOf(push("""
            {"update_id":10007,"message":{"date":1,"message_id":7,
             "from":{"id":1111112,"first_name":"Photo","last_name":"User"},
             "sticker":{"width":512,"file_id":"sticker-1"}}}
            """))).isEqualTo(Map.of("type", "unknown", "originalType", "sticker"));
        assertThat(contentOf(push("""
            {"update_id":10008,"message":{"date":1,"message_id":8,
             "from":{"id":1111112,"first_name":"Photo","last_name":"User"},
             "new_chat_members":[{"id":2,"first_name":"New"}]}}
            """))).isEqualTo(Map.of("type", "unknown", "originalType", "new_chat_members"));
        assertThat(push("{\"update_id\":10009,\"callback_query\":{\"id\":\"4382bfdwdsb323b2d9\","
            + "\"from\":{\"id\":1111112,\"first_name\":\"Photo\"},\"data\":\"Data from button callback\"}}"))
            .isEqualTo("success");
        assertThat(push("{\"update_id\":10010,\"edited_message\":{\"date\":1,\"message_id\":1,"
            + "\"from\":{\"id\":1111112,\"first_name\":\"Photo\"},\"text\":\"edited\"}}"))
            .isEqualTo("success");

        // 只有 message 型 Update 产生访客与消息：同一访客 8 条 incoming，事件零落库
        Integer visitors = jdbc.queryForObject("SELECT COUNT(*) FROM visitor", Integer.class);
        assertThat(visitors).isEqualTo(1);
        assertThat(jdbc.queryForObject(
            "SELECT COUNT(*) FROM message WHERE direction = 'incoming'", Integer.class)).isEqualTo(8);
    }

    @Test
    void sendPersistsRealChannelOutcomeForSuccessAndFlood() throws Exception {
        long visitorId = newVisitor(channelTelegram, "1111111", "想咨询发货时间");

        // 真实发送实现：POST <bot 基址>/sendMessage，成功保存渠道消息 message_id
        JSONObject sent = data(send(scopedToken, visitorId, body("tg-cr-1", "好的，今天发出")));
        assertThat(sent.getJSONObject("delivery").getStr("state")).isEqualTo("sent");
        Map<String, Object> saved = jdbc.queryForMap("""
            SELECT send_status, external_message_id, failure_reason FROM message
            WHERE visitor_id = ? AND client_request_id = 'tg-cr-1'
            """, visitorId);
        assertThat(saved.get("send_status")).isEqualTo("sent");
        assertThat(saved.get("external_message_id")).isEqualTo("1366");
        assertThat(saved.get("failure_reason")).isNull();
        assertThat(apiRequests.get(0)).isEqualTo("POST " + SEND_PATH);

        // 请求报文按官方 §5.3 包络：chat_id 数字形态 + text（token 在 URL 路径，不在报文）
        JSONObject requestBody = JSONUtil.parseObj(sendBodies.get(0));
        assertThat(requestBody.get("chat_id")).isEqualTo(1111111);
        assertThat(requestBody.getStr("text")).isEqualTo("好的，今天发出");

        // 频控 429 带 retry_after：渠道失败如实落库，不模拟成功也不改接待状态
        sendBody = SEND_FLOOD;
        JSONObject failed = data(send(scopedToken, visitorId, body("tg-cr-2", "稍等，我查一下")));
        assertThat(failed.getJSONObject("delivery").getStr("state")).isEqualTo("failed");
        assertThat(failed.getJSONObject("delivery").getStr("reason"))
            .contains("429").contains("Too Many Requests").contains("retry_after");
        Map<String, Object> failedRow = jdbc.queryForMap("""
            SELECT send_status, external_message_id, failure_reason FROM message
            WHERE visitor_id = ? AND client_request_id = 'tg-cr-2'
            """, visitorId);
        assertThat(failedRow.get("send_status")).isEqualTo("failed");
        assertThat(failedRow.get("external_message_id")).isNull();
        assertThat(String.valueOf(failedRow.get("failure_reason"))).contains("retry_after");
        // 失败不改接待状态：首次成功回复已转入 waiting，失败保持不变
        assertThat(jdbc.queryForObject("SELECT status FROM visitor WHERE visitor_id = ?", String.class, visitorId))
            .isEqualTo("waiting");
    }

    @Test
    void mediaServesBytesAndReportsChannelErrorsHonestly() throws Exception {
        // 半配置账号（缺发送组 url）：凭据缺失如实受限 12200，不发起渠道请求
        long restrictedId = seedMessage(channelSendHalfConfigured, "7991079101",
            Map.of("type", "file", "media", Map.of("kind", "file", "id", "doc-0")));
        JSONObject restricted = errorOf(mvc.perform(get("/api/desk/messages/" + restrictedId + "/media")
                .header("Authorization", "Bearer " + scopedToken)).andReturn());
        assertThat(restricted.getInt("code")).isEqualTo(12200);
        assertThat(restricted.getStr("msg")).isEqualTo("渠道素材凭据未配置");

        // 凭据齐备：getFile 换 file_path 后取回字节与内容类型（官方下载路径）
        long mediaMessageId = seedMessage(channelTelegram, "7991079102",
            Map.of("type", "file", "media", Map.of("kind", "file", "id", "doc-1")));
        MvcResult bytes = mvc.perform(get("/api/desk/messages/" + mediaMessageId + "/media")
                .header("Authorization", "Bearer " + scopedToken)).andReturn();
        assertThat(bytes.getResponse().getContentAsByteArray()).isEqualTo(FILE_BYTES);
        assertThat(bytes.getResponse().getContentType()).isEqualTo("application/pdf");
        assertThat(apiRequests).containsExactly("GET " + GET_FILE_PATH + "?file_id=doc-1",
            "GET " + DOWNLOAD_PATH);

        // 渠道拒绝（下载超 20MB 由 getFile 给错误包络）：原样透传 13100，不伪装字节
        apiRequests.clear();
        getFileBody = FILE_TOO_BIG;
        JSONObject honest = errorOf(mvc.perform(get("/api/desk/messages/" + mediaMessageId + "/media")
                .header("Authorization", "Bearer " + scopedToken)).andReturn());
        assertThat(honest.getInt("code")).isEqualTo(13100);
        assertThat(honest.getStr("msg")).contains("400").contains("file is too big");
    }

    // ---------- 回调报文构造（官方 §5.2 样本形状与 mock-pulse 适配器同形） ----------

    // Update 推送：POST JSON 明文 + 合规恒等头，回调整体应答正文
    private String push(String updateJson) throws Exception {
        MvcResult result = mvc.perform(post("/api/channels/" + channelTelegram + "/callback")
                .header(SECRET_TOKEN_HEADER, SECRET_TOKEN)
                .contentType(MediaType.APPLICATION_JSON)
                .content(updateJson))
            .andReturn();
        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        return result.getResponse().getContentAsString();
    }

    private Map<String, Object> contentOf(String response) throws Exception {
        Map<String, Object> row = jdbc.queryForMap("""
            SELECT m.* FROM message m JOIN visitor v ON v.visitor_id = m.visitor_id
            WHERE v.external_user_id = '1111112' ORDER BY m.sequence DESC LIMIT 1
            """);
        assertThat(row.get("direction")).isEqualTo("incoming");
        return asMap(JSONUtil.parseObj(row.get("content").toString()));
    }

    // JSONObject 与 Map 的 equals 不对称：递归转普通 Map 再与 Map.of 断言
    private Map<String, Object> asMap(JSONObject json) {
        Map<String, Object> map = new HashMap<>();
        for (String key : json.keySet()) {
            Object value = json.get(key);
            map.put(key, value instanceof JSONObject nested ? asMap(nested) : value);
        }
        return map;
    }

    // ---------- Desk 侧公共小工具（与既有集成测试同口径） ----------

    private void assertContent(String externalUserId, java.util.function.Consumer<JSONObject> assertions) {
        Map<String, Object> row = jdbc.queryForMap("""
            SELECT m.* FROM message m JOIN visitor v ON v.visitor_id = m.visitor_id
            WHERE v.external_user_id = ? ORDER BY m.sequence DESC LIMIT 1
            """, externalUserId);
        assertThat(row.get("direction")).isEqualTo("incoming");
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
