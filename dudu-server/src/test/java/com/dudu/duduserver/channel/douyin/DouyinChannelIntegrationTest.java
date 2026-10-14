package com.dudu.duduserver.channel.douyin;

import cn.hutool.json.JSONArray;
import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.dudu.duduserver.channel.ChannelInboundMessage;
import com.dudu.duduserver.constant.ChannelEnum;
import com.dudu.duduserver.constant.EnableStatusEnum;
import com.dudu.duduserver.constant.MessageDirectionEnum;
import com.dudu.duduserver.constant.UserRoleEnum;
import com.dudu.duduserver.dto.CompanyAdminInitDTO;
import com.dudu.duduserver.dto.CompanyCreateDTO;
import com.dudu.duduserver.entity.CompanyChannelDO;
import com.dudu.duduserver.entity.UserDO;
import com.dudu.duduserver.entity.UserGroupDO;
import com.dudu.duduserver.entity.UserGroupMemberDO;
import com.dudu.duduserver.service.CompanyChannelService;
import com.dudu.duduserver.service.CompanyService;
import com.dudu.duduserver.service.DeskInboundService;
import com.dudu.duduserver.service.UserGroupMemberService;
import com.dudu.duduserver.service.UserGroupService;
import com.dudu.duduserver.service.UserService;
import com.dudu.duduserver.testutil.IntegrationTestEnv;

import com.dudu.duduserver.util.PasswordHasher;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
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
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 抖音渠道在独立 MySQL 与真实 HTTP 边界验收（事实见 docs/research/channels/douyin.md，
 * mock-pulse 握手剧本同构）：verify_webhook 握手回显与非法签名拒绝、未配凭据不支持、
 * 全部消息类型落库与其余事件只应答、经真实发送链路（refresh_token 换 token 后场景一
 * 回复）的成功与渠道失败如实落库、emoji 直链素材读取与无下载通道/凭据缺失如实返回、
 * 能力限制真实原因。发送与素材走可控替身（不模拟假成功）。
 * 运行前需重建 dudu_review_118；回调报文走真实控制器，渠道外呼只落在替身上。
 */
@SpringBootTest(properties = {"dudu.auth.jwt-secret=integration-test-secret"},
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureMockMvc
@EnabledIfEnvironmentVariable(named = "DUDU_INTEGRATION_TEST", matches = "true")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class DouyinChannelIntegrationTest {

    private static final String PASSWORD = "password123";
    private static final long COMPANY_ID = 789118L;
    // channel_info 三键与回调验签材料
    private static final String CLIENT_KEY = "asdfavetgbvasf";
    private static final String CLIENT_SECRET = "9e096e3a2a8b4e0f9c0f";
    private static final String REFRESH_TOKEN = "rft.1d1021d2aee3d41fee2d2ad";
    // 信封 to_user_id（商家侧 open_id），发送时作 query open_id
    private static final String OWNER_OPEN_ID = "owner-open-dy";
    private static final String EMOJI_BYTES = "gif-bytes";

    // §6.1 场景一成功响应（逐字）：渠道消息标识为顶层 msg_id
    private static final String SEND_OK =
        "{\"extra\":{\"description\":\"\",\"sub_error_code\":0,\"sub_description\":\"\","
            + "\"now\":1648797449,\"logid\":\"021648797449846fd1b1111000700600000000000000086dfb920\","
            + "\"error_code\":0},\"data\":{\"error_code\":0,\"description\":\"\"},"
            + "\"msg_id\":\"@c29bfc000+MNggFhRkwGuX1ntuc0RPc0VHKefj/yWEJ8DtjU==\"}";

    // §6.1 渠道错误：28003081 上条消息已超 24 小时
    private static final String SEND_EXPIRED =
        "{\"extra\":{\"error_code\":28003081,\"description\":\"上条消息已经超过24小时，无法回复\","
            + "\"logid\":\"02172527001221200000000000000000000ffff0a70750423ef80\",\"now\":1725270012},"
            + "\"data\":{\"error_code\":28003081,\"description\":\"上条消息已经超过24小时，无法回复\"}}";

    private static final String REFRESH_OK =
        "{\"data\":{\"access_token\":\"act.stub-token\",\"expires_in\":1296000},\"message\":\"success\",\"code\":0}";

    // 渠道替身：启动于静态初始化，DynamicPropertySource 用其端口作 api-base
    private static final HttpServer STUB = startStub();
    private static final List<String> REFRESH_BODIES = new CopyOnWriteArrayList<>();
    private static final List<String> SEND_QUERIES = new CopyOnWriteArrayList<>();
    private static final List<String> SEND_TOKENS = new CopyOnWriteArrayList<>();
    private static final List<String> SEND_BODIES = new CopyOnWriteArrayList<>();
    private static volatile String sendAnswer = SEND_OK;

    private static HttpServer startStub() {
        try {
            HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            server.createContext("/oauth/refresh_token/", exchange -> {
                REFRESH_BODIES.add(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
                respond(exchange, REFRESH_OK);
            });
            server.createContext("/im/send/msg/", exchange -> {
                SEND_QUERIES.add(exchange.getRequestURI().getQuery());
                SEND_TOKENS.add(exchange.getRequestHeaders().getFirst("access-token"));
                SEND_BODIES.add(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
                respond(exchange, sendAnswer);
            });
            server.createContext("/emoji.gif", exchange -> {
                exchange.getResponseHeaders().set("Content-Type", "image/gif");
                byte[] body = EMOJI_BYTES.getBytes(StandardCharsets.UTF_8);
                exchange.sendResponseHeaders(200, body.length);
                exchange.getResponseBody().write(body);
                exchange.close();
            });
            server.start();
            return server;
        } catch (IOException e) {
            throw new IllegalStateException(e);
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
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", IntegrationTestEnv::jdbcUrl);
        registry.add("spring.datasource.username", IntegrationTestEnv::dbUser);
        registry.add("spring.datasource.password", IntegrationTestEnv::dbPassword);
        // 发送链路指向本机替身：真实发送代码 + 可控渠道响应
        registry.add("dudu.channel.douyin.api-base",
            () -> "http://127.0.0.1:" + STUB.getAddress().getPort());
    }

    @Autowired MockMvc mvc;
    @Autowired CompanyService companies;
    @Autowired UserService users;
    @Autowired UserGroupService groups;
    @Autowired UserGroupMemberService members;
    @Autowired CompanyChannelService channels;
    @Autowired DeskInboundService deskInboundService;
    @Autowired JdbcTemplate jdbc;

    private long channelFull;
    private long channelUnauthorized;
    private long channelUnconfigured;
    private String ownerToken;
    private String scopedToken;

    @BeforeAll
    void seed() throws Exception {
        companies.createCompany(company(COMPANY_ID, "douyinowner", "抖音验收企业"), 1L);
        UserGroupDO group = group(COMPANY_ID, "抖音组");
        channelFull = channel(COMPANY_ID, group.getGroupId(), "抖音机器人", Map.of(
            "clientKey", CLIENT_KEY,
            "clientSecret", CLIENT_SECRET,
            "refreshToken", REFRESH_TOKEN));
        // 缺 refreshToken：发送未完成用户授权，回调与素材不受影响
        channelUnauthorized = channel(COMPANY_ID, group.getGroupId(), "抖音未授权", Map.of(
            "clientKey", CLIENT_KEY,
            "clientSecret", CLIENT_SECRET));
        // 缺 clientSecret：凭据未配置，回调不支持、发送与素材受限
        channelUnconfigured = channel(COMPANY_ID, group.getGroupId(), "抖音未配凭据",
            Map.of("clientKey", CLIENT_KEY));
        UserDO scoped = plainUser(COMPANY_ID, "douyin.scoped", "坐席乙");
        members.save(member(COMPANY_ID, scoped.getUserId(), group.getGroupId()));
        ownerToken = login("douyinowner");
        scopedToken = login("douyin.scoped");
    }

    @AfterEach
    void resetStub() {
        sendAnswer = SEND_OK;
        REFRESH_BODIES.clear();
        SEND_QUERIES.clear();
        SEND_TOKENS.clear();
        SEND_BODIES.clear();
    }

    @AfterAll
    void stopStub() {
        STUB.stop(0);
    }

    @Test
    void handshakeEchoesNumericChallengeAndRejectsBadSignatureOrUnconfigured() throws Exception {
        String handshake = "{\"event\":\"verify_webhook\",\"content\":{\"challenge\":123456}}";

        MvcResult echoed = callback(channelFull, handshake);
        assertThat(echoed.getResponse().getStatus()).isEqualTo(200);
        assertThat(echoed.getResponse().getContentAsString()).isEqualTo("{\"challenge\":123456}");

        // 签名任一位不符按拒绝
        MvcResult tampered = mvc.perform(post("/api/channels/" + channelFull + "/callback")
                .contentType(MediaType.APPLICATION_JSON)
                .header("X-Douyin-Signature", "0".repeat(40))
                .content(handshake))
            .andReturn();
        assertThat(tampered.getResponse().getStatus()).isEqualTo(403);

        // 必填凭据缺失的账号按不支持（协议未接入该账号）
        MvcResult unconfigured = callback(channelUnconfigured, handshake);
        assertThat(unconfigured.getResponse().getStatus()).isEqualTo(501);
    }

    @Test
    void inboundMessageTypesLandAndAnswerOnlyEventsOnlyAcknowledge() throws Exception {
        String visitor = "dy-inbound-open";
        callback(channelFull, textEvent(visitor, "捷途70"));
        callback(channelFull, imageEvent(visitor));
        callback(channelFull, emojiEvent(visitor, stubUrl("/emoji.gif")));
        callback(channelFull, videoEvent(visitor));
        callback(channelFull, cardEvent(visitor));
        callback(channelFull, unknownEvent(visitor));

        List<Map<String, Object>> rows = jdbc.queryForList("""
            SELECT m.content, m.external_message_id FROM message m
            JOIN visitor v ON v.visitor_id = m.visitor_id
            WHERE v.external_user_id = ? AND v.company_channel_id = ? ORDER BY m.sequence
            """, visitor, channelFull);
        assertThat(rows).hasSize(6);
        assertThat(rows.get(0).get("content").toString()).contains("\"type\": \"text\"").contains("捷途70");
        // 回复三要素随消息留存：server_message_id:conversation_short_id:信封 to_user_id
        assertThat(rows.get(0).get("external_message_id"))
            .isEqualTo("@svr-text:@conv-short:" + OWNER_OPEN_ID);
        assertThat(rows.get(1).get("content").toString()).contains("\"type\": \"image\"").contains("@svr-media:0");
        assertThat(rows.get(2).get("content").toString()).contains(stubUrl("/emoji.gif"));
        assertThat(rows.get(3).get("content").toString()).contains("\"type\": \"video\"").contains("@item-video");
        assertThat(rows.get(4).get("content").toString()).contains("\"type\": \"card\"")
            .contains("retain_consult_card").contains("card-7a8b");
        assertThat(rows.get(5).get("content").toString()).contains("\"type\": \"unknown\"");
        // 访客身份随首条来信建档（user_infos 昵称头像）
        Map<String, Object> visitorRow = jdbc.queryForMap(
            "SELECT name, avatar_url FROM visitor WHERE external_user_id = ?", visitor);
        assertThat(visitorRow.get("name")).isEqualTo("刘东");
        assertThat(visitorRow.get("avatar_url")).isEqualTo("https://p3.douyinpic.com/aweme/100x100.jpeg");

        // 已读事件只应答：消息数不变
        callback(channelFull, readEvent(visitor));
        assertThat(jdbc.queryForObject(
            "SELECT COUNT(*) FROM message m JOIN visitor v ON v.visitor_id = m.visitor_id "
                + "WHERE v.external_user_id = ?", Integer.class, visitor)).isEqualTo(6);
    }

    @Test
    void replySendPersistsSuccessWithChannelMessageIdAndFailureWithRealReason() throws Exception {
        long visitorId = pushVisitor(channelFull, "dy-reply-open", "在吗");

        MvcResult sent = mvc.perform(post("/api/desk/visitors/" + visitorId + "/messages")
                .header("Authorization", "Bearer " + scopedToken)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"clientRequestId\": \"cr-douyin-1\", \"text\": \"好的，今天发出\"}"))
            .andExpect(status().isOk()).andReturn();
        JSONObject delivery = data(sent.getResponse().getContentAsString()).getJSONObject("delivery");
        assertThat(delivery.getStr("state")).isEqualTo("sent");
        Map<String, Object> saved = jdbc.queryForMap(
            "SELECT send_status, external_message_id, failure_reason FROM message "
                + "WHERE visitor_id = ? AND sequence = 2", visitorId);
        assertThat(saved.get("send_status")).isEqualTo("sent");
        assertThat(saved.get("external_message_id"))
            .isEqualTo("@c29bfc000+MNggFhRkwGuX1ntuc0RPc0VHKefj/yWEJ8DtjU==");
        assertThat(saved.get("failure_reason")).isNull();

        // 真实链路线格式：先 refresh_token 换 token（form 四参），再场景一回复
        assertThat(REFRESH_BODIES).hasSize(1);
        JSONObject form = parseForm(REFRESH_BODIES.get(0));
        assertThat(form.getStr("client_key")).isEqualTo(CLIENT_KEY);
        assertThat(form.getStr("client_secret")).isEqualTo(CLIENT_SECRET);
        assertThat(form.getStr("refresh_token")).isEqualTo(REFRESH_TOKEN);
        assertThat(form.getStr("grant_type")).isEqualTo("refresh_token");
        assertThat(SEND_QUERIES).hasSize(1);
        assertThat(SEND_QUERIES.get(0)).isEqualTo("open_id=" + OWNER_OPEN_ID);
        assertThat(SEND_TOKENS.get(0)).isEqualTo("act.stub-token");
        JSONObject wire = JSONUtil.parseObj(SEND_BODIES.get(0));
        assertThat(wire.getStr("scene")).isEqualTo("im_reply_msg");
        assertThat(wire.getStr("msg_id")).isEqualTo("@svr-dy-reply-open");
        assertThat(wire.getStr("conversation_id")).isEqualTo("@conv-dy-reply-open");
        assertThat(wire.getStr("to_user_id")).isEqualTo("dy-reply-open");
        assertThat(wire.getJSONObject("content").getInt("msg_type")).isEqualTo(1);
        assertThat(wire.getJSONObject("content").getJSONObject("text").getStr("text")).isEqualTo("好的，今天发出");

        // 渠道失败原样落库真实原因，不冒成功（token 命中缓存，不再刷新）
        sendAnswer = SEND_EXPIRED;
        MvcResult failed = mvc.perform(post("/api/desk/visitors/" + visitorId + "/messages")
                .header("Authorization", "Bearer " + scopedToken)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"clientRequestId\": \"cr-douyin-2\", \"text\": \"稍等\"}"))
            .andExpect(status().isOk()).andReturn();
        JSONObject failedDelivery = data(failed.getResponse().getContentAsString()).getJSONObject("delivery");
        assertThat(failedDelivery.getStr("state")).isEqualTo("failed");
        assertThat(failedDelivery.getStr("reason")).contains("28003081").contains("24小时");
        Map<String, Object> failedRow = jdbc.queryForMap(
            "SELECT send_status, failure_reason FROM message WHERE visitor_id = ? AND sequence = 3", visitorId);
        assertThat(failedRow.get("send_status")).isEqualTo("failed");
        assertThat(failedRow.get("failure_reason").toString()).contains("28003081").contains("24小时");
        assertThat(REFRESH_BODIES).hasSize(1);
    }

    @Test
    void mediaReadsFollowTheContractAndReportHonestFailures() throws Exception {
        // emoji 非空 resource_url 属公开链接：契约规定 Desk 直连 URL，本接口不代理（11000）
        long emojiMessageId = seedEmojiMessage(channelFull, "dy-media-open", stubUrl("/emoji.gif"));
        JSONObject publicLink = errorOf(mvc.perform(get("/api/desk/messages/" + emojiMessageId + "/media")
                .header("Authorization", "Bearer " + ownerToken))
            .andReturn());
        assertThat(publicLink.getInt("code")).isEqualTo(11000);
        assertThat(publicLink.getStr("msg")).contains("公开链接");

        // 图片载荷无素材标识（派生 @svr-media:0）：调用渠道读取边界并如实说明无官方下载通道
        callback(channelFull, imageEvent("dy-media-open"));
        long imageMessageId = jdbc.queryForObject("""
            SELECT m.message_id FROM message m JOIN visitor v ON v.visitor_id = m.visitor_id
            WHERE v.external_user_id = ? ORDER BY m.sequence DESC LIMIT 1
            """, Long.class, "dy-media-open");
        JSONObject noChannel = errorOf(mvc.perform(get("/api/desk/messages/" + imageMessageId + "/media")
                .header("Authorization", "Bearer " + ownerToken))
            .andReturn());
        assertThat(noChannel.getInt("code")).isEqualTo(13100);
        assertThat(noChannel.getStr("msg")).contains("无官方下载通道");

        // 凭据缺失：媒体读取不调用渠道，限制真实原因
        acceptVisitor(channelUnconfigured, "dy-nocreds-open", emojiBody(stubUrl("/emoji.gif")));
        JSONObject unconfiguredMedia = errorOf(mvc.perform(get("/api/desk/messages/"
                + lastMessageId("dy-nocreds-open") + "/media").header("Authorization", "Bearer " + ownerToken))
            .andReturn());
        assertThat(unconfiguredMedia.getInt("code")).isEqualTo(12200);
        assertThat(unconfiguredMedia.getStr("msg")).isEqualTo("渠道素材凭据未配置");

        // 未授权账号素材不受影响（素材读取只依赖应用凭据）
        acceptVisitor(channelUnauthorized, "dy-unauth-media", emojiBody(stubUrl("/emoji.gif")));
        long unauthorizedMediaId = lastMessageId("dy-unauth-media");
        MvcResult unauthorizedMedia = mvc.perform(get("/api/desk/messages/" + unauthorizedMediaId + "/media")
                .header("Authorization", "Bearer " + ownerToken))
            .andExpect(status().isOk()).andReturn();
        assertThat(unauthorizedMedia.getResponse().getContentAsByteArray())
            .isEqualTo(EMOJI_BYTES.getBytes(StandardCharsets.UTF_8));
        assertThat(unauthorizedMedia.getResponse().getContentType()).isEqualTo("image/gif");
    }

    @Test
    void capabilityReflectsAuthorizationAndCredentials() throws Exception {
        // 凭据齐全但未完成用户授权：限制真实原因指向授权缺口
        long unauthorizedVisitor = acceptVisitor(channelUnauthorized, "dy-cap-unauth",
            Map.of("type", "text", "text", "未授权咨询"));
        JSONObject unauthorized = capability(unauthorizedVisitor);
        assertThat(unauthorized.getStr("state")).isEqualTo("restricted");
        assertThat(unauthorized.getStr("reason"))
            .isEqualTo("抖音发送未完成用户授权：channel_info 缺少 refreshToken（需运营完成抖音号授权后录入）");
        JSONObject rejected = JSONUtil.parseObj(mvc.perform(post("/api/desk/visitors/" + unauthorizedVisitor
                    + "/messages").header("Authorization", "Bearer " + scopedToken)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"clientRequestId\": \"cr-douyin-x\", \"text\": \"不可发\"}"))
            .andReturn().getResponse().getContentAsString());
        assertThat(rejected.getInt("code")).isEqualTo(12200);
        assertThat(rejected.getStr("msg"))
            .isEqualTo("抖音发送未完成用户授权：channel_info 缺少 refreshToken（需运营完成抖音号授权后录入）");

        // 必填凭据缺失：凭据未配置
        long unconfiguredVisitor = acceptVisitor(channelUnconfigured, "dy-cap-nocreds",
            Map.of("type", "text", "text", "无凭据咨询"));
        JSONObject unconfigured = capability(unconfiguredVisitor);
        assertThat(unconfigured.getStr("state")).isEqualTo("restricted");
        assertThat(unconfigured.getStr("reason")).isEqualTo("渠道发送凭据未配置");

        // 凭据与授权齐全：allowed 且只支持文本
        long fullVisitor = pushVisitor(channelFull, "dy-cap-full", "能力来信");
        JSONObject allowed = capability(fullVisitor);
        assertThat(allowed.getStr("state")).isEqualTo("allowed");
        assertThat(allowed.getJSONArray("kinds")).containsExactly("text");
    }

    // ---- 夹具 ----

    private String stubUrl(String path) {
        return "http://127.0.0.1:" + STUB.getAddress().getPort() + path;
    }

    // 带验签头的回调提交（§4.1：sha1(client_secret + body) 小写 hex）
    private MvcResult callback(long channelId, String body) throws Exception {
        return mvc.perform(post("/api/channels/" + channelId + "/callback")
                .contentType(MediaType.APPLICATION_JSON)
                .header("X-Douyin-Signature", sign(body))
                .content(body))
            .andReturn();
    }

    private String sign(String body) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-1");
            digest.update(CLIENT_SECRET.getBytes(StandardCharsets.UTF_8));
            digest.update(body.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest.digest());
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    // §2.1 事件信封 + user_infos 昵称头像
    private String textEvent(String from, String text) {
        JSONObject content = JSONUtil.createObj()
            .set("message_type", "text")
            .set("text", text)
            .set("server_message_id", "@svr-text")
            .set("conversation_short_id", "@conv-short")
            .set("user_infos", userInfo(from));
        return receiveEvent(from, content);
    }

    private String imageEvent(String from) {
        return receiveEvent(from, JSONUtil.createObj()
            .set("message_type", "image")
            .set("server_message_id", "@svr-media")
            .set("conversation_short_id", "@conv-media"));
    }

    private String emojiEvent(String from, String resourceUrl) {
        return receiveEvent(from, JSONUtil.createObj()
            .set("message_type", "emoji")
            .set("server_message_id", "@svr-emoji")
            .set("conversation_short_id", "@conv-emoji")
            .set("resource_url", resourceUrl));
    }

    private String videoEvent(String from) {
        return receiveEvent(from, JSONUtil.createObj()
            .set("message_type", "video")
            .set("item_id", "@item-video")
            .set("server_message_id", "@svr-video")
            .set("conversation_short_id", "@conv-video"));
    }

    private String cardEvent(String from) {
        return receiveEvent(from, JSONUtil.createObj()
            .set("message_type", "retain_consult_card")
            .set("card_id", "card-7a8b")
            .set("server_message_id", "@svr-card")
            .set("conversation_short_id", "@conv-card"));
    }

    private String unknownEvent(String from) {
        return receiveEvent(from, JSONUtil.createObj()
            .set("message_type", "share_ai_card")
            .set("server_message_id", "@svr-unknown")
            .set("conversation_short_id", "@conv-unknown"));
    }

    // 已读事件（官方独立事件类型）：只应答不落库
    private String readEvent(String from) {
        return JSONUtil.createObj()
            .set("event", "im_message_read")
            .set("from_user_id", from)
            .set("to_user_id", OWNER_OPEN_ID)
            .set("client_key", CLIENT_KEY)
            .set("content", JSONUtil.createObj().set("message_id", "@svr-text"))
            .toString();
    }

    private String receiveEvent(String from, JSONObject content) {
        return JSONUtil.createObj()
            .set("event", "im_receive_msg")
            .set("from_user_id", from)
            .set("to_user_id", OWNER_OPEN_ID)
            .set("client_key", CLIENT_KEY)
            .set("log_id", "log-" + from)
            .set("content", content)
            .toString();
    }

    private JSONArray userInfo(String from) {
        return JSONUtil.createArray().put(JSONUtil.createObj()
            .set("open_id", from)
            .set("nick_name", "刘东")
            .set("avatar", "https://p3.douyinpic.com/aweme/100x100.jpeg"));
    }

    // 经真实回调入站建档，返回访客 ID（来信标识取自事件，构成回复上下文）
    private long pushVisitor(long channelId, String externalUserId, String firstText) throws Exception {
        callback(channelId, receiveEvent(externalUserId, JSONUtil.createObj()
            .set("message_type", "text")
            .set("text", firstText)
            .set("server_message_id", "@svr-" + externalUserId)
            .set("conversation_short_id", "@conv-" + externalUserId)));
        return jdbc.queryForObject(
            "SELECT visitor_id FROM visitor WHERE company_channel_id = ? AND external_user_id = ?",
            Long.class, channelId, externalUserId);
    }

    // 经真实回调入站一条 emoji 消息，返回消息 ID
    private long seedEmojiMessage(long channelId, String externalUserId, String resourceUrl) throws Exception {
        callback(channelId, emojiEvent(externalUserId, resourceUrl));
        return jdbc.queryForObject("""
            SELECT m.message_id FROM message m JOIN visitor v ON v.visitor_id = m.visitor_id
            WHERE v.external_user_id = ? ORDER BY m.sequence DESC LIMIT 1
            """, Long.class, externalUserId);
    }

    // 无凭据账号回调不支持：直接走业务层入站建档，返回访客 ID（素材/能力场景用）
    private long acceptVisitor(long channelId, String externalUserId, Map<String, Object> content) {
        CompanyChannelDO account = channels.getById(channelId);
        deskInboundService.accept(account, new ChannelInboundMessage(channelId, externalUserId,
            null, null, List.of(), "seed-" + externalUserId, MessageDirectionEnum.INCOMING, content));
        return jdbc.queryForObject(
            "SELECT visitor_id FROM visitor WHERE company_channel_id = ? AND external_user_id = ?",
            Long.class, channelId, externalUserId);
    }

    // 取访客最近一条消息 ID（素材读取定位用）
    private long lastMessageId(String externalUserId) {
        return jdbc.queryForObject("""
            SELECT m.message_id FROM message m JOIN visitor v ON v.visitor_id = m.visitor_id
            WHERE v.external_user_id = ? ORDER BY m.sequence DESC LIMIT 1
            """, Long.class, externalUserId);
    }

    // emoji 直链素材的统一消息体（acceptVisitor 用）
    private Map<String, Object> emojiBody(String resourceUrl) {
        return Map.of("type", "image", "media", Map.of("kind", "image", "id", resourceUrl));
    }

    private JSONObject capability(long visitorId) throws Exception {
        return data(mvc.perform(get("/api/desk/visitors/" + visitorId + "/capability")
                .header("Authorization", "Bearer " + ownerToken))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }

    private JSONObject errorOf(MvcResult result) throws Exception {
        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        return JSONUtil.parseObj(result.getResponse().getContentAsString());
    }

    private JSONObject data(String response) {
        JSONObject json = JSONUtil.parseObj(response);
        assertThat(json.getInt("code")).isZero();
        return json.getJSONObject("data");
    }

    // form-urlencoded 请求体解析（refresh_token 换取调用线格式）
    private JSONObject parseForm(String body) {
        JSONObject form = JSONUtil.createObj();
        for (String pair : body.split("&")) {
            int eq = pair.indexOf('=');
            form.set(URLDecoder.decode(pair.substring(0, eq), StandardCharsets.UTF_8),
                URLDecoder.decode(pair.substring(eq + 1), StandardCharsets.UTF_8));
        }
        return form;
    }

    private CompanyCreateDTO company(long companyId, String adminUsername, String companyName) {
        return new CompanyCreateDTO(String.valueOf(companyId), companyName, null, null, null,
            new CompanyAdminInitDTO(adminUsername, PASSWORD, null));
    }

    private UserGroupDO group(long companyId, String name) {
        UserGroupDO group = new UserGroupDO();
        group.setCompanyId(companyId);
        group.setGroupName(name);
        groups.save(group);
        return group;
    }

    private long channel(long companyId, long groupId, String accountName, Map<String, Object> channelInfo) {
        CompanyChannelDO account = new CompanyChannelDO();
        account.setCompanyId(companyId);
        account.setGroupId(groupId);
        account.setChannel(ChannelEnum.DOUYIN);
        account.setAccountName(accountName);
        account.setChannelInfo(channelInfo);
        channels.save(account);
        return account.getCompanyChannelId();
    }

    private UserDO plainUser(long companyId, String username, String name) {
        UserDO user = new UserDO();
        user.setCompanyId(companyId);
        user.setUsername(username);
        user.setName(name);
        user.setPasswordHash(PasswordHasher.hash(PASSWORD));
        user.setRole(UserRoleEnum.USER);
        user.setStatus(EnableStatusEnum.ENABLED);
        users.save(user);
        return user;
    }

    private UserGroupMemberDO member(long companyId, long userId, long groupId) {
        UserGroupMemberDO member = new UserGroupMemberDO();
        member.setCompanyId(companyId);
        member.setUserId(userId);
        member.setGroupId(groupId);
        return member;
    }

    private String login(String username) throws Exception {
        String body = mvc.perform(post("/api/desk/login").contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"companyId": "%s", "username": "%s", "password": "%s"}
                    """.formatted(COMPANY_ID, username, PASSWORD)))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        JSONObject data = JSONUtil.parseObj(body).getJSONObject("data");
        assertThat(data.getStr("token")).isNotBlank();
        return data.getStr("token");
    }
}
