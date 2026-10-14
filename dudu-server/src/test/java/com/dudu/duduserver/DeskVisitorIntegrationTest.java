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
import com.dudu.duduserver.testutil.IntegrationTestEnv;

import com.dudu.duduserver.util.PasswordHasher;
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

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 访客列表、筛选、排序与单访客快照在独立 MySQL 的真实 HTTP 边界验收：
 * 授权范围与跨企业隔离、排序全规则与并列 ID、计数不受筛选影响、搜索各字段（含 JSON 标签与备注）、
 * 分页边界与参数错误码、名片更新不改排序；通过环境变量显式启用，运行前需重建 dudu_review。
 */
@SpringBootTest(properties = {"dudu.auth.jwt-secret=integration-test-secret"})
@AutoConfigureMockMvc
@EnabledIfEnvironmentVariable(named = "DUDU_INTEGRATION_TEST", matches = "true")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class DeskVisitorIntegrationTest {

    private static final String PASSWORD = "password123";
    private static final long COMPANY_ID = 784001L;
    private static final long OTHER_COMPANY_ID = 784002L;
    private static final long OTHER_VISITOR_ID = 784201L;
    private static final LocalDateTime BASE = LocalDateTime.of(2026, 10, 11, 9, 0, 0);

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", IntegrationTestEnv::jdbcUrl);
        registry.add("spring.datasource.username", IntegrationTestEnv::dbUser);
        registry.add("spring.datasource.password", IntegrationTestEnv::dbPassword);
    }

    @Autowired MockMvc mvc;
    @Autowired CompanyService companies;
    @Autowired UserService users;
    @Autowired UserGroupService groups;
    @Autowired UserGroupMemberService members;
    @Autowired CompanyChannelService channels;
    @Autowired JdbcTemplate jdbc;

    private long channelWechat;
    private long channelDouyin;
    private long channelAlipay;

    @BeforeAll
    void seed() {
        companies.createCompany(company(COMPANY_ID, "owner"), 1L);
        companies.createCompany(company(OTHER_COMPANY_ID, "owner2"), 1L);
        UserGroupDO first = group(COMPANY_ID, "售前");
        UserGroupDO second = group(COMPANY_ID, "售后");
        channelWechat = channel(COMPANY_ID, first.getGroupId(), ChannelEnum.WECHAT_MP, "公众号");
        channelDouyin = channel(COMPANY_ID, second.getGroupId(), ChannelEnum.DOUYIN, "抖音号");
        channelAlipay = channel(COMPANY_ID, second.getGroupId(), ChannelEnum.ALIPAY, "生活号");

        UserDO scopedAgent = plainUser(COMPANY_ID, "agent.one");
        members.save(member(COMPANY_ID, scopedAgent.getUserId(), first.getGroupId()));
        plainUser(COMPANY_ID, "agent.none");

        // 待回复按 waiting_since 升序；等待中与已结束按最后消息时间降序（无消息用创建时间），并列按访客 ID 升序
        insertVisitor(784102L, COMPANY_ID, channelWechat, "ext-zhou", "周越", VisitorStatusEnum.NEEDS_REPLY,
            at(10), at(20), at(2), 9, 1, "发票问题");
        insertVisitor(784101L, COMPANY_ID, channelWechat, "ext-lin", "林小满", VisitorStatusEnum.NEEDS_REPLY,
            at(30), at(50), at(1), 5, 2, "咨询保修");
        insertVisitor(784107L, COMPANY_ID, channelAlipay, "ext-other", "外部访客", VisitorStatusEnum.NEEDS_REPLY,
            at(50), at(55), at(8), 2, 1, "不在范围");
        insertVisitor(784103L, COMPANY_ID, channelWechat, "ext-chen", "陈安", VisitorStatusEnum.WAITING,
            null, at(60), at(3), 3, 1, "已回复");
        insertVisitor(784104L, COMPANY_ID, channelWechat, "ext-qian", "钱多", VisitorStatusEnum.CLOSED,
            null, null, at(65), 1, 1, "已结束");
        insertVisitor(784105L, COMPANY_ID, channelDouyin, "ext-zheng", "郑一", VisitorStatusEnum.WAITING,
            null, at(40), at(6), 12, 1, "汇总甲");
        insertVisitor(784106L, COMPANY_ID, channelDouyin, "ext-wang", "王二", VisitorStatusEnum.WAITING,
            null, at(40), at(7), 12, 1, "汇总乙");

        // 共享标签与备注参与搜索；名片时间与访客活动时间解耦
        setProfile(784103L, "", "VIP客户");
        setProfile(784105L, "客户要求下午回电", "重点跟进");

        // 其他企业的访客与账号：任何查询与详情都不得泄漏
        UserGroupDO otherGroup = group(OTHER_COMPANY_ID, "外部组");
        long otherChannel = channel(OTHER_COMPANY_ID, otherGroup.getGroupId(), ChannelEnum.WECHAT_MP, "外部公众号");
        insertVisitor(OTHER_VISITOR_ID, OTHER_COMPANY_ID, otherChannel, "ext-foreign", "外部访客",
            VisitorStatusEnum.NEEDS_REPLY, at(1), at(2), at(0), 4, 1, "外部企业摘要");
    }

    @Test
    void defaultQueryProjectsContractObjectAndAuthorizedCounts() throws Exception {
        JSONObject data = data(query(token("owner"), "{}"));

        assertThat(data.keySet()).containsExactlyInAnyOrder("items", "total", "page", "pageSize", "counts", "channels");
        assertThat(data.getLong("total")).isEqualTo(6L);
        assertThat(data.getInt("page")).isEqualTo(1);
        assertThat(data.getInt("pageSize")).isEqualTo(30);
        assertThat(ids(data)).containsExactly("784102", "784101", "784107", "784103", "784105", "784106");

        JSONObject first = data.getJSONArray("items").getJSONObject(0);
        assertThat(first.keySet()).containsExactlyInAnyOrder(
            "id", "identity", "status", "preview", "updatedAt", "waitingSince", "messageCount", "version", "capability");
        assertThat(first.getStr("id")).isEqualTo("784102");
        assertThat(first.getStr("status")).isEqualTo("needs-reply");
        assertThat(first.getStr("preview")).isEqualTo("发票问题");
        assertThat(first.getStr("updatedAt")).isEqualTo("2026-10-11 09:20:00");
        assertThat(first.getStr("waitingSince")).isEqualTo("2026-10-11 09:10:00");
        assertThat(first.getInt("messageCount")).isEqualTo(9);
        assertThat(first.getInt("version")).isEqualTo(1);
        JSONObject identity = first.getJSONObject("identity");
        assertThat(identity.keySet()).containsExactlyInAnyOrder(
            "id", "externalUserId", "name", "channelId", "channelName", "accountId", "accountName");
        assertThat(identity.getStr("id")).isEqualTo("784102");
        assertThat(identity.getStr("externalUserId")).isEqualTo("ext-zhou");
        assertThat(identity.getStr("name")).isEqualTo("周越");
        assertThat(identity.getStr("channelId")).isEqualTo("wechat-mp");
        assertThat(identity.getStr("channelName")).isEqualTo("微信公众号");
        assertThat(identity.getStr("accountId")).isEqualTo(String.valueOf(channelWechat));
        assertThat(identity.getStr("accountName")).isEqualTo("公众号");
        assertThat(first.getJSONObject("capability").getStr("state")).isEqualTo("restricted");
        assertThat(first.getJSONObject("capability").getJSONArray("kinds")).isEmpty();

        // 非待回复省略 waitingSince
        JSONObject waiting = items(data).stream()
            .filter(item -> item.getStr("id").equals("784103")).findFirst().orElseThrow();
        assertThat(waiting.isNull("waitingSince")).isTrue();
        assertThat(waiting.getStr("updatedAt")).isEqualTo("2026-10-11 10:00:00");

        assertThat(data.getJSONObject("counts").keySet())
            .containsExactlyInAnyOrder("active", "needsReply", "waiting", "closed");
        assertThat(data.getJSONObject("counts").getInt("active")).isEqualTo(6);
        assertThat(data.getJSONObject("counts").getInt("needsReply")).isEqualTo(3);
        assertThat(data.getJSONObject("counts").getInt("waiting")).isEqualTo(3);
        assertThat(data.getJSONObject("counts").getInt("closed")).isEqualTo(1);
        // channels 为授权账号用到的渠道代码与显示名
        assertThat(data.getJSONArray("channels").toString())
            .isEqualTo("[{\"id\":\"wechat-mp\",\"name\":\"微信公众号\"},{\"id\":\"douyin\",\"name\":\"抖音\"}"
                + ",{\"id\":\"alipay\",\"name\":\"支付宝\"}]");
    }

    @Test
    void waitOrderCoversWaitingFirstTimeFallbackAndStableIdTies() throws Exception {
        // 状态 all：已结束的 784104 无最后消息时间，用创建时间参与降序，排在 784103 之前
        JSONObject data = data(query(token("owner"), "{\"status\": \"all\"}"));

        assertThat(ids(data)).containsExactly(
            "784102", "784101", "784107", "784104", "784103", "784105", "784106");
        JSONObject closed = items(data).stream()
            .filter(item -> item.getStr("id").equals("784104")).findFirst().orElseThrow();
        assertThat(closed.getStr("updatedAt")).isEqualTo("2026-10-11 10:05:00");
    }

    @Test
    void messagesOrderSortsByCountThenTimeThenId() throws Exception {
        JSONObject data = data(query(token("owner"), "{\"order\": \"messages\", \"status\": \"all\"}"));

        assertThat(ids(data)).containsExactly(
            "784105", "784106", "784102", "784101", "784103", "784107", "784104");
    }

    @Test
    void agentScopeLimitsItemsCountsAndChannels() throws Exception {
        JSONObject scoped = data(query(token("agent.one"), "{}"));

        assertThat(ids(scoped)).containsExactly("784102", "784101", "784103");
        assertThat(scoped.getLong("total")).isEqualTo(3L);
        assertThat(scoped.getJSONObject("counts").getInt("active")).isEqualTo(3);
        assertThat(scoped.getJSONObject("counts").getInt("needsReply")).isEqualTo(2);
        assertThat(scoped.getJSONObject("counts").getInt("waiting")).isEqualTo(1);
        assertThat(scoped.getJSONObject("counts").getInt("closed")).isEqualTo(1);
        assertThat(scoped.getJSONArray("channels").toString())
            .isEqualTo("[{\"id\":\"wechat-mp\",\"name\":\"微信公众号\"}]");

        // 授权账号之外的访客：列表不出现，详情按无访问权限处理
        JSONObject all = data(query(token("agent.one"), "{\"status\": \"all\"}"));
        assertThat(ids(all)).containsExactly("784102", "784101", "784104", "784103");
        assertThat(all.getLong("total")).isEqualTo(4L);
        assertThat(detail(token("agent.one"), "784107").getInt("code")).isEqualTo(10106);

        // 无任何授权组：空结果但仍是成功响应，不伪装成错误
        JSONObject none = data(query(token("agent.none"), "{}"));
        assertThat(none.getJSONArray("items")).isEmpty();
        assertThat(none.getLong("total")).isZero();
        assertThat(none.getJSONObject("counts").getInt("active")).isZero();
        assertThat(none.getJSONArray("channels")).isEmpty();
    }

    @Test
    void channelAndStatusFiltersNarrowItemsButNotCounts() throws Exception {
        JSONObject douyin = data(query(token("owner"), "{\"channelId\": \"douyin\"}"));
        assertThat(ids(douyin)).containsExactly("784105", "784106");
        assertThat(douyin.getLong("total")).isEqualTo(2L);
        assertThat(douyin.getJSONObject("counts").getInt("active")).isEqualTo(6);

        // 合法渠道代码但授权账号未使用：空结果，计数仍为全部授权范围
        JSONObject unused = data(query(token("owner"), "{\"channelId\": \"bilibili\"}"));
        assertThat(unused.getJSONArray("items")).isEmpty();
        assertThat(unused.getLong("total")).isZero();
        assertThat(unused.getJSONObject("counts").getInt("needsReply")).isEqualTo(3);

        JSONObject closed = data(query(token("owner"), "{\"status\": \"closed\"}"));
        assertThat(ids(closed)).containsExactly("784104");
        assertThat(closed.getJSONObject("counts").getInt("active")).isEqualTo(6);

        JSONObject pending = data(query(token("owner"), "{\"status\": \"needs-reply\"}"));
        assertThat(ids(pending)).containsExactly("784102", "784101", "784107");

        assertThat(query(token("owner"), "{\"channelId\": \"no-such-channel\"}").getInt("code")).isEqualTo(11000);
        assertThat(query(token("owner"), "{\"status\": \"bogus\"}").getInt("code")).isEqualTo(11000);
        assertThat(query(token("owner"), "{\"order\": \"bogus\"}").getInt("code")).isEqualTo(11000);
    }

    @Test
    void searchMatchesEveryContractField() throws Exception {
        assertThat(ids(data(query(token("owner"), "{\"search\": \"林小满\"}")))).containsExactly("784101");
        // 去首尾空白后匹配
        assertThat(ids(data(query(token("owner"), "{\"search\": \"  林小满  \"}")))).containsExactly("784101");
        assertThat(ids(data(query(token("owner"), "{\"search\": \"ext-zhou\"}")))).containsExactly("784102");
        // 账号名与渠道显示名
        assertThat(ids(data(query(token("owner"), "{\"search\": \"抖音号\"}")))).containsExactly("784105", "784106");
        assertThat(ids(data(query(token("owner"), "{\"search\": \"微信\"}")))).containsExactly("784102", "784101", "784103");
        // 最后摘要、共享标签与备注
        assertThat(ids(data(query(token("owner"), "{\"search\": \"发票\"}")))).containsExactly("784102");
        assertThat(ids(data(query(token("owner"), "{\"search\": \"VIP\"}")))).containsExactly("784103");
        assertThat(ids(data(query(token("owner"), "{\"search\": \"重点跟进\"}")))).containsExactly("784105");
        assertThat(ids(data(query(token("owner"), "{\"search\": \"回电\"}")))).containsExactly("784105");

        JSONObject miss = data(query(token("owner"), "{\"search\": \"不存在的关键词\"}"));
        assertThat(miss.getJSONArray("items")).isEmpty();
        assertThat(miss.getLong("total")).isZero();
        assertThat(miss.getJSONObject("counts").getInt("active")).isEqualTo(6);

        // LIKE 与 JSON_SEARCH 通配符按字面匹配：未转义时「发票%」会命中「发票问题」、「林_满」会命中「林小满」
        assertThat(ids(data(query(token("owner"), "{\"search\": \"发票%\"}")))).isEmpty();
        assertThat(ids(data(query(token("owner"), "{\"search\": \"林_满\"}")))).isEmpty();
        assertThat(ids(data(query(token("owner"), "{\"search\": \"%\"}")))).isEmpty();
    }

    @Test
    void detailReturnsCurrentSnapshotAndTypedErrors() throws Exception {
        JSONObject data = detail(token("owner"), "784101").getJSONObject("data");
        assertThat(data.getStr("id")).isEqualTo("784101");
        assertThat(data.getStr("status")).isEqualTo("needs-reply");
        assertThat(data.getStr("preview")).isEqualTo("咨询保修");
        assertThat(data.getStr("updatedAt")).isEqualTo("2026-10-11 09:50:00");
        assertThat(data.getStr("waitingSince")).isEqualTo("2026-10-11 09:30:00");
        assertThat(data.getInt("messageCount")).isEqualTo(5);
        assertThat(data.getInt("version")).isEqualTo(2);
        assertThat(data.getJSONObject("identity").getStr("name")).isEqualTo("林小满");
        assertThat(data.getJSONObject("identity").getStr("externalUserId")).isEqualTo("ext-lin");
        assertThat(data.getJSONObject("identity").getStr("channelName")).isEqualTo("微信公众号");

        // 无消息时间回落到创建时间，非待回复省略 waitingSince
        JSONObject closed = detail(token("owner"), "784104").getJSONObject("data");
        assertThat(closed.getStr("updatedAt")).isEqualTo("2026-10-11 10:05:00");
        assertThat(closed.isNull("waitingSince")).isTrue();

        // 在库但不在当前权限内：其他企业 10106，本企业未授权账号 10106；不存在 12100；非法 11000
        assertThat(detail(token("owner"), String.valueOf(OTHER_VISITOR_ID)).getInt("code")).isEqualTo(10106);
        assertThat(ids(data(query(token("owner"), "{\"status\": \"all\"}")))).doesNotContain(String.valueOf(OTHER_VISITOR_ID));
        assertThat(detail(token("owner"), "99999999").getInt("code")).isEqualTo(12100);
        assertThat(detail(token("owner"), "not-a-number").getInt("code")).isEqualTo(11000);
    }

    @Test
    void pageBoundariesAndInputValidationUseContractCodes() throws Exception {
        JSONObject pageOne = data(query(token("owner"), "{\"page\": 1, \"pageSize\": 2}"));
        assertThat(ids(pageOne)).containsExactly("784102", "784101");
        assertThat(pageOne.getInt("pageSize")).isEqualTo(2);
        assertThat(ids(data(query(token("owner"), "{\"page\": 2, \"pageSize\": 2}"))))
            .containsExactly("784107", "784103");
        assertThat(ids(data(query(token("owner"), "{\"page\": 3, \"pageSize\": 2}"))))
            .containsExactly("784105", "784106");
        // 尾页之后：空 items，total 仍为本次筛选总数
        JSONObject past = data(query(token("owner"), "{\"page\": 4, \"pageSize\": 2}"));
        assertThat(past.getJSONArray("items")).isEmpty();
        assertThat(past.getLong("total")).isEqualTo(6L);
        // 上限边界：pageSize=100 与 100 字搜索都合法
        assertThat(data(query(token("owner"), "{\"pageSize\": 100}")).getInt("pageSize")).isEqualTo(100);
        assertThat(query(token("owner"), "{\"search\": \"%s\"}".formatted("x".repeat(100))).getInt("code")).isZero();

        assertThat(query(token("owner"), "{\"page\": 0}").getInt("code")).isEqualTo(11000);
        assertThat(query(token("owner"), "{\"pageSize\": 0}").getInt("code")).isEqualTo(11000);
        assertThat(query(token("owner"), "{\"pageSize\": 101}").getInt("code")).isEqualTo(11200);
        assertThat(query(token("owner"), "{\"search\": \"%s\"}".formatted("x".repeat(101))).getInt("code")).isEqualTo(11200);
    }

    @Test
    void profileUpdateDoesNotChangeMessageOrdering() throws Exception {
        List<String> before = ids(data(query(token("owner"), "{\"status\": \"all\"}")));

        // 名片保存只改 visitor_profile；不产生消息、不改变最后消息时间与排序
        jdbc.update("UPDATE visitor_profile SET tags = JSON_ARRAY('名片更新标记'), note = '名片更新备注',"
            + " version = version + 1, update_time = NOW(3) WHERE visitor_id = 784101");
        jdbc.update("UPDATE visitor SET update_time = NOW(3) WHERE visitor_id = 784101");

        JSONObject after = data(query(token("owner"), "{\"status\": \"all\"}"));
        assertThat(ids(after)).isEqualTo(before);
        JSONObject first = items(after).stream()
            .filter(item -> item.getStr("id").equals("784101")).findFirst().orElseThrow();
        assertThat(first.getStr("updatedAt")).isEqualTo("2026-10-11 09:50:00");
        assertThat(jdbc.queryForObject("SELECT last_message_time FROM visitor WHERE visitor_id = 784101",
            LocalDateTime.class)).isEqualTo(at(50));
        // 名片新标签即刻参与搜索，但仍不移动排序位置
        assertThat(ids(data(query(token("owner"), "{\"search\": \"名片更新标记\"}")))).containsExactly("784101");
    }

    private JSONObject query(String token, String body) throws Exception {
        String response = mvc.perform(post("/api/desk/visitors/query")
                .header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        return JSONUtil.parseObj(response);
    }

    private JSONObject detail(String token, String visitorId) throws Exception {
        String response = mvc.perform(get("/api/desk/visitors/" + visitorId)
                .header("Authorization", "Bearer " + token))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        return JSONUtil.parseObj(response);
    }

    private JSONObject data(JSONObject response) {
        assertThat(response.getInt("code")).isZero();
        return response.getJSONObject("data");
    }

    private List<String> ids(JSONObject data) {
        return items(data).stream().map(item -> item.getStr("id")).toList();
    }

    private List<JSONObject> items(JSONObject data) {
        JSONArray items = data.getJSONArray("items");
        return items.stream().map(item -> (JSONObject) item).toList();
    }

    private String token(String username) throws Exception {
        String body = mvc.perform(post("/api/desk/login").contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"companyId": "%s", "username": "%s", "password": "%s"}
                    """.formatted(COMPANY_ID, username, PASSWORD)))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        return JSONUtil.parseObj(body).getJSONObject("data").getStr("token");
    }

    private void insertVisitor(long visitorId, long companyId, long channelId, String externalUserId, String name,
                               VisitorStatusEnum status, LocalDateTime waitingSince, LocalDateTime lastMessageTime,
                               LocalDateTime createTime, int messageCount, int version, String preview) {
        jdbc.update("INSERT INTO visitor(visitor_id, company_id, company_channel_id, external_user_id, name, status,"
                + " last_message_preview, last_message_time, waiting_since, message_count, version, create_time, update_time)"
                + " VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            visitorId, companyId, channelId, externalUserId, name, status.getCode(), preview,
            lastMessageTime, waitingSince, messageCount, version, createTime, createTime);
        // 契约：创建访客时同一事务创建空名片
        jdbc.update("INSERT INTO visitor_profile(visitor_id, channel_fields, tags, note, version, create_time, update_time)"
            + " VALUES(?, JSON_ARRAY(), JSON_ARRAY(), '', 1, ?, ?)", visitorId, createTime, createTime);
    }

    private void setProfile(long visitorId, String note, String... tags) {
        String placeholders = String.join(", ", Collections.nCopies(tags.length, "?"));
        List<Object> params = new ArrayList<>();
        params.addAll(Arrays.asList(tags));
        params.add(note);
        params.add(visitorId);
        jdbc.update("UPDATE visitor_profile SET tags = JSON_ARRAY(" + placeholders + "), note = ?"
            + " WHERE visitor_id = ?", params.toArray());
    }

    private static LocalDateTime at(long minutes) {
        return BASE.plusMinutes(minutes);
    }

    private CompanyCreateDTO company(long companyId, String adminUsername) {
        return new CompanyCreateDTO(String.valueOf(companyId), "访客验收企业", null, null, null,
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
}
