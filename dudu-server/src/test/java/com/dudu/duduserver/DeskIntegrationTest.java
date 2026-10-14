package com.dudu.duduserver;

import cn.hutool.core.date.DateUtil;
import cn.hutool.json.JSONArray;
import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.dudu.duduserver.config.auth.JwtManager;
import com.dudu.duduserver.config.auth.JwtUser;
import com.dudu.duduserver.constant.ChannelEnum;
import com.dudu.duduserver.constant.EnableStatusEnum;
import com.dudu.duduserver.constant.UserRoleEnum;
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
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 企业登录在独立 MySQL 的真实 HTTP 边界验收：跨企业同名登录、初始管理员全组、
 * 成员范围与脏关联剔除、错误码、停用与平台身份拒绝；通过环境变量显式启用，不使用开发库。
 */
@SpringBootTest(properties = {"dudu.auth.jwt-secret=integration-test-secret"})
@AutoConfigureMockMvc
@EnabledIfEnvironmentVariable(named = "DUDU_INTEGRATION_TEST", matches = "true")
class DeskIntegrationTest {

    private static final String PASSWORD = "password123";

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
    @Autowired JwtManager jwtManager;

    @Test
    void crossCompanySameLoginNameLandsInItsOwnCompany() throws Exception {
        companies.createCompany(company("783201", "boss"), 1L);
        companies.createCompany(company("783202", "boss"), 1L);

        JSONObject first = deskLogin("783201", "boss", PASSWORD);
        JSONObject second = deskLogin("783202", "boss", PASSWORD);

        assertThat(code(first)).isZero();
        assertThat(code(second)).isZero();
        JSONObject firstData = first.getJSONObject("data");
        JSONObject secondData = second.getJSONObject("data");
        assertThat(firstData.keySet()).containsExactlyInAnyOrder("token", "exp", "user", "company", "access");
        assertThat(firstData.getJSONObject("company").keySet()).containsExactlyInAnyOrder("companyId", "companyName");
        assertThat(firstData.getJSONObject("user").keySet()).containsExactlyInAnyOrder("userId", "username", "name", "role");
        assertThat(dataCompanyId(firstData)).isEqualTo("783201");
        assertThat(dataCompanyId(secondData)).isEqualTo("783202");
        assertThat(firstData.getJSONObject("company").getStr("companyName")).isEqualTo("Desk 验收企业");
        assertThat(firstData.getJSONObject("user").getStr("userId"))
            .isNotEqualTo(secondData.getJSONObject("user").getStr("userId"));
        assertThat(firstData.getStr("token")).isNotEqualTo(secondData.getStr("token"));
        assertThat(firstData.getStr("exp")).isNotBlank();

        // 企业 ID 参与身份定位：换企业后的同一账号必须仍落在已认证企业
        String firstToken = firstData.getStr("token");
        assertThat(deskProfile(firstToken).getJSONObject("data").getJSONObject("company").getStr("companyId"))
            .isEqualTo("783201");
        // 错误企业的同一登录名与错误密码都统一按认证失败处理
        assertThat(code(deskLogin("783201", "boss", "wrong-password"))).isEqualTo(10104);
    }

    @Test
    void initialAdminOwnsEveryGroupIncludingCreatedLater() throws Exception {
        companies.createCompany(company("783203", "owner"), 1L);
        companies.createCompany(company("783204", "other"), 1L);
        UserGroupDO first = group(783203L, "售前");
        UserGroupDO second = group(783203L, "售后");
        group(783204L, "外部组");

        JSONObject login = deskLogin("783203", "owner", PASSWORD);
        assertThat(code(login)).isZero();
        String token = login.getJSONObject("data").getStr("token");
        JSONObject access = access(login.getJSONObject("data"));
        assertThat(access.getBool("allGroups")).isTrue();
        assertThat(access.keySet()).containsExactlyInAnyOrder("allGroups", "groups", "accounts");
        assertThat(groupIds(access.getJSONArray("groups")))
            .containsExactly(String.valueOf(first.getGroupId()), String.valueOf(second.getGroupId()));

        // 新建组在下次身份读取时出现：授权范围每次实时查询，不写进 token
        UserGroupDO third = group(783203L, "新组");
        JSONObject restored = access(deskProfile(token).getJSONObject("data"));
        assertThat(restored.getBool("allGroups")).isTrue();
        assertThat(groupIds(restored.getJSONArray("groups"))).containsExactly(
            String.valueOf(first.getGroupId()), String.valueOf(second.getGroupId()), String.valueOf(third.getGroupId()));
    }

    @Test
    void membersSeeOnlyTheirGroupsAndCompanyAccounts() throws Exception {
        companies.createCompany(company("783205", "owner"), 1L);
        companies.createCompany(company("783206", "outsider"), 1L);
        UserGroupDO mine = group(783205L, "自有组");
        UserGroupDO other = group(783205L, "他组");
        UserGroupDO foreign = group(783206L, "外部企业组");
        CompanyChannelDO mineChannel = channel(783205L, mine.getGroupId(), ChannelEnum.WECHAT_MP, "公众号");
        CompanyChannelDO otherChannel = channel(783205L, other.getGroupId(), ChannelEnum.ALIPAY, "生活号");
        // 无外键也放行的脏关联：账号记录挂在其他企业的组上，不能进入任何授权范围
        channel(783205L, foreign.getGroupId(), ChannelEnum.DOUYIN, "脏账号");

        UserDO manager = users.createInitialAdmin(783205L, new CompanyAdminInitDTO("manager", PASSWORD, null));
        JSONObject empty = access(deskLogin("783205", "manager", PASSWORD).getJSONObject("data"));
        assertThat(empty.getBool("allGroups")).isFalse();
        assertThat(empty.getJSONArray("groups")).isEmpty();
        assertThat(empty.getJSONArray("accounts")).isEmpty();

        members.save(member(783205L, manager.getUserId(), mine.getGroupId()));
        // 脏成员关系：成员行声明本企业员工属于其他企业的组，同样不能放行
        members.save(member(783205L, manager.getUserId(), foreign.getGroupId()));
        JSONObject scoped = access(deskLogin("783205", "manager", PASSWORD).getJSONObject("data"));
        assertThat(scoped.getBool("allGroups")).isFalse();
        assertThat(groupIds(scoped.getJSONArray("groups"))).containsExactly(String.valueOf(mine.getGroupId()));
        assertThat(accountIds(scoped.getJSONArray("accounts")))
            .containsExactly(String.valueOf(mineChannel.getCompanyChannelId()));
        assertThat(accountIds(scoped.getJSONArray("accounts")))
            .doesNotContain(String.valueOf(otherChannel.getCompanyChannelId()));
        JSONObject account = scoped.getJSONArray("accounts").getJSONObject(0);
        assertThat(account.keySet())
            .containsExactlyInAnyOrder("companyChannelId", "groupId", "channel", "accountName");
        assertThat(account.getStr("groupId")).isEqualTo(String.valueOf(mine.getGroupId()));
        assertThat(account.getStr("channel")).isEqualTo("wechat-mp");
        assertThat(account.getStr("accountName")).isEqualTo("公众号");

        UserDO agent = plainUser(783205L, "agent.one");
        members.save(member(783205L, agent.getUserId(), other.getGroupId()));
        JSONObject agentAccess = access(deskLogin("783205", "agent.one", PASSWORD).getJSONObject("data"));
        assertThat(agentAccess.getBool("allGroups")).isFalse();
        assertThat(groupIds(agentAccess.getJSONArray("groups"))).containsExactly(String.valueOf(other.getGroupId()));
        assertThat(accountIds(agentAccess.getJSONArray("accounts")))
            .containsExactly(String.valueOf(otherChannel.getCompanyChannelId()));

        // 初始管理员看到本企业全部组的账号，但脏账号与跨企业账号始终不出现
        JSONObject ownerAccess = access(deskLogin("783205", "owner", PASSWORD).getJSONObject("data"));
        assertThat(groupIds(ownerAccess.getJSONArray("groups"))).containsExactly(
            String.valueOf(mine.getGroupId()), String.valueOf(other.getGroupId()));
        assertThat(accountIds(ownerAccess.getJSONArray("accounts"))).containsExactly(
            String.valueOf(mineChannel.getCompanyChannelId()),
            String.valueOf(otherChannel.getCompanyChannelId()));
    }

    @Test
    void deskLoginAndProfileUseTypedCodesForUnusableIdentity() throws Exception {
        companies.createCompany(company("783207", "boss"), 1L);
        UserDO leaver = users.createInitialAdmin(783207L, new CompanyAdminInitDTO("leaver", PASSWORD, null));

        assertThat(code(deskLogin("783207", "nobody", PASSWORD))).isEqualTo(10104);
        assertThat(code(deskLogin("783207", "boss", "wrong-password"))).isEqualTo(10104);
        assertThat(code(deskLogin("783299", "boss", PASSWORD))).isEqualTo(10104);
        // 平台身份不能作为企业坐席登录，企业入口也不能替平台账号定位身份
        assertThat(code(deskLogin("783207", "Admin", "admin"))).isEqualTo(10104);

        disableUser(leaver.getUserId());
        assertThat(code(deskLogin("783207", "leaver", PASSWORD))).isEqualTo(10104);

        String token = deskLogin("783207", "boss", PASSWORD).getJSONObject("data").getStr("token");
        companies.disable("783207", "暂停服务", 1L);

        assertThat(code(deskLogin("783207", "boss", PASSWORD))).isEqualTo(10104);
        // 已签发令牌在员工或企业停用后按无效登录处理
        assertThat(code(deskProfile(token))).isEqualTo(10102);
    }

    @Test
    void platformIdentityIsForbiddenAndLogoutStaysStateless() throws Exception {
        companies.createCompany(company("783208", "boss"), 1L);
        String token = deskLogin("783208", "boss", PASSWORD).getJSONObject("data").getStr("token");

        mvc.perform(post("/api/desk/logout").header("Authorization", "Bearer " + token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.code").value(0))
            .andExpect(jsonPath("$.data").doesNotExist());
        // 不写撤销记录：同一 token 仍可读取身份
        mvc.perform(get("/api/desk/profile").header("Authorization", "Bearer " + token))
            .andExpect(jsonPath("$.code").value(0));

        // 平台身份访问 Desk 资源统一无访问权限
        String platformToken = platformLogin();
        mvc.perform(get("/api/desk/profile").header("Authorization", "Bearer " + platformToken))
            .andExpect(jsonPath("$.code").value(10106));
        mvc.perform(post("/api/desk/logout").header("Authorization", "Bearer " + platformToken))
            .andExpect(jsonPath("$.code").value(10106));

        // 缺失、无效、过期令牌沿用 10100–10103，参数问题沿用 11000
        mvc.perform(get("/api/desk/profile")).andExpect(jsonPath("$.code").value(10101));
        mvc.perform(get("/api/desk/profile").header("Authorization", "Bearer not-a-jwt"))
            .andExpect(jsonPath("$.code").value(10102));
        long initUserId = companies.getById(783208L).getInitUserId();
        String expired = jwtManager.createToken(new JwtUser(783208L, initUserId,
            UserRoleEnum.CONSOLE, DateUtil.currentSeconds() - 10));
        mvc.perform(get("/api/desk/profile").header("Authorization", "Bearer " + expired))
            .andExpect(jsonPath("$.code").value(10103));
        // 伪造企业归属或员工 ID 都不能改变已认证身份
        String forgedCompany = jwtManager.createToken(new JwtUser(783299L, initUserId,
            UserRoleEnum.CONSOLE, DateUtil.currentSeconds() + 3600));
        mvc.perform(get("/api/desk/profile").header("Authorization", "Bearer " + forgedCompany))
            .andExpect(jsonPath("$.code").value(10102));
        String forgedUser = jwtManager.createToken(new JwtUser(783208L, 99999999L,
            UserRoleEnum.CONSOLE, DateUtil.currentSeconds() + 3600));
        mvc.perform(get("/api/desk/profile").header("Authorization", "Bearer " + forgedUser))
            .andExpect(jsonPath("$.code").value(10102));
        mvc.perform(post("/api/desk/login").contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(jsonPath("$.code").value(11000));
    }

    private int code(JSONObject response) {
        return response.getInt("code");
    }

    private JSONObject deskLogin(String companyId, String username, String password) throws Exception {
        String body = mvc.perform(post("/api/desk/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"companyId": "%s", "username": "%s", "password": "%s"}
                    """.formatted(companyId, username, password)))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        return JSONUtil.parseObj(body);
    }

    private JSONObject deskProfile(String token) throws Exception {
        String body = mvc.perform(get("/api/desk/profile").header("Authorization", "Bearer " + token))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        return JSONUtil.parseObj(body);
    }

    private JSONObject access(JSONObject data) {
        return data.getJSONObject("access");
    }

    private String dataCompanyId(JSONObject data) {
        return data.getJSONObject("company").getStr("companyId");
    }

    private List<String> groupIds(JSONArray groups) {
        return groups.stream().map(item -> ((JSONObject) item).getStr("groupId")).toList();
    }

    private List<String> accountIds(JSONArray accounts) {
        return accounts.stream().map(item -> ((JSONObject) item).getStr("companyChannelId")).toList();
    }

    private String platformLogin() throws Exception {
        String body = mvc.perform(post("/api/admin/login").contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"username": "Admin", "password": "admin"}
                    """))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        return JSONUtil.parseObj(body).getJSONObject("data").getStr("token");
    }

    private void disableUser(Long userId) {
        UserDO patch = new UserDO();
        patch.setUserId(userId);
        patch.setStatus(EnableStatusEnum.DISABLED);
        users.updateById(patch);
    }

    private CompanyCreateDTO company(String id, String adminUsername) {
        return new CompanyCreateDTO(id, "Desk 验收企业", null, null, null,
            new CompanyAdminInitDTO(adminUsername, PASSWORD, null));
    }

    private UserDO plainUser(Long companyId, String username) {
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

    private UserGroupDO group(Long companyId, String name) {
        UserGroupDO group = new UserGroupDO();
        group.setCompanyId(companyId);
        group.setGroupName(name);
        groups.save(group);
        return group;
    }

    private UserGroupMemberDO member(Long companyId, Long userId, Long groupId) {
        UserGroupMemberDO member = new UserGroupMemberDO();
        member.setCompanyId(companyId);
        member.setUserId(userId);
        member.setGroupId(groupId);
        return member;
    }

    private CompanyChannelDO channel(Long companyId, Long groupId, ChannelEnum channel, String accountName) {
        CompanyChannelDO account = new CompanyChannelDO();
        account.setCompanyId(companyId);
        account.setGroupId(groupId);
        account.setChannel(channel);
        account.setAccountName(accountName);
        channels.save(account);
        return account;
    }
}
