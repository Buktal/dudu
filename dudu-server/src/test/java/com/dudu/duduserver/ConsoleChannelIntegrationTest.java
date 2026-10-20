package com.dudu.duduserver;

import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.dudu.duduserver.config.auth.JwtUser;
import com.dudu.duduserver.dto.ConsoleChannelRequests;
import com.dudu.duduserver.service.ConsoleChannelService;
import com.dudu.duduserver.entity.UserDO;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.support.TransactionTemplate;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import com.dudu.duduserver.constant.UserRoleEnum;
import com.dudu.duduserver.entity.UserGroupDO;
import com.dudu.duduserver.testutil.IntegrationTestEnv;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * Console 渠道管理的真实 HTTP/MySQL 边界；仅自建自删 dudu_review_console_channels，不触开发库。
 */
@SpringBootTest(properties = {"dudu.auth.jwt-secret=console-channel-integration-secret",
    "dudu.channel.callback-base-url=https://public.example"}, webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureMockMvc
@EnabledIfEnvironmentVariable(named = "DUDU_INTEGRATION_TEST", matches = "true")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class ConsoleChannelIntegrationTest extends DeskIntegrationSupport {
    private static final String DATABASE = "dudu_review_console_channels";
    private static final AtomicLong COMPANIES = new AtomicLong(681000);
    private static JdbcTemplate admin;
    @Autowired ConsoleChannelService management;
    @Autowired TransactionTemplate transactions;
    private Long companyId;
    private UserGroupDO source;
    private UserGroupDO target;
    private String ownerToken;

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        String configured = IntegrationTestEnv.jdbcUrl();
        if (!DATABASE.equals(IntegrationTestEnv.databaseOf(configured))) throw new IllegalStateException("测试库名不匹配");
        admin = new JdbcTemplate(new DriverManagerDataSource(IntegrationTestEnv.withDatabase(configured, ""),
            IntegrationTestEnv.dbUser(), IntegrationTestEnv.dbPassword()));
        admin.execute("DROP DATABASE IF EXISTS " + DATABASE);
        admin.execute("CREATE DATABASE " + DATABASE + " CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci");
        registry.add("spring.datasource.url", () -> configured);
        registry.add("spring.datasource.username", IntegrationTestEnv::dbUser);
        registry.add("spring.datasource.password", IntegrationTestEnv::dbPassword);
    }

    @AfterAll
    void dropDatabase() {
        admin.execute("DROP DATABASE IF EXISTS " + DATABASE);
    }

    @BeforeEach
    void seed() {
        companyId = COMPANIES.incrementAndGet();
        companies.createCompany(company(companyId, "owner", "渠道管理测试企业"), 1L);
        source = group(companyId, "原组");
        target = group(companyId, "目标组");
        ownerToken = token(companies.getById(companyId).getInitUserId());
    }

    private String token(Long userId) {
        return jwtManager.createToken(new JwtUser(companyId, userId, UserRoleEnum.CONSOLE, System.currentTimeMillis() / 1000 + 3600));
    }

    private JSONObject create(String channel, Map<String, Object> fields) throws Exception {
        return JSONUtil.parseObj(deskPost(ownerToken, "/api/console/company_channels", JSONUtil.toJsonStr(Map.of(
            "groupId", source.getGroupId().toString(), "channel", channel, "accountName", " 接待账号 ", "fields", fields))));
    }

    @Test
    void createWechatAndReadSafeDetailAndFlatPaginatedList() throws Exception {
        JSONObject created = data(create("wechat-mp", Map.of("token", "receive-secret")));
        String id = created.getStr("companyChannelId");
        assertThat(created.getBool("receiveConfigured")).isTrue();
        assertThat(created.getBool("sendConfigured")).isFalse();
        assertThat(created.getStr("accountName")).isEqualTo("接待账号");
        assertThat(created.getStr("callbackUrl")).isEqualTo("https://public.example/api/channels/" + id + "/callback");
        assertThat(created.toString()).doesNotContain("receive-secret", "channelInfo");
        JSONObject listed = JSONUtil.parseObj(deskPost(ownerToken, "/api/console/company_channels/query", "{}"));
        assertThat(listed.getInt("code")).isZero();
        assertThat(listed.getLong("total")).isEqualTo(1L);
        assertThat(listed.containsKey("data")).isFalse();
        assertThat(listed.toString()).doesNotContain("receive-secret", "configuredSecretFields", "callbackUrl");
        assertThat(data(JSONUtil.parseObj(deskGet(ownerToken, "/api/console/company_channels/" + id))).getStr("companyChannelId")).isEqualTo(id);
    }

    private String update(String token, String id, Map<String, Object> set, List<String> clear) throws Exception {
        return deskPut(token, "/api/console/company_channels/" + id, JSONUtil.toJsonStr(Map.of("accountName", "维护后", "credentialChanges", Map.of("set", set, "clear", clear))));
    }

    @Test
    void actualCatalogHasThirteenAdaptersAndHonorsDeploymentRestriction() throws Exception {
        var definitions = data(JSONUtil.parseObj(deskGet(ownerToken, "/api/console/channels"))).getJSONArray("channels");
        assertThat(definitions).hasSize(13);
        assertThat(definitions.stream().map(item -> ((JSONObject) item).getStr("channel")).toList()).doesNotContain("bilibili");
        JSONObject meituan = definitions.stream().map(item -> (JSONObject) item).filter(item -> item.getStr("channel").equals("meituan")).findFirst().orElseThrow();
        assertThat(meituan.getBool("available")).isFalse();
        assertThat(create("meituan", Map.of("app_id", "app", "app_secret", "secret")).getInt("code")).isEqualTo(12200);
        assertThat(create("bilibili", Map.of()).getInt("code")).isEqualTo(12200);
    }

    @Test
    void credentialsAreWriteOnlyAndInvalidClearOrIdentityChangeRollsBackWholeCommand() throws Exception {
        String id = data(create("wechat-mp", Map.of("token", "callback-secret", "appId", "application", "appSecret", "sending-secret"))).getStr("companyChannelId");
        assertThat(code(update(ownerToken, id, Map.of(), List.of("token")))).isEqualTo(12200);
        assertThat(code(update(ownerToken, id, Map.of("appId", "different"), List.of()))).isEqualTo(12200);
        JSONObject unchanged = data(JSONUtil.parseObj(deskGet(ownerToken, "/api/console/company_channels/" + id)));
        assertThat(unchanged.getStr("accountName")).isEqualTo("接待账号");
        assertThat(unchanged.getJSONObject("fields").getStr("appId")).isEqualTo("application");
        JSONObject saved = data(JSONUtil.parseObj(update(ownerToken, id, Map.of(), List.of("appSecret"))));
        assertThat(saved.getJSONArray("configuredSecretFields")).containsExactly("token");
        assertThat(saved.getJSONArray("missingSendFields")).containsExactly("appSecret");
        String noSecrets = deskGet(ownerToken, "/api/console/company_channels/" + id);
        assertThat(noSecrets).doesNotContain("callback-secret", "sending-secret", "channelInfo");
        assertThat(code(deskPut(ownerToken, "/api/console/company_channels/" + id,
            "{\"accountName\":\"非法\",\"companyId\":\"999999\",\"credentialChanges\":{\"set\":{},\"clear\":[]}}"))).isEqualTo(11000);
        assertThat(code(update(ownerToken, id, Map.of("url", "https://evil.example"), List.of()))).isEqualTo(11000);
        assertThat(code(update(ownerToken, id, Map.of("token", "new"), List.of("token")))).isEqualTo(11000);
        assertThat(code(update(ownerToken, id, Map.of("token", 123), List.of()))).isEqualTo(11000);
        mvc.perform(get("/api/console/company_channels/" + id).header("Authorization", "Bearer " + ownerToken))
            .andExpect(status().isOk()).andExpect(result -> assertThat(result.getResponse().getHeader("Cache-Control")).isEqualTo("no-store"));
    }

    @Test
    void telegramAliasCannotBypassBotIdentityAndWhatsappGetsFinalCallbackInsideTransaction() throws Exception {
        String telegram = data(create("telegram", Map.of("secretToken", "callback-secret", "botToken", "123:original"))).getStr("companyChannelId");
        JSONObject rotated = data(JSONUtil.parseObj(update(ownerToken, telegram, Map.of("botToken", "123:rotated"), List.of())));
        assertThat(rotated.toString()).doesNotContain("123:rotated", "api.telegram.org", "botId");
        assertThat(rotated.getJSONArray("configuredSecretFields")).contains("botToken");
        assertThat(code(update(ownerToken, telegram, Map.of(), List.of("botToken")))).isZero();
        assertThat(code(update(ownerToken, telegram, Map.of("botToken", "456:rebound"), List.of()))).isEqualTo(12200);
        assertThat(code(update(ownerToken, telegram, Map.of("botToken", "123:restored"), List.of()))).isZero();
        String whatsapp = data(create("whatsapp", Map.of("appSecret", "post-secret", "verifyToken", "get-secret"))).getStr("companyChannelId");
        mvc.perform(get("/api/channels/" + whatsapp + "/callback").queryParam("hub.mode", "subscribe")
            .queryParam("hub.challenge", "challenge-value").queryParam("hub.verify_token", "get-secret"))
            .andExpect(status().isOk()).andExpect(result -> assertThat(result.getResponse().getContentAsString()).isEqualTo("challenge-value"));
        assertThat(code(update(ownerToken, whatsapp, Map.of("url", "https://evil.example"), List.of()))).isEqualTo(11000);
    }

    @Test
    void ordinaryAdministratorNeedsBothGroupsAndEmptyScopeNeverMeansWholeCompany() throws Exception {
        String id = data(create("wechat-mp", Map.of("token", "secret"))).getStr("companyChannelId");
        UserDO manager = adminUser(companyId, "manager");
        String managerToken = token(manager.getUserId());
        JSONObject empty = JSONUtil.parseObj(deskPost(managerToken, "/api/console/company_channels/query", "{}"));
        assertThat(empty.getLong("total")).isZero();
        assertThat(code(deskGet(managerToken, "/api/console/company_channels/" + id))).isEqualTo(12100);
        members.save(member(companyId, manager.getUserId(), source.getGroupId()));
        assertThat(code(deskPut(managerToken, "/api/console/company_channels/" + id + "/group", "{\"groupId\":\"" + target.getGroupId() + "\"}"))).isEqualTo(12100);
        members.save(member(companyId, manager.getUserId(), target.getGroupId()));
        assertThat(code(deskPut(managerToken, "/api/console/company_channels/" + id + "/group", "{\"groupId\":\"" + target.getGroupId() + "\"}"))).isZero();
        long otherCompany = COMPANIES.incrementAndGet();
        companies.createCompany(company(otherCompany, "owner", "其他企业"), 1L);
        Long otherGroup = group(otherCompany, "其他组").getGroupId();
        assertThat(code(deskPut(ownerToken, "/api/console/company_channels/" + id + "/group", "{\"groupId\":\"" + otherGroup + "\"}"))).isEqualTo(12100);
        assertThat(code(deskPost(managerToken, "/api/console/company_channels/query", "{\"groupId\":\"" + otherGroup + "\"}"))).isEqualTo(12100);
    }

    @Test
    void rollbackDoesNotLeaveAccountOrDeskAccessNotificationAndCommitDoesNotify() throws Exception {
        SocketClient socket = connectAndAuth(ownerToken);
        JwtUser owner = jwtManager.parseToken(ownerToken);
        transactions.executeWithoutResult(transaction -> {
            management.create(owner, new ConsoleChannelRequests.Create(source.getGroupId().toString(),
                com.dudu.duduserver.constant.ChannelEnum.WECHAT_MP, "回滚账号", Map.of("token", "test-secret")), "http://localhost:8080");
            transaction.setRollbackOnly();
        });
        assertThat(JSONUtil.parseObj(deskPost(ownerToken, "/api/console/company_channels/query", "{}")).getLong("total")).isZero();
        assertThat((Object) socket.next(Duration.ofMillis(300))).isNull();
        assertThat(create("wechat-mp", Map.of("token", "test-secret")).getInt("code")).isZero();
        assertThat(socket.next(Duration.ofSeconds(3)).getStr("type")).isEqualTo("access-changed");
    }

    @Test
    void waitingWriteRechecksSourceGroupAfterConcurrentScopeRemoval() throws Exception {
        String id = data(create("wechat-mp", Map.of("token", "secret"))).getStr("companyChannelId");
        UserDO manager = adminUser(companyId, "manager");
        var membership = member(companyId, manager.getUserId(), source.getGroupId());
        members.save(membership);
        members.save(member(companyId, manager.getUserId(), target.getGroupId()));
        String managerToken = token(manager.getUserId());
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var future = transactions.execute(transaction -> {
                companies.lambdaQuery().eq(com.dudu.duduserver.entity.CompanyDO::getCompanyId, companyId).last("FOR UPDATE").one();
                CountDownLatch entered = new CountDownLatch(1);
                var waiting = executor.submit(() -> {
                    entered.countDown();
                    return deskPut(managerToken, "/api/console/company_channels/" + id + "/group", "{\"groupId\":\"" + target.getGroupId() + "\"}");
                });
                try {
                    assertThat(entered.await(3, TimeUnit.SECONDS)).isTrue();
                    assertThatThrownBy(() -> waiting.get(300, TimeUnit.MILLISECONDS)).isInstanceOf(TimeoutException.class);
                } catch (InterruptedException error) { throw new RuntimeException(error); }
                members.removeById(membership.getMemberId());
                return waiting;
            });
            assertThat(code(future.get(5, TimeUnit.SECONDS))).isEqualTo(12100);
        }
        assertThat(data(JSONUtil.parseObj(deskGet(ownerToken, "/api/console/company_channels/" + id))).getStr("groupId")).isEqualTo(source.getGroupId().toString());
    }

    @Test
    void createdWechatReceivesRealCallbackAndMoveTransfersSameDeskHistory() throws Exception {
        String id = data(create("wechat-mp", Map.of("token", "callback-secret"))).getStr("companyChannelId");
        UserDO oldAgent = plainUser(companyId, "old-agent");
        UserDO newAgent = plainUser(companyId, "new-agent");
        members.save(member(companyId, oldAgent.getUserId(), source.getGroupId()));
        members.save(member(companyId, newAgent.getUserId(), target.getGroupId()));
        String oldToken = login(companyId, "old-agent");
        String newToken = login(companyId, "new-agent");
        String signature = cn.hutool.crypto.digest.DigestUtil.sha1Hex("123callback-secretnonce");
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/channels/" + id + "/callback")
            .queryParam("timestamp", "123").queryParam("nonce", "nonce").queryParam("signature", signature)
            .contentType(org.springframework.http.MediaType.APPLICATION_XML).content(textPush("official", "visitor", "来信内容", "message-1")))
            .andExpect(status().isOk()).andExpect(result -> assertThat(result.getResponse().getContentAsString()).isEqualTo("success"));
        JSONObject before = data(JSONUtil.parseObj(deskPost(oldToken, "/api/desk/visitors/query", "{}")));
        assertThat(before.getLong("total")).isEqualTo(1L);
        String visitorId = before.getJSONArray("items").getJSONObject(0).getStr("id");
        String historyBefore = deskGet(oldToken, "/api/desk/visitors/" + visitorId + "/messages");
        assertThat(code(deskPut(ownerToken, "/api/console/company_channels/" + id + "/group", "{\"groupId\":\"" + target.getGroupId() + "\"}"))).isZero();
        assertThat(data(JSONUtil.parseObj(deskPost(oldToken, "/api/desk/visitors/query", "{}"))).getLong("total")).isZero();
        assertThat(code(deskGet(oldToken, "/api/desk/visitors/" + visitorId))).isEqualTo(10106);
        JSONObject after = data(JSONUtil.parseObj(deskPost(newToken, "/api/desk/visitors/query", "{}")));
        assertThat(after.getJSONArray("items").getJSONObject(0).getStr("id")).isEqualTo(visitorId);
        assertThat(deskGet(newToken, "/api/desk/visitors/" + visitorId + "/messages")).isEqualTo(historyBefore);
    }

    @Test
    void configurationBodyLimitCountsActualUtf8RequestIncludingWhitespace() throws Exception {
        String body = JSONUtil.toJsonStr(Map.of("groupId", source.getGroupId().toString(), "channel", "wechat-mp", "accountName", "超限账号", "fields", Map.of("token", "secret"))) + " ".repeat(128 * 1024);
        assertThat(code(deskPost(ownerToken, "/api/console/company_channels", body))).isEqualTo(11200);
        assertThat(JSONUtil.parseObj(deskPost(ownerToken, "/api/console/company_channels/query", "{}")).getLong("total")).isZero();
    }
}
