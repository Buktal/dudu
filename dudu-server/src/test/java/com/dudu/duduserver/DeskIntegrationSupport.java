package com.dudu.duduserver;

import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.dudu.duduserver.config.auth.JwtManager;
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
import com.dudu.duduserver.util.PasswordHasher;
import org.junit.jupiter.api.AfterEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.time.Duration;
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
 * Desk 集成测试共享基类：真实 HTTP 与真实 WebSocket 边界的公共夹具（企业、组、账号、员工、
 * 登录、Socket 客户端与响应读取）。Spring 测试注解、@DynamicPropertySource 与各自的造数、
 * 断言留在子类；基类不注册上下文，子类注解按其验收范围各自声明。
 */
abstract class DeskIntegrationSupport {

    protected static final String PASSWORD = "password123";

    @LocalServerPort protected int port;
    @Autowired protected MockMvc mvc;
    @Autowired protected CompanyService companies;
    @Autowired protected UserService users;
    @Autowired protected UserGroupService groups;
    @Autowired protected UserGroupMemberService members;
    @Autowired protected CompanyChannelService channels;
    @Autowired protected JwtManager jwtManager;
    @Autowired protected JdbcTemplate jdbc;

    protected final List<WebSocketSession> openSessions = new ArrayList<>();

    @AfterEach
    void closeSockets() throws Exception {
        for (WebSocketSession session : openSessions) {
            if (session.isOpen()) {
                session.close(CloseStatus.NORMAL);
            }
        }
        openSessions.clear();
    }

    // 真实 WebSocket 连接：登记会话供用例结束统一关闭
    protected SocketClient connect() throws Exception {
        SocketClient client = new SocketClient();
        WebSocketSession session = new StandardWebSocketClient()
            .execute(client, "ws://127.0.0.1:" + port + "/ws/desk")
            .get(5, TimeUnit.SECONDS);
        openSessions.add(session);
        client.session = session;
        return client;
    }

    protected JSONObject sendAuth(SocketClient client, String token) throws Exception {
        client.session.sendMessage(new TextMessage(
            JSONUtil.createObj().set("type", "auth").set("token", token).toString()));
        return client.next(Duration.ofSeconds(5));
    }

    protected SocketClient connectAndAuth(String token) throws Exception {
        SocketClient client = connect();
        JSONObject ready = sendAuth(client, token);
        assertThat((Object) ready).isNotNull();
        assertThat(ready.getStr("type")).isEqualTo("ready");
        return client;
    }

    protected String login(long companyId, String username) throws Exception {
        String body = mvc.perform(post("/api/desk/login").contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"companyId": "%s", "username": "%s", "password": "%s"}
                    """.formatted(companyId, username, PASSWORD)))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        JSONObject data = JSONUtil.parseObj(body).getJSONObject("data");
        assertThat(data.getStr("token")).isNotBlank();
        return data.getStr("token");
    }

    protected CompanyCreateDTO company(long companyId, String adminUsername, String companyName) {
        return new CompanyCreateDTO(String.valueOf(companyId), companyName, null, null, null,
            new CompanyAdminInitDTO(adminUsername, PASSWORD, null));
    }

    protected UserGroupDO group(long companyId, String name) {
        UserGroupDO group = new UserGroupDO();
        group.setCompanyId(companyId);
        group.setGroupName(name);
        groups.save(group);
        return group;
    }

    protected long channel(long companyId, long groupId, ChannelEnum channel, String accountName,
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

    // 只配回调 token 的账号（渠道凭据缺失，用于权限与推送用例）
    protected long channel(long companyId, long groupId, ChannelEnum channel, String accountName, String token) {
        return channel(companyId, groupId, channel, accountName, Map.of("token", token));
    }

    protected UserDO plainUser(long companyId, String username) {
        return user(companyId, username, username, UserRoleEnum.USER);
    }

    protected UserDO plainUser(long companyId, String username, String name) {
        return user(companyId, username, name, UserRoleEnum.USER);
    }

    protected UserDO adminUser(long companyId, String username) {
        return user(companyId, username, username, UserRoleEnum.CONSOLE);
    }

    protected UserGroupMemberDO member(long companyId, long userId, long groupId) {
        UserGroupMemberDO member = new UserGroupMemberDO();
        member.setCompanyId(companyId);
        member.setUserId(userId);
        member.setGroupId(groupId);
        return member;
    }

    protected String deskGet(String token, String path) throws Exception {
        return mvc.perform(get(path).header("Authorization", "Bearer " + token))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
    }

    protected String deskPost(String token, String path, String json) throws Exception {
        return mvc.perform(post(path).header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON).content(json))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
    }

    protected String deskPut(String token, String path, String json) throws Exception {
        return mvc.perform(put(path).header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON).content(json))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
    }

    protected int code(String response) {
        return JSONUtil.parseObj(response).getInt("code");
    }

    protected List<String> accountIds(JSONObject access) {
        return access.getJSONArray("accounts").stream()
            .map(item -> ((JSONObject) item).getStr("companyChannelId")).toList();
    }

    protected JSONObject data(JSONObject response) {
        assertThat(response.getInt("code")).isZero();
        return response.getJSONObject("data");
    }

    private UserDO user(long companyId, String username, String name, UserRoleEnum role) {
        UserDO user = new UserDO();
        user.setCompanyId(companyId);
        user.setUsername(username);
        user.setName(name);
        user.setPasswordHash(PasswordHasher.hash(PASSWORD));
        user.setRole(role);
        user.setStatus(EnableStatusEnum.ENABLED);
        users.save(user);
        return user;
    }

    /**
     * 真实 WebSocket 客户端：异步收集服务端报文，供断言 ready / error 与推送帧。
     */
    protected static final class SocketClient extends TextWebSocketHandler {

        private final BlockingQueue<JSONObject> frames = new LinkedBlockingQueue<>();
        protected final CountDownLatch closed = new CountDownLatch(1);
        protected WebSocketSession session;

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
