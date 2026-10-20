package com.dudu.duduserver;

import cn.hutool.json.JSONUtil;
import cn.hutool.jwt.JWT;
import com.dudu.duduserver.config.exception.BizException;
import com.dudu.duduserver.constant.ChannelEnum;
import com.dudu.duduserver.constant.EnableStatusEnum;
import com.dudu.duduserver.dto.CompanyAdminInitDTO;
import com.dudu.duduserver.dto.CompanyCreateDTO;
import com.dudu.duduserver.entity.CompanyChannelDO;
import com.dudu.duduserver.entity.UserDO;
import com.dudu.duduserver.entity.UserGroupDO;
import com.dudu.duduserver.entity.UserGroupMemberDO;
import com.dudu.duduserver.service.*;
import com.dudu.duduserver.testutil.IntegrationTestEnv;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * 独立 MySQL 验收；通过环境变量显式启用，不使用开发库。
 */
@SpringBootTest(properties = {"dudu.auth.jwt-secret=integration-test-secret"})
@AutoConfigureMockMvc
@EnabledIfEnvironmentVariable(named = "DUDU_INTEGRATION_TEST", matches = "true")
class ServerIntegrationTest {

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

    @Test
    void loginUsesRoleCodeAndLogoutPreservesStatelessContract() throws Exception {
        String token = login();
        assertThat(JWT.of(token).getPayload("role")).isEqualTo("admin");
        mvc.perform(post("/api/admin/logout").header("Authorization", "Bearer " + token))
            .andExpect(status().isOk()).andExpect(jsonPath("$.code").value(0));
        mvc.perform(get("/api/admin/profile").header("Authorization", "Bearer " + token))
            .andExpect(jsonPath("$.code").value(0));
    }

    @Test
    void groupPermissionsStayWithinCompanyWithoutForeignKeys() {
        companies.createCompany(company("781001"), 1L);
        companies.createCompany(company("781002"), 1L);
        Long initialUserId = companies.getById(781001L).getInitUserId();
        UserGroupDO first = group(781001L, "售前");
        UserGroupDO second = group(781001L, "售后");
        UserGroupDO foreign = group(781002L, "外部组");
        UserDO ordinaryAdmin = users.createInitialAdmin(781001L,
            new CompanyAdminInitDTO("ordinary", "password123", null));
        assertThat(members.canAccessGroup(initialUserId, second.getGroupId())).isTrue();
        assertThat(members.canAccessGroup(initialUserId, foreign.getGroupId())).isFalse();
        assertThat(members.canAccessGroup(ordinaryAdmin.getUserId(), first.getGroupId())).isFalse();
        UserGroupMemberDO member = new UserGroupMemberDO();
        member.setCompanyId(781001L);
        member.setUserId(ordinaryAdmin.getUserId());
        member.setGroupId(first.getGroupId());
        members.save(member);
        assertThat(members.canAccessGroup(ordinaryAdmin.getUserId(), first.getGroupId())).isTrue();
        assertThat(members.canAccessGroup(ordinaryAdmin.getUserId(), second.getGroupId())).isFalse();
        assertThat(members.canAccessGroup(ordinaryAdmin.getUserId(), foreign.getGroupId())).isFalse();
        // 外键已全部移除，跨企业隔离由应用层判定；此处锚定库内不再存在任何外键的约定
        assertThat(jdbc.queryForObject(
            "SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema = DATABASE()", Long.class))
            .isZero();

        CompanyChannelDO channel = new CompanyChannelDO();
        channel.setCompanyId(781001L);
        channel.setGroupId(first.getGroupId());
        channel.setChannel(ChannelEnum.DOUYIN);
        channel.setAccountName("店铺账号");
        channel.setChannelInfo(Map.of("accountId", "external-123"));
        channels.save(channel);
        CompanyChannelDO saved = channels.getById(channel.getCompanyChannelId());
        assertThat(saved.getChannel()).isEqualTo(ChannelEnum.DOUYIN);
        assertThat(saved.getChannelInfo()).containsEntry("accountId", "external-123");
        assertThat(saved.getCreateTime()).isNotNull();
        assertThat(companies.getById(781001L).getCreateTime()).isNotNull();
        assertThat(users.getById(initialUserId).getCreateTime()).isNotNull();
        assertThat(users.getById(initialUserId).getStatus()).isEqualTo(EnableStatusEnum.ENABLED);
    }

    @Test
    void concurrentDisableCommitsOnceAndApiUsesTypedCodesWithoutResult() throws Exception {
        companies.createCompany(company("781003"), 1L);
        java.util.concurrent.CountDownLatch start = new java.util.concurrent.CountDownLatch(1);
        java.util.concurrent.Callable<Boolean> disable = () -> {
            start.await();
            try {
                companies.disable("781003", "暂停服务", 1L);
                return true;
            } catch (BizException e) {
                assertThat(e.apiEnum()).isEqualTo(com.dudu.duduserver.constant.ApiEnum.DATA_NOT_ALLOW);
                return false;
            }
        };
        try (var executor = java.util.concurrent.Executors.newFixedThreadPool(2)) {
            var first = executor.submit(disable);
            var second = executor.submit(disable);
            start.countDown();
            assertThat(java.util.List.of(first.get(), second.get())).containsExactlyInAnyOrder(true, false);
        }
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM operation_log WHERE company_id=781003 AND action='company.disable'", Long.class))
            .isEqualTo(1);
        String token = login();
        mvc.perform(post("/api/admin/companies/query").contentType(MediaType.APPLICATION_JSON).content("{\"status\":0}").header("Authorization", "Bearer " + token))
            .andExpect(jsonPath("$.code").value(0)).andExpect(jsonPath("$.list[0].status").value(0))
            .andExpect(jsonPath("$.data").doesNotExist());
        mvc.perform(post("/api/admin/operation_logs/query").contentType(MediaType.APPLICATION_JSON).content("{\"action\":\"company.disable\"}")
                .header("Authorization", "Bearer " + token))
            .andExpect(jsonPath("$.list[0].action").value("company.disable"))
            .andExpect(jsonPath("$.list[0].target").value("company"))
            .andExpect(jsonPath("$.list[0].result").doesNotExist());
    }

    @Test
    void companyKeywordSearchTreatsLikeWildcardsAsLiterals() throws Exception {
        // 通配符字面量企业名：% 与 _ 各配一个只差通配符的对照，锁定搜索词不被当成通配符放大
        companies.createCompany(new CompanyCreateDTO("783001", "100%折扣", null, null, null,
            new CompanyAdminInitDTO("admin", "password123", null)), 1L);
        companies.createCompany(new CompanyCreateDTO("783002", "100分折扣", null, null, null,
            new CompanyAdminInitDTO("admin", "password123", null)), 1L);
        companies.createCompany(new CompanyCreateDTO("783003", "要_底线", null, null, null,
            new CompanyAdminInitDTO("admin", "password123", null)), 1L);
        companies.createCompany(new CompanyCreateDTO("783004", "要底线", null, null, null,
            new CompanyAdminInitDTO("admin", "password123", null)), 1L);
        String token = login();
        // % 按字面匹配：只命中名称真含 % 的 783001；未转义时 '%100%%' 会放大命中「100分折扣」
        mvc.perform(post("/api/admin/companies/query").contentType(MediaType.APPLICATION_JSON)
                .content("{\"keyword\":\"100%\"}").header("Authorization", "Bearer " + token))
            .andExpect(jsonPath("$.code").value(0))
            .andExpect(jsonPath("$.list.length()").value(1))
            .andExpect(jsonPath("$.list[0].companyId").value(783001));
        // _ 按字面匹配：只命中 783003；未转义时 '%要_%' 会放大命中「要底线」
        mvc.perform(post("/api/admin/companies/query").contentType(MediaType.APPLICATION_JSON)
                .content("{\"keyword\":\"要_\"}").header("Authorization", "Bearer " + token))
            .andExpect(jsonPath("$.code").value(0))
            .andExpect(jsonPath("$.list.length()").value(1))
            .andExpect(jsonPath("$.list[0].companyId").value(783003));
    }

    @Test
    void v1UpgradePreservesExistingRowsAndMovesExternalIdToJson() {
        // 升级库名从门闩 URL 解析派生（任意 dudu_review_* 形态均可），同实例另建独立库；
        // 先清残留保证可重复执行
        String upgradeDatabase = IntegrationTestEnv.databaseOf(IntegrationTestEnv.jdbcUrl()) + "_upgrade";
        jdbc.execute("DROP DATABASE IF EXISTS " + upgradeDatabase);
        jdbc.execute("CREATE DATABASE " + upgradeDatabase);
        String url = IntegrationTestEnv.withDatabase(IntegrationTestEnv.jdbcUrl(), upgradeDatabase);
        String user = IntegrationTestEnv.dbUser();
        String password = IntegrationTestEnv.dbPassword();
        Flyway.configure().dataSource(url, user, password).target("1").load().migrate();
        JdbcTemplate old = new JdbcTemplate(new DriverManagerDataSource(url, user, password));
        old.update("INSERT INTO company(company_id,company_name,create_time,update_time) VALUES(782001,'旧企业',NOW(),NOW())");
        old.update("INSERT INTO reception_group(group_id,company_id,group_name,create_time,update_time) VALUES(1,782001,'旧组',NOW(),NOW())");
        old.update("INSERT INTO channel_account(company_id,group_id,channel,account_name,external_account_id,create_time,update_time) VALUES(782001,1,'wechat','旧账号','old-id',NOW(),NOW())");
        Flyway.configure().dataSource(url, user, password).load().migrate();
        assertThat(old.queryForObject("SELECT channel_info->>'$.externalAccountId' FROM company_channel", String.class))
            .isEqualTo("old-id");
        assertThat(old.queryForObject("SELECT COUNT(*) FROM user_group", Long.class)).isEqualTo(1);
        assertThat(Flyway.configure().dataSource(url, user, password).load().migrate().migrationsExecuted).isZero();
    }

    private String login() throws Exception {
        String body = mvc.perform(post("/api/admin/login").contentType(MediaType.APPLICATION_JSON)
                .content("{\"username\":\"Admin\",\"password\":\"admin\"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.code").value(0))
            .andReturn().getResponse().getContentAsString();
        return JSONUtil.parseObj(body).getJSONObject("data").getStr("token");
    }

    private CompanyCreateDTO company(String id) {
        return new CompanyCreateDTO(id, "集成验收企业", null, null, null,
            new CompanyAdminInitDTO("admin", "password123", null));
    }

    private UserGroupDO group(Long companyId, String name) {
        UserGroupDO group = new UserGroupDO();
        group.setCompanyId(companyId);
        group.setGroupName(name);
        groups.save(group);
        return group;
    }
}
