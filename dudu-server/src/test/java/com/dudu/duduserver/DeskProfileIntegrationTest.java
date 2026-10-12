package com.dudu.duduserver;

import cn.hutool.core.date.DateUtil;
import cn.hutool.json.JSONArray;
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
 * 共享名片读取与保存在独立 MySQL、真实 HTTP 与真实 WebSocket 边界验收：渠道资料三态原样返回、
 * 不重复身份字段；保存只改标签/备注并按契约规范化输入、version 递增、update_time 刷新，
 * HTTP 返回与 profile 报文一致（有权员工含操作者本人都收到）；保存不改变消息活动时间与排序；
 * 非法参数、越权与不存在的错误码；重登后读取持久结果。
 * 通过环境变量显式启用，运行前需重建 dudu_review。
 */
@SpringBootTest(properties = {"dudu.auth.jwt-secret=integration-test-secret"},
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureMockMvc
@EnabledIfEnvironmentVariable(named = "DUDU_INTEGRATION_TEST", matches = "true")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class DeskProfileIntegrationTest {

    private static final String PASSWORD = "password123";
    private static final long COMPANY_ID = 792001L;
    private static final long OTHER_COMPANY_ID = 792002L;
    private static final int TAGS_MAX = 20;
    private static final int TAG_MAX_LENGTH = 30;
    private static final int NOTE_MAX_LENGTH = 4000;

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> System.getenv("DUDU_TEST_JDBC_URL"));
        registry.add("spring.datasource.username", () -> "root");
        registry.add("spring.datasource.password", () -> System.getenv("DUDU_TEST_DB_PASSWORD"));
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
        companies.createCompany(company(COMPANY_ID, "profileowner"), 1L);
        companies.createCompany(company(OTHER_COMPANY_ID, "profileowner2"), 1L);
        UserGroupDO group = group(COMPANY_ID, "名片组");
        channelWechat = channel(COMPANY_ID, group.getGroupId(), ChannelEnum.WECHAT, "公众号",
            Map.of("token", "profile-token"));

        UserDO scoped = plainUser(COMPANY_ID, "profile.scoped");
        members.save(member(COMPANY_ID, scoped.getUserId(), group.getGroupId()));
        plainUser(COMPANY_ID, "profile.none");
        ownerToken = login("profileowner");
        scopedToken = login("profile.scoped");
        outsideToken = login("profile.none");
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
    void profileReturnsChannelFieldsInThreeStatesWithoutIdentityFields() throws Exception {
        long visitorId = newVisitor("profile-ext-1", "渠道资料访客");

        // 渠道资料三态：有值、渠道给出空值、渠道未提供；身份字段（名称/头像）不在名片对象中
        receive("profile-ext-1", "资料更新", "profile-m1", List.of(
            new ChannelInboundMessage.ChannelField("备注名", "张先生"),
            new ChannelInboundMessage.ChannelField("手机", ""),
            new ChannelInboundMessage.ChannelField("公司", null)));

        JSONObject profile = data(getProfile(scopedToken, visitorId));
        assertThat(profile.keySet()).containsExactlyInAnyOrder(
            "conversationId", "version", "fields", "tags", "note");
        assertThat(profile.getStr("conversationId")).isEqualTo(String.valueOf(visitorId));
        assertThat(profile.getInt("version")).isEqualTo(2);
        assertThat(profile.getJSONArray("tags")).isEmpty();
        assertThat(profile.getStr("note")).isEmpty();
        JSONArray fields = profile.getJSONArray("fields");
        assertThat(fields).hasSize(3);
        assertThat(fields.getJSONObject(0).getStr("label")).isEqualTo("备注名");
        assertThat(fields.getJSONObject(0).getJSONObject("value").getStr("state")).isEqualTo("available");
        assertThat(fields.getJSONObject(0).getJSONObject("value").getStr("value")).isEqualTo("张先生");
        assertThat(fields.getJSONObject(1).getJSONObject("value").getStr("state")).isEqualTo("empty");
        assertThat(fields.getJSONObject(1).getJSONObject("value").keySet()).containsExactly("state");
        assertThat(fields.getJSONObject(2).getJSONObject("value").getStr("state")).isEqualTo("not-provided");

        // 越权与不存在语义与既有访客接口一致
        assertThat(getProfile(outsideToken, visitorId).getInt("code")).isEqualTo(10106);
        assertThat(getProfile(scopedToken, 792999L).getInt("code")).isEqualTo(12100);
        assertThat(getProfile(null, visitorId).getInt("code")).isEqualTo(10101);
    }

    @Test
    void saveNormalizesTagsAndCoversNoteThenPushesToEveryAuthorizedClient() throws Exception {
        long visitorId = newVisitor("profile-ext-2", "保存名片");
        receive("profile-ext-2", "渠道资料", "profile-m2",
            List.of(new ChannelInboundMessage.ChannelField("备注名", "张先生")));
        SocketClient owner = connectAndAuth(ownerToken);
        SocketClient scoped = connectAndAuth(scopedToken);
        SocketClient outside = connectAndAuth(outsideToken);
        LocalDateTime before = profileVersionTime(visitorId);
        Thread.sleep(50);

        // 去首尾空白、去除完全相同项，保留首次出现顺序；备注保留实际文字与换行
        JSONObject saved = data(putProfile(scopedToken, visitorId,
            JSONUtil.createArray().set(" 重点客户 ").set("VIP").set("重点客户"),
            "记得跟进\n已下单"));

        assertThat(saved.getStr("conversationId")).isEqualTo(String.valueOf(visitorId));
        // 创建空名片（v1）与入站渠道资料（v2）之后，保存标签/备注再递增一次
        assertThat(saved.getInt("version")).isEqualTo(3);
        assertThat(saved.getJSONArray("tags").toList(String.class)).containsExactly("重点客户", "VIP");
        assertThat(saved.getStr("note")).isEqualTo("记得跟进\n已下单");

        // HTTP 返回与 profile 报文是后端保存的同一份名片；有权员工含操作者本人都收到
        assertProfileFrame(owner.next(Duration.ofSeconds(5)), visitorId);
        assertProfileFrame(scoped.next(Duration.ofSeconds(5)), visitorId);
        assertThat((Object) outside.next(Duration.ofMillis(700))).isNull();

        Map<String, Object> row = jdbc.queryForMap(
            "SELECT tags, note, version, update_time FROM visitor_profile WHERE visitor_id = ?", visitorId);
        assertThat(JSONUtil.parseArray(row.get("tags")).toList(String.class))
            .containsExactly("重点客户", "VIP");
        assertThat(row.get("note")).isEqualTo("记得跟进\n已下单");
        assertThat(row.get("version")).isEqualTo(3L);
        assertThat((LocalDateTime) row.get("update_time")).isAfter(before);
        // 渠道资料不由该接口写入，保持入站管道维护的原值
        assertThat(jdbc.queryForObject("SELECT JSON_LENGTH(channel_fields) FROM visitor_profile"
            + " WHERE visitor_id = ?", Integer.class, visitorId)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT JSON_UNQUOTE(JSON_EXTRACT(channel_fields,"
            + " '$[0].value.value')) FROM visitor_profile WHERE visitor_id = ?", String.class, visitorId))
            .isEqualTo("张先生");

        // 重登后读取持久结果：名片三元组与版本一致
        String again = login("profile.scoped");
        JSONObject reloaded = data(getProfile(again, visitorId));
        assertThat(reloaded.getJSONArray("tags").toList(String.class)).containsExactly("重点客户", "VIP");
        assertThat(reloaded.getStr("note")).isEqualTo("记得跟进\n已下单");
        assertThat(reloaded.getInt("version")).isEqualTo(3);
    }

    @Test
    void saveEnforcesTagAndNoteBoundariesAndDistinguishesMissingFromEmpty() throws Exception {
        long visitorId = newVisitor("profile-ext-3", "边界名片");

        // 标签数量与长度边界：20 个与每个 30 字合法，21 个与 31 字超限
        List<String> full = new ArrayList<>();
        for (int index = 0; index < TAGS_MAX; index++) {
            full.add("标签" + index);
        }
        JSONObject accepted = data(putProfile(ownerToken, visitorId, tags(full), "备注"));
        assertThat(accepted.getJSONArray("tags")).hasSize(TAGS_MAX);
        List<String> tooMany = new ArrayList<>(full);
        tooMany.add("第二十一个");
        assertThat(putProfile(ownerToken, visitorId, tags(tooMany), "备注").getInt("code")).isEqualTo(11200);
        // 最小与最大长度边界：1 字与 30 字的标签都合法
        assertThat(data(putProfile(ownerToken, visitorId,
            tags(List.of("a", "x".repeat(TAG_MAX_LENGTH))), "备注")).getJSONArray("tags"))
            .hasSize(2);
        assertThat(putProfile(ownerToken, visitorId,
            tags(List.of("x".repeat(TAG_MAX_LENGTH + 1))), "备注").getInt("code")).isEqualTo(11200);
        // 去空白后为空串的标签不是合法标签
        assertThat(putProfile(ownerToken, visitorId, tags(List.of("   ")), "备注").getInt("code"))
            .isEqualTo(11000);

        // 备注长度边界与空串清空、空标签数组清空
        assertThat(putProfile(ownerToken, visitorId, tags(List.of()),
            "n".repeat(NOTE_MAX_LENGTH)).getInt("code")).isZero();
        assertThat(putProfile(ownerToken, visitorId, tags(List.of()),
            "n".repeat(NOTE_MAX_LENGTH + 1)).getInt("code")).isEqualTo(11200);
        JSONObject cleared = data(putProfile(ownerToken, visitorId, tags(List.of()), ""));
        assertThat(cleared.getStr("note")).isEmpty();
        assertThat(cleared.getJSONArray("tags")).isEmpty();

        // 缺失字段与空内容不同：tags/note 缺失、类型不符都按参数错误拒绝
        JSONObject missingNote = putProfileBody(ownerToken, visitorId,
            JSONUtil.createObj().set("tags", JSONUtil.createArray()).toString());
        assertThat(missingNote.getInt("code")).isEqualTo(11100);
        JSONObject missingTags = putProfileBody(ownerToken, visitorId,
            JSONUtil.createObj().set("note", "只给备注").toString());
        assertThat(missingTags.getInt("code")).isEqualTo(11100);
        JSONObject wrongType = putProfileBody(ownerToken, visitorId,
            JSONUtil.createObj().set("tags", "不是数组").set("note", "备注").toString());
        assertThat(wrongType.getInt("code")).isEqualTo(11000);
        // 非法 body 不写库
        assertThat(jdbc.queryForObject("SELECT version FROM visitor_profile WHERE visitor_id = ?", Integer.class,
            visitorId)).isEqualTo(5);
    }

    @Test
    void saveRejectsUnauthorizedMissingAndForeignVisitorsWithoutWriting() throws Exception {
        long visitorId = newVisitor("profile-ext-4", "越权名片");
        long otherCompanyVisitorId = otherCompanyVisitor();

        assertThat(putProfile(scopedToken, 792999L, tags(List.of("标签")), "备注").getInt("code"))
            .isEqualTo(12100);
        assertThat(putProfile(scopedToken, otherCompanyVisitorId, tags(List.of("标签")), "备注")
            .getInt("code")).isEqualTo(10106);
        assertThat(putProfile(outsideToken, visitorId, tags(List.of("标签")), "备注").getInt("code"))
            .isEqualTo(10106);
        assertThat(putProfile(null, visitorId, tags(List.of("标签")), "备注").getInt("code"))
            .isEqualTo(10101);
        assertThat(putProfile(jwtManager.createToken(
            new JwtUser(null, 1L, UserRoleEnum.ADMIN, DateUtil.currentSeconds() + 600)),
            visitorId, tags(List.of("标签")), "备注").getInt("code")).isEqualTo(10106);

        // 被拒绝的请求不改变名片
        Map<String, Object> profile = jdbc.queryForMap(
            "SELECT note, version, JSON_LENGTH(tags) AS tag_count FROM visitor_profile WHERE visitor_id = ?",
            visitorId);
        assertThat(profile.get("tag_count")).isEqualTo(0L);
        assertThat(profile.get("note")).isEqualTo("");
        assertThat(profile.get("version")).isEqualTo(1L);
    }

    @Test
    void saveDoesNotChangeMessageActivityOrOrdering() throws Exception {
        long newer = newVisitor("profile-ext-5", "较新消息");
        Thread.sleep(5);
        long older = newVisitor("profile-ext-6", "较旧消息");
        // 固定最后消息时间，让排序只由消息时间决定
        jdbc.update("UPDATE visitor SET last_message_time = '2026-01-02 10:00:00.000' WHERE visitor_id = ?", newer);
        jdbc.update("UPDATE visitor SET last_message_time = '2026-01-01 10:00:00.000' WHERE visitor_id = ?", older);
        Map<String, Object> before = jdbc.queryForMap(
            "SELECT last_message_id, last_message_preview, last_message_time, waiting_since, status,"
                + " message_count, version FROM visitor WHERE visitor_id = ?", older);
        List<String> orderBefore = ids(query(scopedToken, "{\"status\": \"all\", \"order\": \"messages\"}"));

        data(putProfile(scopedToken, older, JSONUtil.createArray().set("名片新标签"), "名片新备注"));

        // 名片保存只改 visitor_profile：消息活动时间、摘要、接待状态与计数保持原样
        Map<String, Object> after = jdbc.queryForMap(
            "SELECT last_message_id, last_message_preview, last_message_time, waiting_since, status,"
                + " message_count, version FROM visitor WHERE visitor_id = ?", older);
        assertThat(after).isEqualTo(before);
        assertThat(ids(query(scopedToken, "{\"status\": \"all\", \"order\": \"messages\"}"))).isEqualTo(orderBefore);
        // 新标签即刻参与搜索，且不移动排序位置
        assertThat(ids(query(scopedToken, "{\"status\": \"all\", \"search\": \"名片新标签\"}")))
            .containsExactly(String.valueOf(older));
    }

    private LocalDateTime profileVersionTime(long visitorId) {
        return jdbc.queryForObject("SELECT update_time FROM visitor_profile WHERE visitor_id = ?", LocalDateTime.class,
            visitorId);
    }

    private void assertProfileFrame(JSONObject frame, long visitorId) {
        assertThat((Object) frame).isNotNull();
        assertThat(frame.keySet()).containsExactlyInAnyOrder("type", "profile");
        assertThat(frame.getStr("type")).isEqualTo("profile");
        JSONObject profile = frame.getJSONObject("profile");
        assertThat(profile.getStr("conversationId")).isEqualTo(String.valueOf(visitorId));
        assertThat(profile.getInt("version")).isEqualTo(3);
        assertThat(profile.getJSONArray("tags").toList(String.class)).containsExactly("重点客户", "VIP");
        assertThat(profile.getStr("note")).isEqualTo("记得跟进\n已下单");
    }

    private long otherCompanyVisitor() {
        UserGroupDO otherGroup = group(OTHER_COMPANY_ID, "外部名片组");
        long otherChannel = channel(OTHER_COMPANY_ID, otherGroup.getGroupId(), ChannelEnum.WECHAT, "外部公众号",
            Map.of("token", "profile-token"));
        deskInboundService.accept(channels.getById(otherChannel), new ChannelInboundMessage(otherChannel,
            "profile-ext-other", null, null, List.of(), "profile-seed-other", MessageDirectionEnum.INCOMING,
            Map.of("type", "text", "text", "外部来信")));
        return jdbc.queryForObject("""
            SELECT visitor_id FROM visitor WHERE company_id = ? AND external_user_id = 'profile-ext-other'
            """, Long.class, OTHER_COMPANY_ID);
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

    private JSONObject getProfile(String token, long visitorId) throws Exception {
        var request = get("/api/desk/visitors/" + visitorId + "/profile");
        if (token != null) {
            request = request.header("Authorization", "Bearer " + token);
        }
        return JSONUtil.parseObj(mvc.perform(request).andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString());
    }

    private JSONObject putProfile(String token, long visitorId, JSONArray tags, String note) throws Exception {
        return putProfileBody(token, visitorId,
            JSONUtil.createObj().set("tags", tags).set("note", note).toString());
    }

    private JSONObject putProfileBody(String token, long visitorId, String body) throws Exception {
        var request = put("/api/desk/visitors/" + visitorId + "/profile")
            .contentType(MediaType.APPLICATION_JSON).content(body);
        if (token != null) {
            request = request.header("Authorization", "Bearer " + token);
        }
        return JSONUtil.parseObj(mvc.perform(request).andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString());
    }

    // 请求体构造：标签字符串数组（顺序即提交顺序）
    private JSONArray tags(List<String> values) {
        JSONArray array = JSONUtil.createArray();
        array.addAll(values);
        return array;
    }

    private JSONObject data(JSONObject response) {
        assertThat(response.getInt("code")).isZero();
        return response.getJSONObject("data");
    }

    private long newVisitor(String externalUserId, String firstText) {
        receive(externalUserId, firstText, "seed-" + externalUserId, List.of());
        return jdbc.queryForObject("""
            SELECT visitor_id FROM visitor WHERE company_id = ? AND external_user_id = ?
            """, Long.class, COMPANY_ID, externalUserId);
    }

    private void receive(String externalUserId, String text, String externalMessageId,
                         List<ChannelInboundMessage.ChannelField> fields) {
        deskInboundService.accept(channels.getById(channelWechat), new ChannelInboundMessage(channelWechat,
            externalUserId, null, null, fields, externalMessageId, MessageDirectionEnum.INCOMING,
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
        return new CompanyCreateDTO(String.valueOf(companyId), "名片验收企业", null, null, null,
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
