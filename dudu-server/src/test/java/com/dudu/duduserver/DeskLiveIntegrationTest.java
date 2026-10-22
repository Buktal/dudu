package com.dudu.duduserver;

import cn.hutool.core.date.DateUtil;
import cn.hutool.crypto.digest.DigestUtil;
import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.dudu.duduserver.channel.ChannelInboundMessage;
import com.dudu.duduserver.config.auth.JwtUser;
import com.dudu.duduserver.constant.ChannelEnum;
import com.dudu.duduserver.constant.MessageDirectionEnum;
import com.dudu.duduserver.constant.UserRoleEnum;
import com.dudu.duduserver.entity.CompanyChannelDO;
import com.dudu.duduserver.entity.UserDO;
import com.dudu.duduserver.entity.UserGroupDO;
import com.dudu.duduserver.service.DeskInboundService;
import com.dudu.duduserver.testutil.IntegrationTestEnv;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.util.LinkedMultiValueMap;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 实时来信与登录订阅衔接在独立 MySQL、真实 HTTP 与真实 WebSocket 边界验收：
 * 新访客首信一次创建访客与空名片并推送完整报文（双客户端）、已有访客计数与等待时长规则、
 * 未授权员工不接收推送、Socket 认证失败业务码、签名与未接入协议拒绝、GET 验证与并发首信 sequence。
 * 通过环境变量显式启用，运行前需重建 dudu_review。
 */
@SpringBootTest(properties = {"dudu.auth.jwt-secret=integration-test-secret"},
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureMockMvc
@EnabledIfEnvironmentVariable(named = "DUDU_INTEGRATION_TEST", matches = "true")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class DeskLiveIntegrationTest extends DeskIntegrationSupport {

    // 企业 ID 与 ConsoleIdentityIntegrationTest 的自增号段（788000 起）错开，避免同一评审库内种子碰撞
    private static final long COMPANY_ID = 785001L;
    private static final long OTHER_COMPANY_ID = 785002L;
    private static final String CALLBACK_TOKEN = "live-callback-token";

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", IntegrationTestEnv::jdbcUrl);
        registry.add("spring.datasource.username", IntegrationTestEnv::dbUser);
        registry.add("spring.datasource.password", IntegrationTestEnv::dbPassword);
    }

    @Autowired DeskInboundService deskInboundService;

    private long channelWechat;
    private long channelDouyin;
    private String ownerToken;
    private String scopedToken;
    private String outsideToken;

    @BeforeAll
    void seed() throws Exception {
        companies.createCompany(company(COMPANY_ID, "liveowner", "实时验收企业"), 1L);
        companies.createCompany(company(OTHER_COMPANY_ID, "liveowner2", "实时验收企业"), 1L);
        UserGroupDO group = group(COMPANY_ID, "实时组");
        channelWechat = channel(COMPANY_ID, group.getGroupId(), ChannelEnum.WECHAT_MP, "公众号",
            Map.of("token", CALLBACK_TOKEN, "externalAccountId", "gh_live"));
        channelDouyin = channel(COMPANY_ID, group.getGroupId(), ChannelEnum.DOUYIN, "抖音号", Map.of("token", "x"));

        UserDO scoped = plainUser(COMPANY_ID, "live.scoped");
        members.save(member(COMPANY_ID, scoped.getUserId(), group.getGroupId()));
        plainUser(COMPANY_ID, "live.none");
        ownerToken = login(COMPANY_ID, "liveowner");
        scopedToken = login(COMPANY_ID, "live.scoped");
        outsideToken = login(COMPANY_ID, "live.none");
    }

    @Test
    void firstMessageCreatesVisitorWithEmptyProfileAndPushesFullFrameToBothClients() throws Exception {
        SocketClient owner = connectAndAuth(ownerToken);
        // 同一员工的第二台设备同样收到推送
        SocketClient ownerSecondDevice = connectAndAuth(ownerToken);
        SocketClient scoped = connectAndAuth(scopedToken);

        String msgId = "msg-" + System.nanoTime();
        assertThat(callback(channelWechat, signedParams(), textPush("gh_live", "live-ext-1", "你好，想咨询发货时间", msgId)))
            .isEqualTo(200);

        assertFrame(owner.next(Duration.ofSeconds(5)), "live-ext-1", "你好，想咨询发货时间", msgId, 1);
        assertFrame(ownerSecondDevice.next(Duration.ofSeconds(5)), "live-ext-1", "你好，想咨询发货时间", msgId, 1);
        assertFrame(scoped.next(Duration.ofSeconds(5)), "live-ext-1", "你好，想咨询发货时间", msgId, 1);

        Long visitorId = jdbc.queryForObject(
            "SELECT visitor_id FROM visitor WHERE company_id = ? AND external_user_id = 'live-ext-1'", Long.class,
            COMPANY_ID);
        JSONObject conversation = detail(ownerToken, visitorId).getJSONObject("data");
        assertThat(conversation.getStr("status")).isEqualTo("needs-reply");
        assertThat(conversation.getStr("preview")).isEqualTo("你好，想咨询发货时间");
        assertThat(conversation.getInt("messageCount")).isEqualTo(1);
        assertThat(conversation.getInt("version")).isEqualTo(2);
        assertThat(conversation.getStr("waitingSince")).isNotBlank();

        // 同一事务创建空名片；消息体按契约结构保存
        Map<String, Object> profile = jdbc.queryForMap("SELECT * FROM visitor_profile WHERE visitor_id = ?", visitorId);
        assertThat(profile.get("channel_fields")).isEqualTo("[]");
        assertThat(profile.get("tags")).isEqualTo("[]");
        Map<String, Object> row = jdbc.queryForMap("SELECT * FROM message WHERE visitor_id = ?", visitorId);
        assertThat(row.get("direction")).isEqualTo("incoming");
        assertThat(row.get("sequence")).isEqualTo(1L);
        assertThat(row.get("external_message_id")).isEqualTo(msgId);
        assertThat(row.get("content").toString()).contains("\"text\": \"你好，想咨询发货时间\"");

        // 推送后经查询接口读到的摘要与报文一致
        JSONObject page = data(JSONUtil.parseObj(mvc.perform(post("/api/desk/visitors/query")
                .header("Authorization", "Bearer " + scopedToken)
                .contentType(MediaType.APPLICATION_JSON).content("{\"search\": \"live-ext-1\"}"))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString()));
        assertThat(page.getLong("total")).isEqualTo(1L);
        JSONObject item = page.getJSONArray("items").getJSONObject(0);
        assertThat(item.getStr("id")).isEqualTo(String.valueOf(visitorId));
        assertThat(item.getStr("preview")).isEqualTo("你好，想咨询发货时间");
        assertThat(item.getInt("messageCount")).isEqualTo(1);

        JSONObject history = data(JSONUtil.parseObj(mvc.perform(get("/api/desk/visitors/" + visitorId + "/messages")
                .header("Authorization", "Bearer " + scopedToken))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString()));
        JSONObject message = history.getJSONArray("items").getJSONObject(0);
        assertThat(message.getInt("sequence")).isEqualTo(1);
        assertThat(message.getStr("direction")).isEqualTo("incoming");
        assertThat(message.getJSONObject("body").getStr("text")).isEqualTo("你好，想咨询发货时间");
    }

    @Test
    void repeatedMessagesIncrementSequenceAndKeepWaitingSince() throws Exception {
        callback(channelWechat, signedParams(), textPush("gh_live", "live-ext-2", "第一条", "m2-1"));
        Long visitorId = jdbc.queryForObject(
            "SELECT visitor_id FROM visitor WHERE company_id = ? AND external_user_id = 'live-ext-2'", Long.class,
            COMPANY_ID);
        LocalDateTime waitingSince = waitingSince(visitorId);

        Thread.sleep(50);
        assertThat(callback(channelWechat, signedParams(), textPush("gh_live", "live-ext-2", "第二条", "m2-2"))).isEqualTo(200);

        assertThat(waitingSince(visitorId)).isEqualTo(waitingSince);
        Map<String, Object> visitor = jdbc.queryForMap("SELECT * FROM visitor WHERE visitor_id = ?", visitorId);
        assertThat(visitor.get("message_count")).isEqualTo(2L);
        assertThat(visitor.get("version")).isEqualTo(3L);
        assertThat(visitor.get("last_message_preview")).isEqualTo("第二条");
        assertThat(visitor.get("status")).isEqualTo("needs-reply");
        List<Integer> sequences = jdbc.queryForList(
            "SELECT sequence FROM message WHERE visitor_id = ? ORDER BY sequence", Integer.class, visitorId);
        assertThat(sequences).containsExactly(1, 2);
    }

    @Test
    void channelProfileUpdatesDistinguishMissingEmptyAndAvailableValues() throws Exception {
        CompanyChannelDO account = channels.getById(channelWechat);
        deskInboundService.accept(account, new ChannelInboundMessage(channelWechat, "live-ext-profile",
            "渠道昵称", "http://avatar/1",
            List.of(new ChannelInboundMessage.ChannelField("城市", "广州"),
                new ChannelInboundMessage.ChannelField("手机号", null)),
            "p1", MessageDirectionEnum.INCOMING, Map.of("type", "text", "text", "带资料来信")));

        Long visitorId = jdbc.queryForObject(
            "SELECT visitor_id FROM visitor WHERE company_id = ? AND external_user_id = 'live-ext-profile'",
            Long.class, COMPANY_ID);
        Map<String, Object> visitor = jdbc.queryForMap("SELECT * FROM visitor WHERE visitor_id = ?", visitorId);
        assertThat(visitor.get("name")).isEqualTo("渠道昵称");
        assertThat(visitor.get("avatar_url")).isEqualTo("http://avatar/1");
        Map<String, Object> profile = jdbc.queryForMap("SELECT * FROM visitor_profile WHERE visitor_id = ?", visitorId);
        // MySQL 的 JSON 列在读出时带空格，断言按 JSON 语义匹配
        assertThat(profile.get("channel_fields").toString())
            .contains("\"label\": \"城市\"").contains("\"state\": \"available\"").contains("广州")
            .contains("\"label\": \"手机号\"").contains("\"state\": \"not-provided\"");
        assertThat(profile.get("version")).isEqualTo(2L);

        // 未提供的名称与资料保留原值；空串按渠道给出的空值覆盖
        deskInboundService.accept(account, new ChannelInboundMessage(channelWechat, "live-ext-profile",
            null, null,
            List.of(new ChannelInboundMessage.ChannelField("城市", "")),
            "p2", MessageDirectionEnum.INCOMING, Map.of("type", "text", "text", "第二条")));

        Map<String, Object> after = jdbc.queryForMap("SELECT * FROM visitor WHERE visitor_id = ?", visitorId);
        assertThat(after.get("name")).isEqualTo("渠道昵称");
        assertThat(after.get("avatar_url")).isEqualTo("http://avatar/1");
        Map<String, Object> profileAfter = jdbc.queryForMap("SELECT * FROM visitor_profile WHERE visitor_id = ?",
            visitorId);
        assertThat(profileAfter.get("channel_fields").toString())
            .contains("\"label\": \"城市\"").contains("\"state\": \"empty\"")
            .contains("\"label\": \"手机号\"").contains("\"state\": \"not-provided\"");
        assertThat(profileAfter.get("version")).isEqualTo(3L);

        // 渠道资料确实变化时随来信追加 profile 帧（同一提交后，不额外发 conversation）
        SocketClient client = connectAndAuth(scopedToken);
        Long pushVisitorId = acceptWithFields(List.of(new ChannelInboundMessage.ChannelField("城市", "深圳")), "p3");
        assertThat(client.next(Duration.ofSeconds(5)).getStr("type")).isEqualTo("message");
        JSONObject pushed = client.next(Duration.ofSeconds(5));
        assertThat(pushed.getStr("type")).isEqualTo("profile");
        JSONObject pushedProfile = pushed.getJSONObject("profile");
        assertThat(pushedProfile.getStr("conversationId")).isEqualTo(String.valueOf(pushVisitorId));
        assertThat(pushedProfile.getJSONArray("fields").toString()).contains("深圳");

        // 渠道资料与库中一致：只推来信，不重复推名片
        acceptWithFields(List.of(new ChannelInboundMessage.ChannelField("城市", "深圳")), "p4");
        assertThat(client.next(Duration.ofSeconds(5)).getStr("type")).isEqualTo("message");
        assertThat((Object) client.next(Duration.ofMillis(700))).isNull();
    }

    // 受控样本：渠道给出的资料项随来信入库，返回访客 ID
    private Long acceptWithFields(List<ChannelInboundMessage.ChannelField> fields, String externalMessageId) {
        deskInboundService.accept(channels.getById(channelWechat), new ChannelInboundMessage(channelWechat,
            "live-ext-profile-push", null, null, fields, externalMessageId,
            MessageDirectionEnum.INCOMING, Map.of("type", "text", "text", "资料推送来信")));
        return jdbc.queryForObject(
            "SELECT visitor_id FROM visitor WHERE company_id = ? AND external_user_id = 'live-ext-profile-push'",
            Long.class, COMPANY_ID);
    }

    @Test
    void incomingRestartsWaitingClockForWaitingVisitorAndReopensClosedVisitor() throws Exception {
        LocalDateTime created = LocalDateTime.of(2026, 10, 1, 8, 0, 0);
        insertVisitor(788101L, "live-ext-3", "waiting", null, created);
        insertVisitor(788102L, "live-ext-4", "closed", null, created);

        callback(channelWechat, signedParams(), textPush("gh_live", "live-ext-3", "再来一条", "m3"));
        callback(channelWechat, signedParams(), textPush("gh_live", "live-ext-4", "又来了", "m4"));

        for (long visitorId : new long[] {788101L, 788102L}) {
            Map<String, Object> visitor = jdbc.queryForMap("SELECT * FROM visitor WHERE visitor_id = ?", visitorId);
            assertThat(visitor.get("status")).isEqualTo("needs-reply");
            assertThat(waitingSince(visitorId)).isAfter(created);
        }
    }

    @Test
    void unauthorizedEmployeeStaysConnectedWithoutReceivingPushes() throws Exception {
        SocketClient owner = connectAndAuth(ownerToken);
        SocketClient outside = connectAndAuth(outsideToken);

        callback(channelWechat, signedParams(), textPush("gh_live", "live-ext-5", "只推给有权员工", "m5"));

        assertThat((Object) owner.next(Duration.ofSeconds(5))).isNotNull();
        assertThat((Object) outside.next(Duration.ofMillis(700))).isNull();
    }

    @Test
    void socketRejectsInvalidTokenAndKeepsBusinessCodes() throws Exception {
        SocketClient broken = connect();
        JSONObject error = sendAuth(broken, "not-a-token");
        assertThat(error.getStr("type")).isEqualTo("error");
        assertThat(error.getInt("code")).isEqualTo(10102);
        assertThat(error.getStr("msg")).isEqualTo("登录状态无效，请重新登录");
        assertThat(broken.closed.await(5, TimeUnit.SECONDS)).isTrue();

        // 平台管理员令牌不属于企业接待身份
        SocketClient admin = connect();
        JSONObject forbidden = sendAuth(admin, jwtManager.createToken(
            new JwtUser(null, 1L, UserRoleEnum.ADMIN, DateUtil.currentSeconds() + 600)));
        assertThat(forbidden.getInt("code")).isEqualTo(10106);

        // 归属企业不符的令牌按登录状态无效处理
        SocketClient mismatched = connect();
        JSONObject invalid = sendAuth(mismatched, jwtManager.createToken(
            new JwtUser(OTHER_COMPANY_ID, 1L, UserRoleEnum.USER, DateUtil.currentSeconds() + 600)));
        assertThat(invalid.getInt("code")).isEqualTo(10102);
    }

    @Test
    void callbackRejectsBadSignatureUnknownAccountAndUnsupportedProtocol() throws Exception {
        assertThat(callback(channelWechat, tamperedParams(), textPush("gh_live", "live-ext-6", "伪造", "m6"))).isEqualTo(403);
        assertThat(countMessagesOf("live-ext-6")).isZero();

        Map<String, String> params = signedParams();
        params.put("echostr", "echo-live");
        assertThat(mvc.perform(get("/api/channels/" + channelWechat + "/callback").params(queryParams(params)))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).isEqualTo("echo-live");

        assertThat(mvc.perform(get("/api/channels/" + channelWechat + "/callback").params(queryParams(tamperedParams())))
            .andExpect(status().isForbidden()).andReturn().getResponse().getContentAsString()).isEmpty();
        assertThat(mvc.perform(get("/api/channels/99999999/callback").params(queryParams(signedParams())))
            .andExpect(status().isNotFound()).andReturn().getResponse().getStatus()).isEqualTo(404);

        // 已接入协议之外的渠道与加密模式都返回不支持，不模拟成功
        assertThat(callback(channelDouyin, signedParams(), textPush("gh_live", "live-ext-7", "抖音", "m7"))).isEqualTo(501);
        Map<String, String> secure = signedParams();
        secure.put("encrypt_type", "aes");
        assertThat(callback(channelWechat, secure, textPush("gh_live", "live-ext-8", "安全模式", "m8"))).isEqualTo(501);
        assertThat(countMessagesOf("live-ext-7")).isZero();
    }

    @Test
    void concurrentFirstMessagesAllocateDistinctSequences() throws Exception {
        String xmlA = textPush("gh_live", "live-ext-9", "并发甲", "m9-a");
        String xmlB = textPush("gh_live", "live-ext-9", "并发乙", "m9-b");
        HttpClient client = HttpClient.newHttpClient();
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            Future<Integer> first = pool.submit(() -> postOverHttp(client, xmlA));
            Future<Integer> second = pool.submit(() -> postOverHttp(client, xmlB));
            assertThat(List.of(first.get(), second.get())).containsExactly(200, 200);
        } finally {
            pool.shutdownNow();
        }

        List<Integer> sequences = jdbc.queryForList("""
            SELECT m.sequence FROM message m JOIN visitor v ON v.visitor_id = m.visitor_id
            WHERE v.external_user_id = 'live-ext-9' ORDER BY m.sequence
            """, Integer.class);
        assertThat(sequences).containsExactly(1, 2);
        assertThat(jdbc.queryForObject("""
            SELECT COUNT(*) FROM visitor WHERE company_id = ? AND external_user_id = 'live-ext-9'
            """, Integer.class, COMPANY_ID)).isEqualTo(1);
    }

    private int callback(long channelId, Map<String, String> params, String body) throws Exception {
        return mvc.perform(post("/api/channels/" + channelId + "/callback").params(queryParams(params))
                .contentType(MediaType.valueOf("text/xml")).content(body))
            .andReturn().getResponse().getStatus();
    }

    private LinkedMultiValueMap<String, String> queryParams(Map<String, String> source) {
        LinkedMultiValueMap<String, String> params = new LinkedMultiValueMap<>();
        source.forEach(params::add);
        return params;
    }

    private int postOverHttp(HttpClient client, String body) throws Exception {
        StringBuilder url = new StringBuilder("http://127.0.0.1:" + port + "/api/channels/" + channelWechat + "/callback");
        signedParams().forEach((key, value) -> url.append("&").append(key).append("=").append(value));
        HttpRequest request = HttpRequest.newBuilder(URI.create(url.toString().replaceFirst("&", "?")))
            .header("Content-Type", "text/xml")
            .POST(HttpRequest.BodyPublishers.ofString(body))
            .timeout(Duration.ofSeconds(10))
            .build();
        return client.send(request, HttpResponse.BodyHandlers.ofString()).statusCode();
    }

    private void assertFrame(JSONObject frame, String externalUserId, String text, String msgId, int sequence) {
        assertThat((Object) frame).isNotNull();
        assertThat(frame.getStr("type")).isEqualTo("message");
        JSONObject message = frame.getJSONObject("message");
        assertThat(message.getStr("direction")).isEqualTo("incoming");
        assertThat(message.getInt("sequence")).isEqualTo(sequence);
        assertThat(message.getJSONObject("body").getStr("text")).isEqualTo(text);
        assertThat(message.getJSONObject("body").getStr("type")).isEqualTo("text");
        assertThat(message.getStr("createdAt")).isNotBlank();
        JSONObject conversation = frame.getJSONObject("conversation");
        assertThat(conversation.getStr("status")).isEqualTo("needs-reply");
        assertThat(conversation.getStr("preview")).isEqualTo(text);
        assertThat(conversation.getInt("messageCount")).isEqualTo(sequence);
        assertThat(conversation.getStr("waitingSince")).isNotBlank();
        assertThat(conversation.getJSONObject("identity").getStr("externalUserId")).isEqualTo(externalUserId);
        assertThat(conversation.getJSONObject("identity").getStr("channelId")).isEqualTo("wechat-mp");
        assertThat(conversation.getJSONObject("identity").getStr("accountId")).isEqualTo(String.valueOf(channelWechat));
        assertThat(conversation.getJSONObject("capability").getStr("state")).isEqualTo("restricted");
        assertThat(message.getStr("id")).isNotBlank();
        assertThat(conversation.getStr("id")).isNotBlank();
    }

    private long countMessagesOf(String externalUserId) {
        return jdbc.queryForObject("""
            SELECT COUNT(*) FROM message m JOIN visitor v ON v.visitor_id = m.visitor_id
            WHERE v.external_user_id = ?
            """, Long.class, externalUserId);
    }

    private LocalDateTime waitingSince(Long visitorId) {
        return jdbc.queryForObject("SELECT waiting_since FROM visitor WHERE visitor_id = ?", LocalDateTime.class,
            visitorId);
    }

    private void insertVisitor(long visitorId, String externalUserId, String status, LocalDateTime waitingSince,
                               LocalDateTime createTime) {
        jdbc.update("INSERT INTO visitor(visitor_id, company_id, company_channel_id, external_user_id, name, status,"
                + " last_message_preview, last_message_time, waiting_since, message_count, version, create_time, update_time)"
                + " VALUES(?, ?, ?, ?, NULL, ?, '', NULL, ?, 0, 1, ?, ?)",
            visitorId, COMPANY_ID, channelWechat, externalUserId, status, waitingSince, createTime, createTime);
        jdbc.update("INSERT INTO visitor_profile(visitor_id, channel_fields, tags, note, version, create_time, update_time)"
            + " VALUES(?, JSON_ARRAY(), JSON_ARRAY(), '', 1, ?, ?)", visitorId, createTime, createTime);
    }

    private Map<String, String> signedParams() {
        Map<String, String> params = new java.util.HashMap<>();
        String timestamp = String.valueOf(DateUtil.currentSeconds());
        String nonce = "nonce-" + System.nanoTime();
        params.put("timestamp", timestamp);
        params.put("nonce", nonce);
        params.put("signature", signature(CALLBACK_TOKEN, timestamp, nonce));
        return params;
    }

    private Map<String, String> tamperedParams() {
        Map<String, String> params = signedParams();
        params.put("signature", "0".repeat(40));
        return params;
    }

    private String signature(String token, String timestamp, String nonce) {
        String[] parts = {token, timestamp, nonce};
        Arrays.sort(parts);
        return DigestUtil.sha1Hex(String.join("", parts));
    }

    private JSONObject detail(String token, Long visitorId) throws Exception {
        return JSONUtil.parseObj(deskGet(token, "/api/desk/visitors/" + visitorId));
    }
}
