package com.dudu.duduserver;

import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.dudu.duduserver.dto.CompanyAdminInitDTO;
import com.dudu.duduserver.dto.CompanyCreateDTO;
import com.dudu.duduserver.service.CompanyService;
import com.dudu.duduserver.testutil.IntegrationTestEnv;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.MockMvcPrint;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.context.event.RecordApplicationEvents;
import org.springframework.test.context.event.ApplicationEvents;
import com.dudu.duduserver.socket.DeskAccessChangedEvent;
import com.dudu.duduserver.service.ConsoleEmployeeService;
import com.dudu.duduserver.service.ConsoleAccessService;
import com.dudu.duduserver.service.UserService;
import com.dudu.duduserver.config.auth.JwtManager;
import com.dudu.duduserver.config.exception.BizException;
import com.dudu.duduserver.constant.UserRoleEnum;
import com.dudu.duduserver.entity.UserDO;
import com.dudu.duduserver.dto.ConsoleIdentityRequests;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.Executors;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

/**
 * Console 企业认证与员工 HTTP 契约验收；仅连接显式指定的独立评审库。
 */
@SpringBootTest
@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
@RecordApplicationEvents
@EnabledIfEnvironmentVariable(named = "DUDU_INTEGRATION_TEST", matches = "true")
class ConsoleIdentityIntegrationTest {
    private static final AtomicInteger COMPANY_IDS = new AtomicInteger(788000);
    @Autowired MockMvc mvc;
    @Autowired CompanyService companies;
    @Autowired ApplicationEvents events;
    @Autowired UserService users;
    @Autowired ConsoleEmployeeService employees;
    @Autowired ConsoleAccessService access;
    @Autowired JwtManager jwt;
    @Autowired PlatformTransactionManager transactionManager;

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", IntegrationTestEnv::jdbcUrl);
        registry.add("spring.datasource.username", IntegrationTestEnv::dbUser);
        registry.add("spring.datasource.password", IntegrationTestEnv::dbPassword);
    }

    @Test
    void initialAdministratorLogsInAndRestoresSafeCompanyIdentity() throws Exception {
        String companyId = company();
        JSONObject login = request(post("/api/console/login"), null,
            Map.of("companyId", companyId, "username", " admin ", "password", "password123"));
        assertThat(login.getInt("code")).isZero();
        JSONObject data = login.getJSONObject("data");
        assertThat(data.getJSONObject("profile").getJSONObject("user").getBool("isInitialAdmin")).isTrue();
        assertThat(data.getJSONObject("profile").getJSONObject("company").getStr("companyId")).isEqualTo(companyId);
        assertThat(data.toString()).doesNotContain("passwordHash");
        JSONObject profile = request(get("/api/console/profile"), data.getStr("token"), null);
        assertThat(profile.getInt("code")).isZero();
        assertThat((Object) profile.getJSONObject("data")).isEqualTo(data.getJSONObject("profile"));
    }

    @Test
    void initialAdministratorCreatesAndMaintainsEmployeeWithoutChangingIdentity() throws Exception {
        String companyId = company();
        String token = token(companyId);
        JSONObject employee = request(post("/api/console/employees"), token,
            Map.of("username", " Alice ", "name", " Alice 示例 ", "password", " password123 "));
        assertThat(employee.getInt("code")).isZero();
        JSONObject view = employee.getJSONObject("data");
        String id = view.getStr("userId");
        assertThat(view.getStr("username")).isEqualTo("Alice");
        assertThat(view.getStr("name")).isEqualTo("Alice 示例");
        assertThat(view.getStr("role")).isEqualTo("user");
        assertThat(view.getInt("status")).isEqualTo(1);
        assertThat(view.toString()).doesNotContain("passwordHash", "password123");
        JSONObject renamed = request(put("/api/console/employees/" + id), token, Map.of("name", " 新名称 "));
        assertThat(renamed.getJSONObject("data").getStr("name")).isEqualTo("新名称");
        assertThat(renamed.getJSONObject("data").getStr("username")).isEqualTo("Alice");
        assertThat(request(post("/api/console/employees/query"), token,
            Map.of("keyword", "  新名称  ", "page", 99)).getJSONArray("list")).hasSize(1);
        assertThat(request(post("/api/console/login"), null,
            Map.of("companyId", companyId, "username", "Alice", "password", " password123 ")).getInt("code"))
            .isEqualTo(10106);
    }

    private String token(String companyId) throws Exception {
        return request(post("/api/console/login"), null,
            Map.of("companyId", companyId, "username", "admin", "password", "password123"))
            .getJSONObject("data").getStr("token");
    }

    @Test
    void employeeRoleStatusAndPasswordChangesRespectProtectionAndPublishCommittedAccessChanges() throws Exception {
        String companyId = company();
        String admin = token(companyId);
        String employeeId = request(post("/api/console/employees"), admin,
            Map.of("username", "manager", "name", "管理者", "password", "password123"))
            .getJSONObject("data").getStr("userId");
        String rootId = request(get("/api/console/profile"), admin, null)
            .getJSONObject("data").getJSONObject("user").getStr("userId");
        long before = events.stream(DeskAccessChangedEvent.class).count();
        assertThat(request(put("/api/console/employees/" + employeeId + "/role"), admin,
            Map.of("role", "console")).getInt("code")).isZero();
        assertThat(events.stream(DeskAccessChangedEvent.class).count()).isEqualTo(before + 1);
        String manager = request(post("/api/console/login"), null,
            Map.of("companyId", companyId, "username", "manager", "password", "password123"))
            .getJSONObject("data").getStr("token");
        assertThat(request(get("/api/console/profile"), manager, null).getInt("code")).isZero();
        assertThat(request(post("/api/console/employees/query"), manager, Map.of()).getInt("code")).isEqualTo(10106);
        assertThat(request(put("/api/console/employees/" + rootId + "/status"), admin,
            Map.of("status", 0)).getInt("code")).isEqualTo(12200);
        assertThat(request(put("/api/console/employees/" + rootId + "/role"), admin,
            Map.of("role", "user")).getInt("code")).isEqualTo(12200);
        assertThat(request(put("/api/console/employees/" + rootId + "/password"), admin,
            Map.of("newPassword", "replacement123")).getInt("code")).isEqualTo(12200);
        assertThat(request(put("/api/console/employees/" + employeeId + "/password"), admin,
            Map.of("newPassword", "replacement123")).getInt("code")).isZero();
        assertThat(request(put("/api/console/employees/" + employeeId + "/status"), admin,
            Map.of("status", 0)).getInt("code")).isZero();
        assertThat(events.stream(DeskAccessChangedEvent.class).count()).isEqualTo(before + 2);
        assertThat(request(get("/api/console/profile"), manager, null).getInt("code")).isEqualTo(10102);
        assertThat(request(put("/api/console/employees/" + employeeId + "/status"), admin,
            Map.of("status", 1)).getInt("code")).isZero();
        assertThat(request(put("/api/console/employees/" + employeeId + "/role"), admin,
            Map.of("role", "user")).getInt("code")).isZero();
        assertThat(request(get("/api/console/profile"), manager, null).getInt("code")).isEqualTo(10106);
        JSONObject desk = request(post("/api/desk/login"), null,
            Map.of("companyId", companyId, "username", "manager", "password", "replacement123"));
        assertThat(desk.getInt("code")).isZero();
    }

    @Test
    void requestWhitelistRejectsUnexpectedFieldsAndNumericCompanyIdWithoutEchoingCredentials() throws Exception {
        String companyId = company();
        JSONObject numeric = request(post("/api/console/login"), null,
            Map.of("companyId", Integer.valueOf(companyId), "username", "admin", "password", "password123"));
        assertThat(numeric.getInt("code")).isEqualTo(11000);
        JSONObject unknown = request(post("/api/console/login"), null,
            Map.of("companyId", companyId, "username", "admin", "password", "password123", "unexpected", "secret-value"));
        assertThat(unknown.getInt("code")).isEqualTo(11000);
        assertThat(unknown.toString()).doesNotContain("secret-value", "password123");
        String admin = token(companyId);
        assertThat(request(post("/api/console/employees"), admin,
            Map.of("username", "alice", "name", "Alice", "password", "password123", "role", "console"))
            .getInt("code")).isEqualTo(11000);
    }

    @Test
    void personalPasswordRequiresOldPasswordAndLogoutRemainsStateless() throws Exception {
        String companyId = company();
        String admin = token(companyId);
        assertThat(request(put("/api/console/profile/password"), admin,
            Map.of("oldPassword", "wrong", "newPassword", " changed123 ")).getInt("code")).isEqualTo(12310);
        assertThat(token(companyId)).isNotBlank();
        assertThat(request(put("/api/console/profile/password"), admin,
            Map.of("oldPassword", "password123", "newPassword", " changed123 ")).getInt("code")).isZero();
        assertThat(request(post("/api/console/login"), null,
            Map.of("companyId", companyId, "username", "admin", "password", "password123")).getInt("code"))
            .isEqualTo(10104);
        assertThat(request(post("/api/console/login"), null,
            Map.of("companyId", companyId, "username", "admin", "password", " changed123 ")).getInt("code"))
            .isZero();
        assertThat(request(post("/api/console/logout"), admin, null).getInt("code")).isZero();
        assertThat(request(get("/api/console/profile"), admin, null).getInt("code")).isZero();
    }

    @Test
    void employeeObjectsAndWritesCannotCrossCompanyAndDuplicateCreationIsSerialized() throws Exception {
        String companyId = company();
        String admin = token(companyId);
        String foreign = token(company());
        CountDownLatch start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            java.util.concurrent.Callable<Integer> create = () -> {
                start.await();
                return request(post("/api/console/employees"), admin,
                    Map.of("username", "SameName", "name", "员工", "password", "password123")).getInt("code");
            };
            var first = executor.submit(create);
            var second = executor.submit(create);
            start.countDown();
            assertThat(java.util.List.of(first.get(10, TimeUnit.SECONDS), second.get(10, TimeUnit.SECONDS)))
                .containsExactlyInAnyOrder(0, 12300);
        }
        JSONObject list = request(post("/api/console/employees/query"), admin, Map.of("keyword", "samename"));
        assertThat(list.getLong("total")).isEqualTo(1);
        String id = list.getJSONArray("list").getJSONObject(0).getStr("userId");
        assertThat(request(get("/api/console/employees/" + id), foreign, null).getInt("code")).isEqualTo(12100);
        assertThat(request(put("/api/console/employees/" + id), foreign, Map.of("name", "不能改"))
            .getInt("code")).isEqualTo(12100);
        assertThat(request(post("/api/console/employees"), admin,
            Map.of("username", "samename", "name", "重复", "password", "password123")).getInt("code"))
            .isEqualTo(12300);
    }

    @Test
    void waitingWriteRevalidatesPersistentRoleAfterCompanyLockIsReleased() throws Exception {
        String companyId = company();
        String admin = token(companyId);
        var me = jwt.parseToken(admin);
        String id = request(post("/api/console/employees"), admin,
            Map.of("username", "target", "name", "原名称", "password", "password123"))
            .getJSONObject("data").getStr("userId");
        TransactionTemplate transaction = new TransactionTemplate(transactionManager);
        try (var executor = Executors.newSingleThreadExecutor()) {
            java.util.concurrent.atomic.AtomicReference<java.util.concurrent.Future<Integer>> waiting =
                new java.util.concurrent.atomic.AtomicReference<>();
            transaction.executeWithoutResult(status -> {
                access.lock(me);
                CountDownLatch started = new CountDownLatch(1);
                var future = executor.submit(() -> {
                    started.countDown();
                    try {
                        employees.rename(me, id, new ConsoleIdentityRequests.Name("越权名称"));
                        return 0;
                    } catch (BizException error) {
                        return error.apiEnum().code;
                    }
                });
                waiting.set(future);
                try {
                    assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();
                    assertThatThrownBy(() -> future.get(150, TimeUnit.MILLISECONDS))
                        .isInstanceOf(TimeoutException.class);
                } catch (InterruptedException error) {
                    Thread.currentThread().interrupt();
                    throw new IllegalStateException(error);
                }
                UserDO patch = new UserDO();
                patch.setUserId(me.userId());
                patch.setRole(UserRoleEnum.USER);
                users.updateById(patch);
            });
            assertThat(waiting.get().get(10, TimeUnit.SECONDS)).isEqualTo(10106);
        } finally {
            // 模拟其他入口撤权后恢复测试身份，最终仍从公开 HTTP 观察目标没有被修改。
            UserDO patch = new UserDO();
            patch.setUserId(me.userId());
            patch.setRole(UserRoleEnum.CONSOLE);
            users.updateById(patch);
        }
        assertThat(request(get("/api/console/employees/" + id), admin, null)
            .getJSONObject("data").getStr("name")).isEqualTo("原名称");
    }

    private String company() {
        String id;
        do {
            id = String.valueOf(COMPANY_IDS.incrementAndGet());
        } while (companies.getById(Long.valueOf(id)) != null);
        companies.createCompany(new CompanyCreateDTO(id, "Console验收", null, null, null,
            new CompanyAdminInitDTO("admin", "password123", "初始管理员")), 1L);
        return id;
    }

    private JSONObject request(MockHttpServletRequestBuilder builder, String token, Object body) throws Exception {
        if (token != null) builder.header("Authorization", "Bearer " + token);
        if (body != null) builder.contentType(MediaType.APPLICATION_JSON).content(JSONUtil.toJsonStr(body));
        return JSONUtil.parseObj(mvc.perform(builder)
            .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isOk())
            .andReturn().getResponse().getContentAsString());
    }
}
