package com.dudu.duduserver;

import cn.hutool.core.date.DateUtil;
import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.dudu.duduserver.channel.ChannelInboundMessage;
import com.dudu.duduserver.config.auth.JwtManager;
import com.dudu.duduserver.config.auth.JwtUser;
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
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 结束 / 继续接待在独立 MySQL、真实 HTTP 与真实 WebSocket 边界验收：只改接待状态与等待计时、
 * HTTP 返回与 conversation 报文一致（有权员工含操作者本人都收到）、结束后来信重新待回复、
 * 来信后结束保持已结束、两种后端提交顺序、非法输入与越权错误码、名单与计数随状态变化。
 * 通过环境变量显式启用，运行前需重建 dudu_review。
 */
@SpringBootTest(properties = {"dudu.auth.jwt-secret=integration-test-secret"},
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureMockMvc
@EnabledIfEnvironmentVariable(named = "DUDU_INTEGRATION_TEST", matches = "true")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class DeskReceptionIntegrationTest {

    private static final String PASSWORD = "password123";
    private static final long COMPANY_ID = 791001L;
    private static final long OTHER_COMPANY_ID = 791002L;

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", IntegrationTestEnv::jdbcUrl);
        registry.add("spring.datasource.username", IntegrationTestEnv::dbUser);
        registry.add("spring.datasource.password", IntegrationTestEnv::dbPassword);
    }

    @LocalServerPort int port;
    @Autowired MockMvc mvc;
    @Autowired CompanyService companies;
    @Autowired UserService users;
    @Autowired UserGroupService groups;
    @Autowired UserGroupMemberService members;
    @Autowired CompanyChannelService channels;
    @Autowired DeskInboundService deskInboundService;
    @Autowired JwtManager jwtManager;
    @Autowired JdbcTemplate jdbc;

    private long channelWechat;
    private String ownerToken;
    private String scopedToken;
    private String outsideToken;

    private final List<WebSocketSession> openSessions = new ArrayList<>();

    @BeforeAll
    void seed() {
        companies.createCompany(company(COMPANY_ID, "receptionowner"), 1L);
        companies.createCompany(company(OTHER_COMPANY_ID, "receptionowner2"), 1L);
        UserGroupDO group = group(COMPANY_ID, "接待组");
        channelWechat = channel(COMPANY_ID, group.getGroupId(), ChannelEnum.WECHAT_MP, "公众号",
            Map.of("token", "reception-token"));

        UserDO scoped = plainUser(COMPANY_ID, "reception.scoped");
        members.save(member(COMPANY_ID, scoped.getUserId(), group.getGroupId()));
        plainUser(COMPANY_ID, "reception.none");
        ownerToken = login("receptionowner");
        scopedToken = login("reception.scoped");
        outsideToken = login("reception.none");
    }

    @AfterEach
    void closeSockets() throws Exception {
        for (WebSocketSession session : openSessions) {
            if (session.isOpen()) {
                session.close(CloseStatus.NORMAL);
            }
        }
        openSessions.clear();
    }

    @Test
    void endWritesClosedClearsWaitingAndPushesToEveryAuthorizedClient() throws Exception {
        long visitorId = newVisitor("reception-ext-1", "想咨询发货时间");
        SocketClient owner = connectAndAuth(ownerToken);
        SocketClient scoped = connectAndAuth(scopedToken);
        SocketClient outside = connectAndAuth(outsideToken);

        JSONObject conversation = data(putStatus(scopedToken, visitorId, "closed"));
        assertThat(conversation.getStr("id")).isEqualTo(String.valueOf(visitorId));
        assertThat(conversation.getStr("status")).isEqualTo("closed");
        assertThat(conversation.isNull("waitingSince")).isTrue();
        assertThat(conversation.getStr("preview")).isEqualTo("想咨询发货时间");
        assertThat(conversation.getInt("messageCount")).isEqualTo(1);
        assertThat(conversation.getInt("version")).isEqualTo(3);

        // HTTP 返回与 Socket 报文是后端保存的同一份会话对象；有权员工含操作者本人都收到
        assertFrame(owner.next(Duration.ofSeconds(5)), visitorId, "closed");
        assertFrame(scoped.next(Duration.ofSeconds(5)), visitorId, "closed");
        assertThat((Object) outside.next(Duration.ofMillis(700))).isNull();

        // 只改接待状态与等待计时：消息、名片与最后摘要保持原样
        Map<String, Object> visitor = jdbc.queryForMap("SELECT * FROM visitor WHERE visitor_id = ?", visitorId);
        assertThat(visitor.get("status")).isEqualTo("closed");
        assertThat(visitor.get("waiting_since")).isNull();
        assertThat(visitor.get("version")).isEqualTo(3L);
        assertThat(visitor.get("message_count")).isEqualTo(1L);
        assertThat(visitor.get("last_message_preview")).isEqualTo("想咨询发货时间");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM message WHERE visitor_id = ?", Long.class, visitorId))
            .isEqualTo(1L);
        assertThat(jdbc.queryForObject("SELECT version FROM visitor_profile WHERE visitor_id = ?", Integer.class,
            visitorId)).isEqualTo(1);
    }

    @Test
    void resumeWritesNeedsReplyAndRestartsTheWaitingClockUnlessAlreadyAwaiting() throws Exception {
        long closedId = newVisitor("reception-ext-2", "结束后继续");
        long waitingId = newVisitor("reception-ext-3", "等待中继续");
        long pendingId = newVisitor("reception-ext-4", "本来就待回复");
        SocketClient owner = connectAndAuth(ownerToken);
        LocalDateTime closedAt = LocalDateTime.now();
        putStatus(scopedToken, closedId, "closed");
        assertFrame(owner.next(Duration.ofSeconds(5)), closedId, "closed");
        Thread.sleep(50);

        JSONObject resumed = data(putStatus(ownerToken, closedId, "needs-reply"));
        assertThat(resumed.getStr("status")).isEqualTo("needs-reply");
        assertThat(resumed.getStr("waitingSince")).isNotBlank();
        assertThat(resumed.getInt("version")).isEqualTo(4);
        assertFrame(owner.next(Duration.ofSeconds(5)), closedId, "needs-reply");
        assertThat(waitingSince(closedId)).isAfter(closedAt);
        assertThat(jdbc.queryForObject("SELECT version FROM visitor WHERE visitor_id = ?", Integer.class, closedId))
            .isEqualTo(4);

        // 等待中（计时已清空）继续：重新进入待回复并按当前时间重新计时
        jdbc.update("UPDATE visitor SET status = 'waiting', waiting_since = NULL, version = version + 1"
            + " WHERE visitor_id = ?", waitingId);
        JSONObject restarted = data(putStatus(ownerToken, waitingId, "needs-reply"));
        assertThat(restarted.getStr("status")).isEqualTo("needs-reply");
        assertThat(restarted.getStr("waitingSince")).isNotBlank();

        // 原已是待回复：保留原 waiting_since，不重复写库、不增加 version
        LocalDateTime before = waitingSince(pendingId);
        JSONObject kept = data(putStatus(ownerToken, pendingId, "needs-reply"));
        assertThat(kept.getStr("waitingSince")).isNotBlank();
        assertThat(waitingSince(pendingId)).isEqualTo(before);
        assertThat(kept.getInt("version")).isEqualTo(2);
        // 只有两段继续流程产生了推送，待回复重复继续没有新报文
        assertFrame(owner.next(Duration.ofSeconds(5)), waitingId, "needs-reply");
        assertThat((Object) owner.next(Duration.ofMillis(500))).isNull();
    }

    @Test
    void incomingAfterEndReopensTheSameVisitorAndKeepsItsHistory() throws Exception {
        long visitorId = newVisitor("reception-ext-5", "第一次来信");
        data(putStatus(scopedToken, visitorId, "closed"));
        LocalDateTime closedAt = LocalDateTime.now();
        Thread.sleep(50);
        SocketClient scoped = connectAndAuth(scopedToken);

        // 结束后再次来信：复用原访客与历史，状态回 needs-reply 并重新计时，sequence 继续
        receive("reception-ext-5", "结束后又来信", "reception-m5");
        JSONObject frame = scoped.next(Duration.ofSeconds(5));
        assertThat(frame.getStr("type")).isEqualTo("message");
        assertThat(frame.getJSONObject("message").getInt("sequence")).isEqualTo(2);
        assertThat(frame.getJSONObject("message").getJSONObject("body").getStr("text")).isEqualTo("结束后又来信");
        JSONObject conversation = frame.getJSONObject("conversation");
        assertThat(conversation.getStr("id")).isEqualTo(String.valueOf(visitorId));
        assertThat(conversation.getStr("status")).isEqualTo("needs-reply");
        assertThat(conversation.getStr("waitingSince")).isNotBlank();
        assertThat(conversation.getInt("messageCount")).isEqualTo(2);

        assertThat(jdbc.queryForObject("""
            SELECT COUNT(*) FROM visitor WHERE company_id = ? AND external_user_id = 'reception-ext-5'
            """, Long.class, COMPANY_ID)).isEqualTo(1L);
        assertThat(jdbc.queryForObject("SELECT message_count FROM visitor WHERE visitor_id = ?", Integer.class,
            visitorId)).isEqualTo(2);
        assertThat(waitingSince(visitorId)).isAfter(closedAt);
        // 原历史保留：历史接口按 sequence 返回两条
        JSONObject history = data(JSONUtil.parseObj(mvc.perform(get("/api/desk/visitors/" + visitorId + "/messages")
                .header("Authorization", "Bearer " + scopedToken))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString()));
        assertThat(history.getJSONArray("items")).hasSize(2);
        // 入列：待回复筛选能看到该访客，已结束筛选看不到
        assertThat(ids(query(scopedToken, "{\"status\": \"needs-reply\"}"))).contains(String.valueOf(visitorId));
        assertThat(ids(query(scopedToken, "{\"status\": \"closed\"}"))).doesNotContain(String.valueOf(visitorId));
    }

    @Test
    void backendCommitOrderDecidesBetweenEndAndIncoming() throws Exception {
        // 结束先提交：后续来信重新待回复，并按当前时间重新计时
        long endedFirst = newVisitor("reception-ext-6", "来信一");
        data(putStatus(scopedToken, endedFirst, "closed"));
        LocalDateTime endCommitted = LocalDateTime.now();
        Thread.sleep(50);
        receive("reception-ext-6", "结束后来信", "reception-m6");
        Map<String, Object> reopened = jdbc.queryForMap(
            "SELECT status, waiting_since FROM visitor WHERE visitor_id = ?", endedFirst);
        assertThat(reopened.get("status")).isEqualTo("needs-reply");
        assertThat((LocalDateTime) reopened.get("waiting_since")).isAfter(endCommitted);

        // 来信先提交：后续结束生效（closed），最后一条消息与计数保留
        long incomingFirst = newVisitor("reception-ext-7", "来信二");
        receive("reception-ext-7", "结束前来信", "reception-m7");
        JSONObject ended = data(putStatus(scopedToken, incomingFirst, "closed"));
        assertThat(ended.getStr("status")).isEqualTo("closed");
        assertThat(ended.getInt("messageCount")).isEqualTo(2);
        Map<String, Object> closed = jdbc.queryForMap(
            "SELECT status, waiting_since, last_message_preview FROM visitor WHERE visitor_id = ?", incomingFirst);
        assertThat(closed.get("status")).isEqualTo("closed");
        assertThat(closed.get("waiting_since")).isNull();
        assertThat(closed.get("last_message_preview")).isEqualTo("结束前来信");
    }

    @Test
    void statusChangeRejectsUnknownValuesUnauthorizedVisitorsAndMissingIdentity() throws Exception {
        long visitorId = newVisitor("reception-ext-9", "错误码来访");
        long otherCompanyVisitorId = otherCompanyVisitor();

        assertThat(putStatus(scopedToken, visitorId, "waiting").getInt("code")).isEqualTo(11000);
        assertThat(putStatus(scopedToken, visitorId, "bogus").getInt("code")).isEqualTo(11000);
        assertThat(putStatus(scopedToken, visitorId, null).getInt("code")).isEqualTo(11100);
        assertThat(putStatus(scopedToken, 791999L, "closed").getInt("code")).isEqualTo(12100);
        assertThat(putStatus(scopedToken, otherCompanyVisitorId, "closed").getInt("code")).isEqualTo(10106);
        assertThat(putStatus(outsideToken, visitorId, "closed").getInt("code")).isEqualTo(10106);
        assertThat(putStatus(null, visitorId, "closed").getInt("code")).isEqualTo(10101);
        assertThat(putStatus(jwtManager.createToken(
            new JwtUser(null, 1L, UserRoleEnum.ADMIN, DateUtil.currentSeconds() + 600)), visitorId, "closed")
            .getInt("code")).isEqualTo(10106);

        // 被拒绝的请求不改变接待状态
        Map<String, Object> visitor = jdbc.queryForMap("SELECT status, version FROM visitor WHERE visitor_id = ?",
            visitorId);
        assertThat(visitor.get("status")).isEqualTo("needs-reply");
        assertThat(visitor.get("version")).isEqualTo(2L);
    }

    @Test
    void listAndCountsFollowTheSavedStatus() throws Exception {
        long visitorId = newVisitor("reception-ext-10", "计数来访");
        String id = String.valueOf(visitorId);
        JSONObject before = data(query(scopedToken, "{\"status\": \"all\"}"));
        assertThat(ids(query(scopedToken, "{\"status\": \"active\"}"))).contains(id);

        data(putStatus(scopedToken, visitorId, "closed"));
        JSONObject afterEnd = data(query(scopedToken, "{\"status\": \"all\"}"));
        assertThat(afterEnd.getJSONObject("counts").getInt("needsReply"))
            .isEqualTo(before.getJSONObject("counts").getInt("needsReply") - 1);
        assertThat(afterEnd.getJSONObject("counts").getInt("waiting"))
            .isEqualTo(before.getJSONObject("counts").getInt("waiting"));
        assertThat(afterEnd.getJSONObject("counts").getInt("closed"))
            .isEqualTo(before.getJSONObject("counts").getInt("closed") + 1);
        assertThat(ids(query(scopedToken, "{\"status\": \"closed\"}"))).contains(id);
        assertThat(ids(query(scopedToken, "{\"status\": \"active\"}"))).doesNotContain(id);

        data(putStatus(scopedToken, visitorId, "needs-reply"));
        JSONObject afterResume = data(query(scopedToken, "{\"status\": \"all\"}"));
        for (String key : List.of("active", "needsReply", "waiting", "closed")) {
            assertThat(afterResume.getJSONObject("counts").getInt(key))
                .isEqualTo(before.getJSONObject("counts").getInt(key));
        }
        assertThat(ids(query(scopedToken, "{\"status\": \"active\"}"))).contains(id);
        assertThat(ids(query(scopedToken, "{\"status\": \"closed\"}"))).doesNotContain(id);
    }

    private long otherCompanyVisitor() {
        UserGroupDO otherGroup = group(OTHER_COMPANY_ID, "外部接待组");
        long otherChannel = channel(OTHER_COMPANY_ID, otherGroup.getGroupId(), ChannelEnum.WECHAT_MP, "外部公众号",
            Map.of("token", "reception-token"));
        deskInboundService.accept(channels.getById(otherChannel), new ChannelInboundMessage(otherChannel,
            "reception-ext-other", null, null, List.of(), "seed-other", MessageDirectionEnum.INCOMING,
            Map.of("type", "text", "text", "外部来信")));
        return jdbc.queryForObject("""
            SELECT visitor_id FROM visitor WHERE company_id = ? AND external_user_id = 'reception-ext-other'
            """, Long.class, OTHER_COMPANY_ID);
    }

    private LocalDateTime waitingSince(long visitorId) {
        return jdbc.queryForObject("SELECT waiting_since FROM visitor WHERE visitor_id = ?", LocalDateTime.class,
            visitorId);
    }

    private JSONObject query(String token, String body) throws Exception {
        return JSONUtil.parseObj(mvc.perform(post("/api/desk/visitors/query")
                .header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }

    private List<String> ids(JSONObject response) {
        JSONObject data = data(response);
        return data.getJSONArray("items").stream()
            .map(item -> ((JSONObject) item).getStr("id"))
            .toList();
    }

    private void assertFrame(JSONObject frame, long visitorId, String status) {
        assertThat((Object) frame).isNotNull();
        assertThat(frame.keySet()).containsExactlyInAnyOrder("type", "conversation");
        assertThat(frame.getStr("type")).isEqualTo("conversation");
        JSONObject conversation = frame.getJSONObject("conversation");
        assertThat(conversation.getStr("id")).isEqualTo(String.valueOf(visitorId));
        assertThat(conversation.getStr("status")).isEqualTo(status);
        assertThat(conversation.isNull("message")).isTrue();
    }

    private JSONObject putStatus(String token, long visitorId, String value) throws Exception {
        var request = put("/api/desk/visitors/" + visitorId + "/status")
            .contentType(MediaType.APPLICATION_JSON)
            .content(JSONUtil.createObj().set("status", value).toString());
        if (token != null) {
            request = request.header("Authorization", "Bearer " + token);
        }
        return JSONUtil.parseObj(mvc.perform(request).andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString());
    }

    private JSONObject data(JSONObject response) {
        assertThat(response.getInt("code")).isZero();
        return response.getJSONObject("data");
    }

    private long newVisitor(String externalUserId, String firstText) {
        receive(externalUserId, firstText, "seed-" + externalUserId);
        return jdbc.queryForObject("""
            SELECT visitor_id FROM visitor WHERE company_id = ? AND external_user_id = ?
            """, Long.class, COMPANY_ID, externalUserId);
    }

    private void receive(String externalUserId, String text, String externalMessageId) {
        deskInboundService.accept(channels.getById(channelWechat), new ChannelInboundMessage(channelWechat,
            externalUserId, null, null, List.of(), externalMessageId, MessageDirectionEnum.INCOMING,
            Map.of("type", "text", "text", text)));
    }

    private SocketClient connectAndAuth(String token) throws Exception {
        SocketClient client = new SocketClient();
        WebSocketSession session = new StandardWebSocketClient()
            .execute(client, "ws://127.0.0.1:" + port + "/ws/desk")
            .get(5, TimeUnit.SECONDS);
        openSessions.add(session);
        client.session = session;
        session.sendMessage(new TextMessage(
            JSONUtil.createObj().set("type", "auth").set("token", token).toString()));
        assertThat(client.next(Duration.ofSeconds(5)).getStr("type")).isEqualTo("ready");
        return client;
    }

    private String login(String username) {
        try {
            String body = mvc.perform(post("/api/desk/login").contentType(MediaType.APPLICATION_JSON)
                    .content("""
                        {"companyId": "%s", "username": "%s", "password": "%s"}
                        """.formatted(COMPANY_ID, username, PASSWORD)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
            return JSONUtil.parseObj(body).getJSONObject("data").getStr("token");
        } catch (Exception e) {
            throw new IllegalStateException("测试登录失败", e);
        }
    }

    private CompanyCreateDTO company(long companyId, String adminUsername) {
        return new CompanyCreateDTO(String.valueOf(companyId), "接待验收企业", null, null, null,
            new CompanyAdminInitDTO(adminUsername, PASSWORD, null));
    }

    private UserGroupDO group(long companyId, String name) {
        UserGroupDO group = new UserGroupDO();
        group.setCompanyId(companyId);
        group.setGroupName(name);
        groups.save(group);
        return group;
    }

    private long channel(long companyId, long groupId, ChannelEnum channel, String accountName,
                         Map<String, Object> channelInfo) {
        CompanyChannelDO account = new CompanyChannelDO();
        account.setCompanyId(companyId);
        account.setGroupId(groupId);
        account.setChannel(channel);
        account.setAccountName(accountName);
        account.setChannelInfo(channelInfo);
        channels.save(account);
        return account.getCompanyChannelId();
    }

    private UserDO plainUser(long companyId, String username) {
        UserDO user = new UserDO();
        user.setCompanyId(companyId);
        user.setUsername(username);
        user.setName(username);
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

    // 真实 WebSocket 客户端：异步收集服务端报文，供断言 ready 与推送帧
    private static final class SocketClient extends TextWebSocketHandler {

        private final BlockingQueue<JSONObject> frames = new LinkedBlockingQueue<>();
        private final CountDownLatch closed = new CountDownLatch(1);
        private WebSocketSession session;

        @Override
        protected void handleTextMessage(WebSocketSession session, TextMessage message) {
            frames.add(JSONUtil.parseObj(message.getPayload()));
        }

        @Override
        public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
            closed.countDown();
        }

        JSONObject next(Duration timeout) throws InterruptedException {
            return frames.poll(timeout.toMillis(), TimeUnit.MILLISECONDS);
        }
    }
}
