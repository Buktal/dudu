package com.dudu.duduserver;

import com.dudu.duduserver.config.auth.*;
import com.dudu.duduserver.dto.*;
import com.dudu.duduserver.service.*;
import com.dudu.duduserver.constant.UserRoleEnum;
import com.dudu.duduserver.constant.EnableStatusEnum;
import com.dudu.duduserver.entity.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import com.dudu.duduserver.socket.DeskAccessChangedEvent;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import com.dudu.duduserver.testutil.IntegrationTestEnv;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.http.MediaType;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * 用户组 HTTP 契约验收，使用独立数据库。
 */
@SpringBootTest(properties="dudu.auth.jwt-secret=integration-test-secret")
@AutoConfigureMockMvc
@EnabledIfEnvironmentVariable(named="DUDU_INTEGRATION_TEST",matches="true")
@Import(ConsoleGroupIntegrationTest.EventConfiguration.class)
class ConsoleGroupIntegrationTest {
    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url",IntegrationTestEnv::jdbcUrl);
        registry.add("spring.datasource.username",IntegrationTestEnv::dbUser);
        registry.add("spring.datasource.password",IntegrationTestEnv::dbPassword);
    }
    @Autowired MockMvc mvc;
    @Autowired CompanyService companies;
    @Autowired JwtManager tokens;
    @Autowired UserService users;
    @Autowired UserGroupService groups;
    @Autowired UserGroupMemberService members;
    @Autowired ObjectMapper json;
    @Autowired PlatformTransactionManager transactionManager;
    @Autowired CommittedEvents committedEvents;

    @Test
    void initialAdminCreatesAndQueriesDuplicateNamesWithoutSyntheticMembership() throws Exception {
        companies.createCompany(new CompanyCreateDTO("891001","测试企业",null,null,null,
            new CompanyAdminInitDTO("initial","password123",null)),1L);
        String auth="Bearer "+tokens.createToken(new JwtUser(891001L,
            companies.getById(891001L).getInitUserId(),UserRoleEnum.CONSOLE,System.currentTimeMillis()/1000+3600));
        for(int i=0;i<2;i++) {
            mvc.perform(post("/api/console/user_groups").header("Authorization",auth)
                .contentType(MediaType.APPLICATION_JSON).content("{\"groupName\":\"  同名组  \"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.code").value(0))
                .andExpect(jsonPath("$.data.groupName").value("同名组"))
                .andExpect(jsonPath("$.data.memberCount").value(0));
        }
        mvc.perform(post("/api/console/user_groups/query").header("Authorization",auth)
            .contentType(MediaType.APPLICATION_JSON).content("{\"keyword\":\" 同名 \"}"))
            .andExpect(jsonPath("$.code").value(0)).andExpect(jsonPath("$.total").value(2));
    }

    @Test
    void membershipIsScopedIdempotentAndDisabledMembersRemainRemovable() throws Exception {
        Fixture f = fixture(891002L);
        UserDO employee = employee(f.companyId(), "employee", UserRoleEnum.USER);
        UserDO otherAdmin = employee(f.companyId(), "otherAdmin", UserRoleEnum.CONSOLE);
        String memberPath = path(f) + "/members/" + employee.getUserId();
        mvc.perform(get(path(f)+"/member_candidates").header("Authorization",f.managerAuth()))
            .andExpect(jsonPath("$.total").value(1)).andExpect(jsonPath("$.list[0].userId").value(employee.getUserId().toString()));
        for (int i=0;i<2;i++) {
            mvc.perform(put(memberPath).header("Authorization",f.managerAuth()))
                .andExpect(jsonPath("$.code").value(0)).andExpect(jsonPath("$.data.member").value(true));
        }
        users.lambdaUpdate().eq(UserDO::getUserId,employee.getUserId()).set(UserDO::getStatus,EnableStatusEnum.DISABLED).update();
        mvc.perform(get(path(f)+"/members").header("Authorization",f.managerAuth()))
            .andExpect(jsonPath("$.total").value(2)).andExpect(jsonPath("$.list[1].status").value(0));
        mvc.perform(put(path(f)+"/members/"+otherAdmin.getUserId()).header("Authorization",f.managerAuth()))
            .andExpect(jsonPath("$.code").value(10106));
        mvc.perform(put(path(f)+"/members/"+f.initialId()).header("Authorization",f.initialAuth()))
            .andExpect(jsonPath("$.code").value(12200));
        for (int i=0;i<2;i++) {
            mvc.perform(delete(memberPath).header("Authorization",f.managerAuth()))
                .andExpect(jsonPath("$.code").value(0)).andExpect(jsonPath("$.data.member").value(false));
        }
        mvc.perform(get(path(f)+"/members").header("Authorization",f.managerAuth()))
            .andExpect(jsonPath("$.total").value(1));
        mvc.perform(post("/api/console/user_groups").header("Authorization",f.managerAuth())
            .contentType(MediaType.APPLICATION_JSON).content("{\"groupName\":\"new\"}"))
            .andExpect(jsonPath("$.code").value(10106));
        mvc.perform(put(path(f)).header("Authorization",f.managerAuth())
            .contentType(MediaType.APPLICATION_JSON).content("{\"groupName\":\"changed\",\"companyId\":1}"))
            .andExpect(jsonPath("$.code").value(11000));
    }

    @Test
    void crossEnterpriseDirtyMembershipDoesNotWidenScopeOrCounts() throws Exception {
        Fixture f = fixture(891003L);
        Fixture foreign = fixture(891004L);
        UserGroupMemberDO dirty = new UserGroupMemberDO();
        dirty.setCompanyId(f.companyId()); dirty.setGroupId(f.groupId()); dirty.setUserId(foreign.managerId());
        members.save(dirty);
        mvc.perform(get(path(f)).header("Authorization",f.initialAuth()))
            .andExpect(jsonPath("$.data.memberCount").value(1));
        mvc.perform(get(path(f)+"/members").header("Authorization",f.initialAuth()))
            .andExpect(jsonPath("$.total").value(1));
        mvc.perform(get(path(f)).header("Authorization",foreign.managerAuth()))
            .andExpect(jsonPath("$.code").value(12100));
        mvc.perform(put(path(f)+"/members/"+foreign.managerId()).header("Authorization",f.initialAuth()))
            .andExpect(jsonPath("$.code").value(12100));
    }

    @Test
    void writeRechecksRoleAfterWaitingForCompanyLock() throws Exception {
        Fixture f = fixture(891005L);
        UserDO employee = employee(f.companyId(),"promoted",UserRoleEnum.USER);
        CountDownLatch locked = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        try (ExecutorService executor = Executors.newFixedThreadPool(2)) {
            Future<?> promotion = executor.submit(() -> new TransactionTemplate(transactionManager).executeWithoutResult(tx -> {
                companies.lambdaQuery().eq(CompanyDO::getCompanyId,f.companyId()).last("FOR UPDATE").one();
                users.lambdaUpdate().eq(UserDO::getUserId,employee.getUserId()).set(UserDO::getRole,UserRoleEnum.CONSOLE).update();
                locked.countDown();
                try { assertThat(release.await(10,TimeUnit.SECONDS)).isTrue(); }
                catch (InterruptedException e) { Thread.currentThread().interrupt(); throw new IllegalStateException(e); }
            }));
            assertThat(locked.await(10,TimeUnit.SECONDS)).isTrue();
            CountDownLatch requested = new CountDownLatch(1);
            Future<Integer> write = executor.submit(() -> {
                requested.countDown();
                String response = mvc.perform(put(path(f)+"/members/"+employee.getUserId()).header("Authorization",f.managerAuth()))
                    .andReturn().getResponse().getContentAsString();
                return json.readTree(response).get("code").asInt();
            });
            assertThat(requested.await(10,TimeUnit.SECONDS)).isTrue();
            assertThatThrownBy(() -> write.get(200,TimeUnit.MILLISECONDS)).isInstanceOf(TimeoutException.class);
            release.countDown();
            promotion.get(10,TimeUnit.SECONDS);
            assertThat(write.get(10,TimeUnit.SECONDS)).isEqualTo(10106);
        } finally { release.countDown(); }
        mvc.perform(get(path(f)+"/members").header("Authorization",f.initialAuth()))
            .andExpect(jsonPath("$.total").value(1));
    }

    @Test
    void writeRechecksManagementScopeAfterRevocation() throws Exception {
        Fixture f = fixture(891006L);
        UserDO employee = employee(f.companyId(),"employee",UserRoleEnum.USER);
        CountDownLatch locked = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        try (ExecutorService executor = Executors.newFixedThreadPool(2)) {
            Future<?> revoke = executor.submit(() -> new TransactionTemplate(transactionManager).executeWithoutResult(tx -> {
                companies.lambdaQuery().eq(CompanyDO::getCompanyId,f.companyId()).last("FOR UPDATE").one();
                UserGroupMemberDO relation = members.lambdaQuery().eq(UserGroupMemberDO::getCompanyId,f.companyId())
                    .eq(UserGroupMemberDO::getGroupId,f.groupId()).eq(UserGroupMemberDO::getUserId,f.managerId()).one();
                members.removeById(relation.getMemberId());
                locked.countDown();
                try { assertThat(release.await(10,TimeUnit.SECONDS)).isTrue(); }
                catch (InterruptedException e) { Thread.currentThread().interrupt(); throw new IllegalStateException(e); }
            }));
            assertThat(locked.await(10,TimeUnit.SECONDS)).isTrue();
            Future<Integer> write = executor.submit(() -> json.readTree(mvc.perform(
                put(path(f)+"/members/"+employee.getUserId()).header("Authorization",f.managerAuth()))
                .andReturn().getResponse().getContentAsString()).get("code").asInt());
            assertThatThrownBy(() -> write.get(200,TimeUnit.MILLISECONDS)).isInstanceOf(TimeoutException.class);
            release.countDown();
            revoke.get(10,TimeUnit.SECONDS);
            assertThat(write.get(10,TimeUnit.SECONDS)).isEqualTo(12100);
        } finally { release.countDown(); }
        mvc.perform(get(path(f)+"/members").header("Authorization",f.initialAuth()))
            .andExpect(jsonPath("$.total").value(0));
    }

    @Test
    void onlyCommittedRealMembershipChangesNotifyDesk() throws Exception {
        Fixture f = fixture(891007L);
        UserDO employee = employee(f.companyId(),"employee",UserRoleEnum.USER);
        long before = committedEvents.count(f.companyId());
        String memberPath = path(f)+"/members/"+employee.getUserId();
        new TransactionTemplate(transactionManager).executeWithoutResult(tx -> {
            try {
                mvc.perform(put(memberPath).header("Authorization",f.initialAuth()))
                    .andExpect(jsonPath("$.code").value(0));
                assertThat(committedEvents.count(f.companyId())).isEqualTo(before);
            } catch (Exception e) { throw new IllegalStateException(e); }
            tx.setRollbackOnly();
        });
        assertThat(committedEvents.count(f.companyId())).isEqualTo(before);
        mvc.perform(get(path(f)+"/members").header("Authorization",f.initialAuth()))
            .andExpect(jsonPath("$.total").value(1));
        for(int i=0;i<2;i++) {
            mvc.perform(put(memberPath).header("Authorization",f.initialAuth()))
                .andExpect(jsonPath("$.code").value(0));
            assertThat(committedEvents.count(f.companyId())).isEqualTo(before+1);
        }
        for(int i=0;i<2;i++) {
            mvc.perform(delete(memberPath).header("Authorization",f.initialAuth()))
                .andExpect(jsonPath("$.code").value(0));
            assertThat(committedEvents.count(f.companyId())).isEqualTo(before+2);
        }
    }

    private Fixture fixture(Long companyId) throws Exception {
        companies.createCompany(new CompanyCreateDTO(companyId.toString(),"测试企业",null,null,null,
            new CompanyAdminInitDTO("initial","password123",null)),1L);
        Long initialId = companies.getById(companyId).getInitUserId();
        UserDO manager = employee(companyId,"manager",UserRoleEnum.CONSOLE);
        String initialAuth = auth(companyId,initialId);
        String response = mvc.perform(post("/api/console/user_groups").header("Authorization",initialAuth)
            .contentType(MediaType.APPLICATION_JSON).content("{\"groupName\":\"组\"}"))
            .andExpect(jsonPath("$.code").value(0)).andReturn().getResponse().getContentAsString();
        Long groupId = Long.valueOf(json.readTree(response).at("/data/groupId").asText());
        mvc.perform(put("/api/console/user_groups/"+groupId+"/members/"+manager.getUserId()).header("Authorization",initialAuth))
            .andExpect(jsonPath("$.code").value(0));
        return new Fixture(companyId,initialId,groupId,manager.getUserId(),initialAuth,auth(companyId,manager.getUserId()));
    }

    private UserDO employee(Long companyId,String username,UserRoleEnum role) {
        UserDO user = users.createInitialAdmin(companyId,new CompanyAdminInitDTO(username,"password123",null));
        users.lambdaUpdate().eq(UserDO::getUserId,user.getUserId()).set(UserDO::getRole,role).update();
        return users.getById(user.getUserId());
    }

    private String auth(Long companyId,Long userId) {
        return "Bearer "+tokens.createToken(new JwtUser(companyId,userId,UserRoleEnum.CONSOLE,System.currentTimeMillis()/1000+3600));
    }

    private String path(Fixture fixture) { return "/api/console/user_groups/"+fixture.groupId(); }

    private record Fixture(Long companyId,Long initialId,Long groupId,Long managerId,String initialAuth,String managerAuth) { }

    @TestConfiguration
    static class EventConfiguration {
        @Bean CommittedEvents committedEvents() { return new CommittedEvents(); }
    }

    static class CommittedEvents {
        private final CopyOnWriteArrayList<Long> companies = new CopyOnWriteArrayList<>();

        @TransactionalEventListener
        public void committed(DeskAccessChangedEvent event) { companies.add(event.companyId()); }

        long count(Long companyId) { return companies.stream().filter(companyId::equals).count(); }
    }
}
