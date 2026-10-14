package com.dudu.duduserver;

import cn.hutool.core.date.DateUtil;
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
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MvcResult;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.PrivateKey;
import java.security.Signature;
import java.security.spec.PKCS8EncodedKeySpec;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * QQ 渠道在共享 MySQL 评审库（dudu_review_114，本类自建自删，不触开发库）与真实 HTTP
 * 边界验收：op13 握手回官方向量签名应答、无 GET 验证阶段、Dispatch 验签通过后三类消息
 * 事件按场景前缀落库（c2c/group/guild）、关系链事件只应答不落库、纯文本发送按场景路由到
 * 单聊/群接口并如实落库成败（令牌失败依据 code 判定、渠道拒绝原样透传 err_code、频道会话
 * 如实受限）、附件媒体按公开链接契约由 Desk 直连不经代理。报文按 qq.md 官方样例与
 * mock-pulse qq 适配器同形构造（黄金密钥见 qq.md §3.2/§4.2），渠道 API 用本地替身按官方
 * 响应形状应答，不模拟假成功。
 */
@SpringBootTest(properties = {"dudu.auth.jwt-secret=integration-test-secret"},
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureMockMvc
@EnabledIfEnvironmentVariable(named = "DUDU_INTEGRATION_TEST", matches = "true")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class QqChannelIntegrationTest extends DeskIntegrationSupport {

    private static final long COMPANY_ID = 796001L;
    // 共享 MySQL 评审库：只允许创建/删除 dudu_review_114，严禁触开发库 dudu
    private static final String DB_NAME = "dudu_review_114";
    private static final String DB_ADMIN_URL = "jdbc:mysql://127.0.0.1:3306/?sslMode=REQUIRED&characterEncoding=UTF-8";
    private static final String DB_URL = "jdbc:mysql://127.0.0.1:3306/" + DB_NAME
        + "?sslMode=REQUIRED&connectionTimeZone=Asia/Shanghai&forceConnectionTimeZoneToSession=true"
        + "&characterEncoding=UTF-8";
    private static final String DB_USER = "dudu_review";
    private static final String DB_PASSWORD = "dudu_review_local";

    // 官方 op13 示例账号（qq.md §3.2）：appid 11111111 / secret DG5g3B4j9X2KOErG
    private static final String APP_ID = "11111111";
    private static final String APP_SECRET = "DG5g3B4j9X2KOErG";
    private static final String GOLDEN_PLAIN_TOKEN = "Arq0D5A61EgUu4OxUvOp";
    private static final String GOLDEN_EVENT_TS = "1725442341";
    private static final String GOLDEN_HANDSHAKE_SIGNATURE =
        "87befc99c42c651b3aac0278e71ada338433ae26fcb24307bdc5ad38c1adc2d0"
            + "1bcfcadc0842edac85e85205028a1132afe09280305f13aa6909ffc2d652c706";

    // 官方 access-token 页与单聊/群发送响应形状（qq.md §5.8/§5.9/§5.10）
    private static final String TOKEN_OK = "{\"access_token\":\"ACCESS_TOKEN_796001\",\"expires_in\":\"7200\"}";
    private static final String TOKEN_INVALID = "{\"code\":\"100016\",\"message\":\"invalid appid or secret\"}";
    private static final String SEND_OK = "{\"id\":\"ROBOT1.0_send_796001\",\"timestamp\":"
        + "\"2026-07-21T10:30:00+08:00\"}";
    private static final String SEND_DEDUP = "{\"err_code\":40054005,\"message\":\"消息被去重\","
        + "\"trace_id\":\"TRACE_796001\"}";
    private static final byte[] IMAGE_BYTES = "qq-media-bytes".getBytes(StandardCharsets.UTF_8);

    // 渠道 API 替身：静态启动一次，地址经 dudu.channel.qq.api-base 注入真实发送实现
    private static final HttpServer API = startApiStub();
    private static final List<String> apiRequests = new CopyOnWriteArrayList<>();
    private static final List<String> sendBodies = new CopyOnWriteArrayList<>();
    private static final List<String> authHeaders = new CopyOnWriteArrayList<>();
    private static final AtomicInteger attachmentHits = new AtomicInteger();
    private static volatile String tokenBody = TOKEN_OK;
    private static volatile String userSendBody = SEND_OK;

    private static HttpServer startApiStub() {
        try {
            HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            // 官方 access-token 页：POST /app/getAppAccessToken，HTTP 恒 200，按 code 判定
            server.createContext("/app/getAppAccessToken", exchange -> {
                apiRequests.add(exchange.getRequestMethod() + " " + exchange.getRequestURI());
                sendBodies.add(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
                respond(exchange, tokenBody);
            });
            // 官方 §5.8：POST /v2/users/{user_openid}/messages
            server.createContext("/v2/users", exchange -> {
                apiRequests.add(exchange.getRequestMethod() + " " + exchange.getRequestURI());
                sendBodies.add(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
                authHeaders.add(exchange.getRequestHeaders().getFirst("Authorization"));
                respond(exchange, userSendBody);
            });
            // 官方 §5.9：POST /v2/groups/{group_openid}/messages
            server.createContext("/v2/groups", exchange -> {
                apiRequests.add(exchange.getRequestMethod() + " " + exchange.getRequestURI());
                sendBodies.add(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
                authHeaders.add(exchange.getRequestHeaders().getFirst("Authorization"));
                respond(exchange, SEND_OK);
            });
            // 入站附件直链（若被代理则计数增加；公开链接契约下应保持零调用）
            server.createContext("/att", exchange -> {
                attachmentHits.incrementAndGet();
                exchange.getResponseHeaders().set("Content-Type", "image/jpeg");
                exchange.sendResponseHeaders(200, IMAGE_BYTES.length);
                exchange.getResponseBody().write(IMAGE_BYTES);
                exchange.close();
            });
            server.start();
            return server;
        } catch (IOException e) {
            throw new IllegalStateException("QQ API 替身启动失败", e);
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
        // 评审库生命周期归本测试所有：先删后建保证干净，不依赖运行前置
        JdbcTemplate admin = new JdbcTemplate(new DriverManagerDataSource(DB_ADMIN_URL, DB_USER, DB_PASSWORD));
        admin.execute("DROP DATABASE IF EXISTS " + DB_NAME);
        admin.execute("CREATE DATABASE " + DB_NAME + " CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci");
        registry.add("spring.datasource.url", () -> DB_URL);
        registry.add("spring.datasource.username", () -> DB_USER);
        registry.add("spring.datasource.password", () -> DB_PASSWORD);
        // 真实发送实现全程走本地替身：请求与响应都按官方接口形状对拍
        registry.add("dudu.channel.qq.api-base",
            () -> "http://127.0.0.1:" + API.getAddress().getPort());
    }

    @Autowired DeskInboundService deskInboundService;

    private long channelQq;
    private long channelNoSecret;
    private String scopedToken;
    private String attachmentUrl;

    @BeforeAll
    void seed() throws Exception {
        companies.createCompany(company(COMPANY_ID, "qqowner", "QQ验收企业"), 1L);
        UserGroupDO group = group(COMPANY_ID, "QQ组");
        Map<String, Object> fullInfo = new HashMap<>();
        fullInfo.put("url", "https://dudu.example.com/api/channels/qq-full/callback");
        fullInfo.put("appId", APP_ID);
        fullInfo.put("appSecret", APP_SECRET);
        channelQq = channel(COMPANY_ID, group.getGroupId(), ChannelEnum.QQ, "QQ机器人", fullInfo);
        // 只配 appId 的账号：无验签材料，回调按不支持应答
        channelNoSecret = channel(COMPANY_ID, group.getGroupId(), ChannelEnum.QQ, "仅配置 appId",
            Map.of("url", "https://dudu.example.com/api/channels/qq-thin/callback", "appId", APP_ID));
        UserDO scoped = plainUser(COMPANY_ID, "qq.scoped", "坐席丙");
        members.save(member(COMPANY_ID, scoped.getUserId(), group.getGroupId()));
        scopedToken = login(COMPANY_ID, "qq.scoped");
        attachmentUrl = "http://127.0.0.1:" + API.getAddress().getPort() + "/att/qq-1.jpg";
    }

    @BeforeEach
    void resetStub() {
        apiRequests.clear();
        sendBodies.clear();
        authHeaders.clear();
        attachmentHits.set(0);
        tokenBody = TOKEN_OK;
        userSendBody = SEND_OK;
    }

    @Test
    void handshakeAnswersGoldenSignatureAndUnverifiableRequestsStayRejected() throws Exception {
        // 官方 op13 握手（qq.md §3.2）：应答 plain_token 回显 + 黄金签名
        MvcResult ok = mvc.perform(post("/api/channels/" + channelQq + "/callback")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"op\":13,\"d\":{\"plain_token\":\"" + GOLDEN_PLAIN_TOKEN
                    + "\",\"event_ts\":\"" + GOLDEN_EVENT_TS + "\"}}"))
            .andReturn();
        assertThat(ok.getResponse().getStatus()).isEqualTo(200);
        assertThat(ok.getResponse().getContentAsString()).isEqualTo("{\"plain_token\":\""
            + GOLDEN_PLAIN_TOKEN + "\",\"signature\":\"" + GOLDEN_HANDSHAKE_SIGNATURE + "\"}");

        // QQ 无 GET 验证阶段：默认按不支持应答
        assertThat(mvc.perform(get("/api/channels/" + channelQq + "/callback")).andReturn()
            .getResponse().getStatus()).isEqualTo(501);

        // 未知 op 与不可解析报文按参数错误拒绝
        assertThat(mvc.perform(post("/api/channels/" + channelQq + "/callback")
                .contentType(MediaType.APPLICATION_JSON).content("{\"op\":99,\"d\":{}}"))
            .andReturn().getResponse().getStatus()).isEqualTo(400);
        assertThat(mvc.perform(post("/api/channels/" + channelQq + "/callback")
                .contentType(MediaType.APPLICATION_JSON).content("not json"))
            .andReturn().getResponse().getStatus()).isEqualTo(400);

        // 缺验签材料的账号握手按不支持应答
        assertThat(mvc.perform(post("/api/channels/" + channelNoSecret + "/callback")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"op\":13,\"d\":{\"plain_token\":\"p\",\"event_ts\":\"1\"}}"))
            .andReturn().getResponse().getStatus()).isEqualTo(501);
    }

    @Test
    void signedDispatchPersistsSceneScopedVisitorsAndOnlyAnswersRelationEvents() throws Exception {
        // C2C 文本（qq.md §5.3 样例）：访客 = c2c:<user_openid>
        MvcResult c2c = push("""
            {"op":0,"t":"C2C_MESSAGE_CREATE","d":{"id":"ROBOT1.0_c1","author":{"id":"CA1",
              "user_openid":"C2C_1","union_openid":"","username":"小明","bot":false},
              "content":"你好，今天有什么推荐的活动吗？","message_type":0,
              "message_scene":{"source":"default","ext":["msg_idx=REFIDX_x=="]},
              "timestamp":"2026-07-21T10:00:00+08:00"}}
            """);
        assertThat(c2c.getResponse().getContentAsString()).isEqualTo("success");

        // 群@文本（qq.md §5.4 样例）：访客 = group:<group_openid>（回复对象即本群）
        assertThat(push("""
            {"op":0,"t":"GROUP_AT_MESSAGE_CREATE","d":{"id":"ROBOT1.0_g1","author":{"id":"GA1",
              "member_openid":"MEMBER_1","member_role":"member","username":"小明","bot":false},
              "content":" /今日天气 ","group_openid":"GROUP_1","message_type":0,
              "timestamp":"2026-07-21T10:00:00+08:00"}}
            """).getResponse().getContentAsString()).isEqualTo("success");

        // 群全量带附件（qq.md §5.12 示例 2）：附件 url 即公开媒体链接
        assertThat(push("""
            {"op":0,"t":"GROUP_MESSAGE_CREATE","d":{"id":"ROBOT1.0_g2","author":{"id":"GA2",
              "member_openid":"MEMBER_2","username":"小红","bot":false},"content":"",
              "group_openid":"GROUP_2","message_type":0,"attachments":[
              {"content_type":"image/jpeg","filename":"photo.jpg","url":"%s",
               "width":800,"height":600,"size":1024}]}}
            """.formatted(attachmentUrl)).getResponse().getContentAsString()).isEqualTo("success");

        // 频道 AT 消息（qq.md §5.7 样例）：访客 = guild:<author.id>，带名称与头像
        assertThat(push("""
            {"op":0,"t":"AT_MESSAGE_CREATE","d":{"author":{"avatar":"http://thirdqq.qlogo.cn/0",
              "bot":false,"id":"GUILD_USER_1","username":"abc"},"channel_id":"100010",
              "content":"ndnnd","guild_id":"18700000000001","id":"0812345677890abcdef",
              "timestamp":"2021-05-20T15:14:58+08:00","seq":101}}
            """).getResponse().getContentAsString()).isEqualTo("success");

        assertContent("c2c:C2C_1", "ROBOT1.0_c1", body -> {
            assertThat(body.getStr("type")).isEqualTo("text");
            assertThat(body.getStr("text")).isEqualTo("你好，今天有什么推荐的活动吗？");
        });
        assertContent("group:GROUP_1", "ROBOT1.0_g1", body ->
            assertThat(body.getStr("text")).isEqualTo(" /今日天气 "));
        assertContent("group:GROUP_2", "ROBOT1.0_g2", body -> {
            assertThat(body.getStr("type")).isEqualTo("image");
            assertThat(body.getJSONObject("media").getStr("kind")).isEqualTo("image");
            assertThat(body.getJSONObject("media").getStr("url")).isEqualTo(attachmentUrl);
            assertThat(body.getJSONObject("media").getStr("id")).isEqualTo(attachmentUrl);
        });
        Map<String, Object> guildVisitor = jdbc.queryForMap(
            "SELECT external_user_id, name, avatar_url FROM visitor WHERE external_user_id = ?",
            "guild:GUILD_USER_1");
        assertThat(guildVisitor.get("name")).isEqualTo("abc");
        assertThat(guildVisitor.get("avatar_url")).isEqualTo("http://thirdqq.qlogo.cn/0");

        // 关系链事件（qq.md §5.5）只应答 success，不产生访客与消息
        assertThat(push("""
            {"op":0,"t":"FRIEND_ADD","d":{"openid":"FRIEND_1","timestamp":1784570523,
              "scene":1001,"scene_param":"","author":{"union_openid":"UNION_1"}}}
            """).getResponse().getContentAsString()).isEqualTo("success");
        assertThat(jdbc.queryForObject(
            "SELECT COUNT(*) FROM visitor WHERE external_user_id = 'FRIEND_1'", Integer.class)).isZero();
    }

    @Test
    void sendRoutesBySceneAndPersistsRealChannelOutcome() throws Exception {
        long visitorId = newVisitor("c2c:C2C_SEND_1", "想咨询发货时间");

        // 真实发送实现：先按官方 access-token 页换取令牌再按 §5.8 下发单聊文本
        JSONObject sent = data(send(scopedToken, visitorId, body("qq-cr-1", "好的，今天发出")));
        assertThat(sent.getJSONObject("delivery").getStr("state")).isEqualTo("sent");
        Map<String, Object> saved = jdbc.queryForMap("""
            SELECT send_status, external_message_id, failure_reason FROM message
            WHERE visitor_id = ? AND client_request_id = 'qq-cr-1'
            """, visitorId);
        assertThat(saved.get("send_status")).isEqualTo("sent");
        assertThat(saved.get("external_message_id")).isEqualTo("ROBOT1.0_send_796001");
        assertThat(saved.get("failure_reason")).isNull();
        assertThat(apiRequests.get(0)).isEqualTo("POST /app/getAppAccessToken");
        JSONObject tokenPayload = JSONUtil.parseObj(sendBodies.get(0));
        assertThat(tokenPayload.getStr("appId")).isEqualTo(APP_ID);
        assertThat(tokenPayload.getStr("clientSecret")).isEqualTo(APP_SECRET);
        assertThat(apiRequests.get(1)).isEqualTo("POST /v2/users/C2C_SEND_1/messages");
        assertThat(authHeaders.get(0)).isEqualTo("QQBot ACCESS_TOKEN_796001");
        JSONObject payload = JSONUtil.parseObj(sendBodies.get(1));
        assertThat(payload.getStr("content")).isEqualTo("好的，今天发出");
        assertThat(payload.getInt("msg_type")).isZero();

        // 群会话路由到群接口（§5.9）
        long groupId = newVisitor("group:GROUP_SEND_1", "群里的第一条");
        data(send(scopedToken, groupId, body("qq-cr-g", "群回复")));
        assertThat(apiRequests.get(3)).isEqualTo("POST /v2/groups/GROUP_SEND_1/messages");

        // 渠道拒绝（官方去重码 40054005）：失败原因如实落库，不冒成功
        userSendBody = SEND_DEDUP;
        JSONObject failed = data(send(scopedToken, visitorId, body("qq-cr-2", "稍等，我查一下")));
        assertThat(failed.getJSONObject("delivery").getStr("state")).isEqualTo("failed");
        assertThat(failed.getJSONObject("delivery").getStr("reason"))
            .isEqualTo("QQ消息发送失败：40054005 消息被去重 trace_id=TRACE_796001");
        Map<String, Object> failedRow = jdbc.queryForMap("""
            SELECT send_status, external_message_id, failure_reason FROM message
            WHERE visitor_id = ? AND client_request_id = 'qq-cr-2'
            """, visitorId);
        assertThat(failedRow.get("send_status")).isEqualTo("failed");
        assertThat(failedRow.get("external_message_id")).isNull();
        // 失败不改接待状态：首次成功回复已转入 waiting，失败保持不变
        assertThat(jdbc.queryForObject("SELECT status FROM visitor WHERE visitor_id = ?", String.class, visitorId))
            .isEqualTo("waiting");

        // 令牌失败按官方口径依据 code 判定（HTTP 恒 200），不再调用发送接口
        tokenBody = TOKEN_INVALID;
        int callsBefore = apiRequests.size();
        JSONObject tokenFailed = data(send(scopedToken, visitorId, body("qq-cr-3", "再试一次")));
        assertThat(tokenFailed.getJSONObject("delivery").getStr("state")).isEqualTo("failed");
        assertThat(tokenFailed.getJSONObject("delivery").getStr("reason"))
            .contains("100016").contains("invalid appid or secret");
        assertThat(apiRequests).hasSize(callsBefore + 1);
    }

    @Test
    void guildConversationAndPublicLinkMediaStayHonest() throws Exception {
        // 频道会话发送要求 WS 在线（qq.md §5.12），未接入：如实失败且零渠道调用
        long guildVisitorId = newVisitor("guild:GUILD_SEND_1", "频道里的第一条");
        int callsBefore = apiRequests.size();
        JSONObject guild = data(send(scopedToken, guildVisitorId, body("qq-cr-guild", "频道回复")));
        assertThat(guild.getJSONObject("delivery").getStr("state")).isEqualTo("failed");
        assertThat(guild.getJSONObject("delivery").getStr("reason")).contains("频道");
        assertThat(apiRequests).hasSize(callsBefore);

        // 自造带附件的群推送（qq.md §5.12 示例 2 形状），供媒体契约验收
        assertThat(push("""
            {"op":0,"t":"GROUP_MESSAGE_CREATE","d":{"id":"ROBOT1.0_gm","author":{"id":"GA9",
              "member_openid":"MEMBER_9","username":"小刚","bot":false},"content":"",
              "group_openid":"GROUP_9","message_type":0,"attachments":[
              {"content_type":"image/jpeg","filename":"photo.jpg","url":"%s",
               "width":800,"height":600,"size":1024}]}}
            """.formatted(attachmentUrl)).getResponse().getContentAsString()).isEqualTo("success");

        // 附件是带签名的公开直链：按契约 Desk 直连渠道，媒体接口不代理（11000）
        long mediaMessageId = jdbc.queryForObject("""
            SELECT m.message_id FROM message m JOIN visitor v ON v.visitor_id = m.visitor_id
            WHERE v.external_user_id = 'group:GROUP_9' ORDER BY m.sequence DESC LIMIT 1
            """, Long.class);
        JSONObject rejected = JSONUtil.parseObj(mvc.perform(get(
                    "/api/desk/messages/" + mediaMessageId + "/media")
                .header("Authorization", "Bearer " + scopedToken)).andReturn()
            .getResponse().getContentAsString());
        assertThat(rejected.getInt("code")).isEqualTo(11000);
        assertThat(rejected.getStr("msg")).contains("公开链接");
        // 契约行为：代理未发生，附件直链零调用
        assertThat(attachmentHits.get()).isZero();
    }

    // ---------- 回调报文构造（官方 §3.2/§4 与 mock-pulse qq 适配器同形） ----------

    // 按 §4.2 口径现场签名：msg = X-Signature-Timestamp 头字符串 + 原始 Body 字节；
    // 验签正确性由 QqProtocolTest 官方黄金向量锚定。报文含中文且签名字节敏感，
    // 显式声明 UTF-8 保证测试发送与真实 QQ 网关同为 UTF-8 字节
    private MvcResult push(String body) throws Exception {
        String timestamp = String.valueOf(DateUtil.currentSeconds());
        return mvc.perform(post("/api/channels/" + channelQq + "/callback")
                .header("X-Signature-Ed25519", sign(timestamp, body))
                .header("X-Signature-Timestamp", timestamp)
                .contentType(new MediaType(MediaType.APPLICATION_JSON, StandardCharsets.UTF_8))
                .content(body))
            .andReturn();
    }

    // 官方密钥派生（§5.2）：secret 循环加倍截取 32 字节为 Ed25519 seed（RFC 8410 PKCS#8）
    private String sign(String timestamp, String body) {
        try {
            byte[] secret = APP_SECRET.getBytes(StandardCharsets.UTF_8);
            byte[] seed = new byte[32];
            for (int index = 0; index < seed.length; index++) {
                seed[index] = secret[index % secret.length];
            }
            byte[] pkcs8 = HexFormat.of().parseHex("302e020100300506032b657004220420");
            byte[] der = new byte[pkcs8.length + seed.length];
            System.arraycopy(pkcs8, 0, der, 0, pkcs8.length);
            System.arraycopy(seed, 0, der, pkcs8.length, seed.length);
            PrivateKey privateKey = KeyFactory.getInstance("Ed25519")
                .generatePrivate(new PKCS8EncodedKeySpec(der));
            Signature signature = Signature.getInstance("Ed25519");
            signature.initSign(privateKey);
            signature.update(timestamp.getBytes(StandardCharsets.UTF_8));
            signature.update(body.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(signature.sign());
        } catch (Exception e) {
            throw new IllegalStateException("测试签名构造失败", e);
        }
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

    private long newVisitor(String externalUserId, String firstText) {
        deskInboundService.accept(channels.getById(channelQq), new ChannelInboundMessage(channelQq,
            externalUserId, null, null, List.of(), "seed-" + externalUserId,
            MessageDirectionEnum.INCOMING, Map.of("type", "text", "text", firstText)));
        return jdbc.queryForObject(
            "SELECT visitor_id FROM visitor WHERE company_id = ? AND company_channel_id = ? AND external_user_id = ?",
            Long.class, COMPANY_ID, channelQq, externalUserId);
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
}
