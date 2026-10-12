package com.dudu.duduserver;

import cn.hutool.json.JSONArray;
import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.dudu.duduserver.constant.ChannelEnum;
import com.dudu.duduserver.constant.EnableStatusEnum;
import com.dudu.duduserver.constant.UserRoleEnum;
import com.dudu.duduserver.constant.VisitorStatusEnum;
import com.dudu.duduserver.dto.CompanyAdminInitDTO;
import com.dudu.duduserver.dto.CompanyCreateDTO;
import com.dudu.duduserver.entity.CompanyChannelDO;
import com.dudu.duduserver.entity.UserDO;
import com.dudu.duduserver.entity.UserGroupDO;
import com.dudu.duduserver.entity.UserGroupMemberDO;
import com.dudu.duduserver.service.CompanyChannelService;
import com.dudu.duduserver.service.CompanyService;
import com.dudu.duduserver.service.UserGroupMemberService;
import com.dudu.duduserver.service.UserGroupService;
import com.dudu.duduserver.service.UserService;
import com.dudu.duduserver.util.PasswordHasher;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 按需历史分页在独立 MySQL 的真实 HTTP 边界验收：以 SQL 直接造持久文本消息，验证
 * 最近页条数与升序返回（内部降序选取）、beforeSequence 多页遍历到尾的 nextCursor 链、
 * limit 边界与参数错误码、空历史、越权 10106 / 不存在 12100 与跨企业隔离。
 * 通过环境变量显式启用，运行前需重建 dudu_review。
 */
@SpringBootTest(properties = {"dudu.auth.jwt-secret=integration-test-secret"})
@AutoConfigureMockMvc
@EnabledIfEnvironmentVariable(named = "DUDU_INTEGRATION_TEST", matches = "true")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class DeskHistoryIntegrationTest {

    private static final String PASSWORD = "password123";
    private static final long COMPANY_ID = 786001L;
    private static final long OTHER_COMPANY_ID = 786002L;
    private static final long CONVERSATION_ID = 786101L;
    private static final long EMPTY_CONVERSATION_ID = 786102L;
    private static final long SCOPED_OUT_CONVERSATION_ID = 786103L;
    private static final long OTHER_CONVERSATION_ID = 786201L;
    private static final int MESSAGE_COUNT = 65;
    private static final LocalDateTime BASE = LocalDateTime.of(2026, 10, 12, 9, 0, 0);

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> System.getenv("DUDU_TEST_JDBC_URL"));
        registry.add("spring.datasource.username", () -> "root");
        registry.add("spring.datasource.password", () -> System.getenv("DUDU_TEST_DB_PASSWORD"));
    }

    @Autowired MockMvc mvc;
    @Autowired CompanyService companies;
    @Autowired UserService users;
    @Autowired UserGroupService groups;
    @Autowired UserGroupMemberService members;
    @Autowired CompanyChannelService channels;
    @Autowired JdbcTemplate jdbc;

    private long senderUserId;

    @BeforeAll
    void seed() {
        companies.createCompany(company(COMPANY_ID, "owner"), 1L);
        companies.createCompany(company(OTHER_COMPANY_ID, "owner2"), 1L);
        UserGroupDO presale = group(COMPANY_ID, "售前");
        UserGroupDO aftersale = group(COMPANY_ID, "售后");
        long wechat = channel(COMPANY_ID, presale.getGroupId(), ChannelEnum.WECHAT, "公众号");
        long alipay = channel(COMPANY_ID, aftersale.getGroupId(), ChannelEnum.ALIPAY, "生活号");
        UserDO agent = plainUser(COMPANY_ID, "agent.one", "客服一号");
        senderUserId = agent.getUserId();
        members.save(member(COMPANY_ID, agent.getUserId(), presale.getGroupId()));

        // 主会话：65 条持久文本消息，最新一条为坐席发出，用于最近页截取与完整映射
        insertVisitor(CONVERSATION_ID, COMPANY_ID, wechat, "ext-history", "历史访客");
        for (int sequence = 1; sequence <= MESSAGE_COUNT; sequence++) {
            insertMessage(CONVERSATION_ID, sequence,
                sequence == MESSAGE_COUNT ? "outgoing" : "incoming", "消息 " + sequence);
        }
        // 空历史会话
        insertVisitor(EMPTY_CONVERSATION_ID, COMPANY_ID, wechat, "ext-empty", "无消息访客");
        // 授权账号之外的会话：owner 可见、agent.one 不可见
        insertVisitor(SCOPED_OUT_CONVERSATION_ID, COMPANY_ID, alipay, "ext-other", "外部访客");
        insertMessage(SCOPED_OUT_CONVERSATION_ID, 1, "incoming", "生活号消息");

        // 其他企业的会话：任何查询与详情都不得泄漏
        UserGroupDO otherGroup = group(OTHER_COMPANY_ID, "外部组");
        long otherChannel = channel(OTHER_COMPANY_ID, otherGroup.getGroupId(), ChannelEnum.WECHAT, "外部公众号");
        insertVisitor(OTHER_CONVERSATION_ID, OTHER_COMPANY_ID, otherChannel, "ext-foreign", "外部访客");
        insertMessage(OTHER_CONVERSATION_ID, 1, "incoming", "外部企业消息");
    }

    @Test
    void recentPageReturnsTheNewestWindowAscendingWithAnEarlierCursorAndNoTotal() throws Exception {
        JSONObject response = messages(token("owner"), String.valueOf(CONVERSATION_ID), "");
        JSONObject data = data(response);

        assertThat(data.keySet()).containsExactlyInAnyOrder("items", "nextCursor");
        assertThat(sequences(data)).hasSize(30).startsWith(36, 37, 38).endsWith(64, 65);
        assertThat(sequences(data)).isSorted();
        assertThat(data.getStr("nextCursor")).isEqualTo("36");

        // incoming 文本消息按契约映射：无 clientRequestId，无发送员工与发送结果
        JSONObject incoming = item(data, "36").orElseThrow();
        assertThat(incoming.getStr("conversationId")).isEqualTo(String.valueOf(CONVERSATION_ID));
        assertThat(incoming.getStr("direction")).isEqualTo("incoming");
        assertThat(incoming.getJSONObject("body").getStr("type")).isEqualTo("text");
        assertThat(incoming.getJSONObject("body").getStr("text")).isEqualTo("消息 36");
        assertThat(incoming.getStr("createdAt")).isEqualTo("2026-10-12 09:36:00");
        assertThat(incoming.getInt("sequence")).isEqualTo(36);
        assertThat(incoming.getInt("version")).isEqualTo(1);
        assertThat(incoming.isNull("clientRequestId")).isTrue();
        assertThat(incoming.isNull("senderUserId")).isTrue();
        assertThat(incoming.isNull("senderName")).isTrue();
        assertThat(incoming.isNull("delivery")).isTrue();

        // 最新一条为坐席发出：发送员工、显示名与 sent 发送结果齐全
        JSONObject outgoing = item(data, "65").orElseThrow();
        assertThat(outgoing.getStr("direction")).isEqualTo("outgoing");
        assertThat(outgoing.getStr("clientRequestId")).isEqualTo("client-65");
        assertThat(outgoing.getStr("senderUserId")).isEqualTo(String.valueOf(senderUserId));
        assertThat(outgoing.getStr("senderName")).isEqualTo("客服一号");
        assertThat(outgoing.getJSONObject("delivery").getStr("state")).isEqualTo("sent");
        assertThat(outgoing.getJSONObject("delivery").isNull("reason")).isTrue();
    }

    @Test
    void beforeSequenceWalksTheNextCursorChainToTheOldestMessageAndStops() throws Exception {
        String token = token("owner");
        JSONObject recent = data(messages(token, String.valueOf(CONVERSATION_ID), ""));
        assertThat(sequences(recent)).containsExactlyElementsOf(range(36, 65));
        assertThat(recent.getStr("nextCursor")).isEqualTo("36");

        JSONObject middle = data(messages(token, String.valueOf(CONVERSATION_ID),
            "?beforeSequence=" + recent.getStr("nextCursor")));
        assertThat(sequences(middle)).containsExactlyElementsOf(range(6, 35));
        assertThat(middle.getStr("nextCursor")).isEqualTo("6");

        JSONObject oldest = data(messages(token, String.valueOf(CONVERSATION_ID),
            "?beforeSequence=" + middle.getStr("nextCursor")));
        assertThat(sequences(oldest)).containsExactlyElementsOf(range(1, 5));
        assertThat(oldest.getStr("nextCursor")).isNull();
        // 页与页之间没有重复与缺口，合计恰为全部持久消息
        assertThat(sequences(recent).size() + sequences(middle).size() + sequences(oldest).size())
            .isEqualTo(MESSAGE_COUNT);

        // 到最旧一条之后再取：空 items + 无游标，也是成功响应
        JSONObject past = data(messages(token, String.valueOf(CONVERSATION_ID), "?beforeSequence=1"));
        assertThat(past.getJSONArray("items")).isEmpty();
        assertThat(past.getStr("nextCursor")).isNull();
    }

    @Test
    void limitBoundariesAndInvalidPagingParametersUseContractCodes() throws Exception {
        String token = token("owner");
        // limit=1：只取最新一条，游标指向它；limit=100：一次取全，到尾无游标
        JSONObject single = data(messages(token, String.valueOf(CONVERSATION_ID), "?limit=1"));
        assertThat(sequences(single)).containsExactly(65);
        assertThat(single.getStr("nextCursor")).isEqualTo("65");
        JSONObject full = data(messages(token, String.valueOf(CONVERSATION_ID), "?limit=100"));
        assertThat(sequences(full)).hasSize(MESSAGE_COUNT);
        assertThat(full.getStr("nextCursor")).isNull();
        // 游标与 limit 组合：beforeSequence=3 且 limit=1 只返回更早一条
        JSONObject before = data(messages(token, String.valueOf(CONVERSATION_ID),
            "?beforeSequence=3&limit=1"));
        assertThat(sequences(before)).containsExactly(2);
        assertThat(before.getStr("nextCursor")).isEqualTo("2");

        assertThat(messages(token, String.valueOf(CONVERSATION_ID), "?limit=0").getInt("code")).isEqualTo(11000);
        assertThat(messages(token, String.valueOf(CONVERSATION_ID), "?limit=101").getInt("code")).isEqualTo(11200);
        assertThat(messages(token, String.valueOf(CONVERSATION_ID), "?limit=abc").getInt("code")).isEqualTo(11000);
        assertThat(messages(token, String.valueOf(CONVERSATION_ID), "?beforeSequence=abc").getInt("code")).isEqualTo(11000);
        assertThat(messages(token, String.valueOf(CONVERSATION_ID), "?beforeSequence=0").getInt("code")).isEqualTo(11000);
    }

    @Test
    void emptyHistoryAndMissingVisitorAreDistinguished() throws Exception {
        JSONObject empty = data(messages(token("owner"), String.valueOf(EMPTY_CONVERSATION_ID), ""));
        assertThat(empty.getJSONArray("items")).isEmpty();
        assertThat(empty.getStr("nextCursor")).isNull();

        assertThat(messages(token("owner"), "99999999", "").getInt("code")).isEqualTo(12100);
        assertThat(messages(token("owner"), "not-a-number", "").getInt("code")).isEqualTo(11000);
    }

    @Test
    void historyKeepsAccountScopeAndCrossCompanyIsolation() throws Exception {
        // 本企业未授权账号的会话：owner（初始管理员，全部组）可读，组外员工按无访问权限
        JSONObject allowed = data(messages(token("owner"), String.valueOf(SCOPED_OUT_CONVERSATION_ID), ""));
        assertThat(sequences(allowed)).containsExactly(1);
        assertThat(messages(token("agent.one"), String.valueOf(SCOPED_OUT_CONVERSATION_ID), "").getInt("code"))
            .isEqualTo(10106);
        // 组内员工的可见会话正常读取
        JSONObject scoped = data(messages(token("agent.one"), String.valueOf(CONVERSATION_ID), "?limit=1"));
        assertThat(sequences(scoped)).containsExactly(65);

        // 跨企业会话对当前企业任何身份都是无访问权限；对方企业读取自己的会话不受影响
        assertThat(messages(token("owner"), String.valueOf(OTHER_CONVERSATION_ID), "").getInt("code")).isEqualTo(10106);
        assertThat(sequences(data(messages(token(OTHER_COMPANY_ID, "owner2"), String.valueOf(OTHER_CONVERSATION_ID), ""))))
            .containsExactly(1);
    }

    private JSONObject messages(String token, String visitorId, String query) throws Exception {
        String response = mvc.perform(get("/api/desk/visitors/" + visitorId + "/messages" + query)
                .header("Authorization", "Bearer " + token))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        return JSONUtil.parseObj(response);
    }

    private JSONObject data(JSONObject response) {
        assertThat(response.getInt("code")).isZero();
        return response.getJSONObject("data");
    }

    private List<Integer> sequences(JSONObject data) {
        JSONArray items = data.getJSONArray("items");
        return items.stream().map(item -> ((JSONObject) item).getInt("sequence")).toList();
    }

    private java.util.Optional<JSONObject> item(JSONObject data, String sequence) {
        return data.getJSONArray("items").stream()
            .map(row -> (JSONObject) row)
            .filter(row -> String.valueOf(row.getInt("sequence")).equals(sequence))
            .findFirst();
    }

    private List<Integer> range(int from, int to) {
        List<Integer> values = new ArrayList<>();
        for (int value = from; value <= to; value++) values.add(value);
        return values;
    }

    private String token(String username) throws Exception {
        return token(COMPANY_ID, username);
    }

    private String token(long companyId, String username) throws Exception {
        String body = mvc.perform(post("/api/desk/login")
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                .content("""
                    {"companyId": "%s", "username": "%s", "password": "%s"}
                    """.formatted(companyId, username, PASSWORD)))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        return JSONUtil.parseObj(body).getJSONObject("data").getStr("token");
    }

    private void insertVisitor(long visitorId, long companyId, long channelId, String externalUserId, String name) {
        LocalDateTime createdAt = BASE.minusDays(1);
        jdbc.update("INSERT INTO visitor(visitor_id, company_id, company_channel_id, external_user_id, name, status,"
                + " last_message_preview, last_message_time, waiting_since, message_count, version, create_time, update_time)"
                + " VALUES(?, ?, ?, ?, ?, ?, '', NULL, NULL, 0, 1, ?, ?)",
            visitorId, companyId, channelId, externalUserId, name,
            VisitorStatusEnum.NEEDS_REPLY.getCode(), createdAt, createdAt);
        jdbc.update("INSERT INTO visitor_profile(visitor_id, channel_fields, tags, note, version, create_time, update_time)"
            + " VALUES(?, JSON_ARRAY(), JSON_ARRAY(), '', 1, ?, ?)", visitorId, createdAt, createdAt);
    }

    // 直接以 SQL 造持久文本消息：content 用 JSON_OBJECT 保证与统一消息体同形
    private void insertMessage(long visitorId, int sequence, String direction, String text) {
        LocalDateTime createdAt = BASE.plusMinutes(sequence);
        boolean outgoing = "outgoing".equals(direction);
        jdbc.update("INSERT INTO message(message_id, visitor_id, sequence, direction, sender_user_id,"
                + " client_request_id, external_message_id, content, send_status, failure_reason, version,"
                + " create_time, update_time)"
                + " VALUES(?, ?, ?, ?, ?, ?, NULL, JSON_OBJECT('type', 'text', 'text', ?), ?, NULL, 1, ?, ?)",
            visitorId * 1000 + sequence, visitorId, sequence, direction,
            outgoing ? senderUserId : null,
            outgoing ? "client-" + sequence : null,
            text, outgoing ? "sent" : null, createdAt, createdAt);
        jdbc.update("UPDATE visitor SET message_count = message_count + 1, last_message_preview = ?,"
                + " last_message_time = ?, last_message_id = ?, update_time = ? WHERE visitor_id = ?",
            text, createdAt, visitorId * 1000 + sequence, createdAt, visitorId);
    }

    private CompanyCreateDTO company(long companyId, String adminUsername) {
        return new CompanyCreateDTO(String.valueOf(companyId), "历史验收企业", null, null, null,
            new CompanyAdminInitDTO(adminUsername, PASSWORD, null));
    }

    private UserGroupDO group(long companyId, String name) {
        UserGroupDO group = new UserGroupDO();
        group.setCompanyId(companyId);
        group.setGroupName(name);
        groups.save(group);
        return group;
    }

    private long channel(long companyId, long groupId, ChannelEnum channel, String accountName) {
        CompanyChannelDO account = new CompanyChannelDO();
        account.setCompanyId(companyId);
        account.setGroupId(groupId);
        account.setChannel(channel);
        account.setAccountName(accountName);
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
}
