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
import static org.assertj.core.api.Assertions.assertThatThrownBy;
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
    void groupPermissionsAndCompositeForeignKeysStayWithinCompany() {
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
        member.setMemberId(null);
        member.setGroupId(foreign.getGroupId());
        assertThatThrownBy(() -> members.save(member)).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        member.setCompanyId(781002L);
        assertThatThrownBy(() -> members.save(member)).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);

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
    void v1UpgradePreservesExistingRowsAndMovesExternalIdToJson() {
        jdbc.execute("CREATE DATABASE dudu_review_upgrade");
        String url = System.getenv("DUDU_TEST_JDBC_URL").replace("/dudu_review?", "/dudu_review_upgrade?");
        String password = System.getenv("DUDU_TEST_DB_PASSWORD");
        Flyway.configure().dataSource(url, "root", password).target("1").load().migrate();
        JdbcTemplate old = new JdbcTemplate(new DriverManagerDataSource(url, "root", password));
        old.update("INSERT INTO company(company_id,company_name,create_time,update_time) VALUES(782001,'旧企业',NOW(),NOW())");
        old.update("INSERT INTO reception_group(group_id,company_id,group_name,create_time,update_time) VALUES(1,782001,'旧组',NOW(),NOW())");
        old.update("INSERT INTO channel_account(company_id,group_id,channel,account_name,external_account_id,create_time,update_time) VALUES(782001,1,'wechat','旧账号','old-id',NOW(),NOW())");
        Flyway.configure().dataSource(url, "root", password).load().migrate();
        assertThat(old.queryForObject("SELECT channel_info->>'$.externalAccountId' FROM company_channel", String.class))
            .isEqualTo("old-id");
        assertThat(old.queryForObject("SELECT COUNT(*) FROM user_group", Long.class)).isEqualTo(1);
        assertThat(Flyway.configure().dataSource(url, "root", password).load().migrate().migrationsExecuted).isZero();
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
