package com.dudu.duduserver.channel.feishu;

import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.dudu.duduserver.channel.ChannelInboundMessage;
import com.dudu.duduserver.channel.ChannelMediaResult;
import com.dudu.duduserver.channel.ChannelSendResult;
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
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.web.client.RestClient;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.function.Function;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 飞书渠道在独立 MySQL 与真实 HTTP 边界验收（事实见 docs/research/channels/feishu.md，
 * mock-pulse 握手/直发剧本同构）：url_verification 握手回显与拒绝、未配凭据不支持、
 * 消息事件落库与只应答事件、回复发送成功带渠道消息标识与渠道失败如实落库、
 * 素材按复合标识读取与凭据限制如实返回。发送与素材读取用可控替身（不模拟假成功）。
 * 运行前需重建 dudu_review；回调报文走真实控制器，发送与素材不外呼。
 */
@SpringBootTest(properties = {"dudu.auth.jwt-secret=integration-test-secret"},
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureMockMvc
@EnabledIfEnvironmentVariable(named = "DUDU_INTEGRATION_TEST", matches = "true")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class FeishuChannelIntegrationTest {

    private static final String PASSWORD = "password123";
    private static final long COMPANY_ID = 789101L;
    // 官方 §5.4 样本身份与 mock-pulse 黄金向量
    private static final String TOKEN = "rvaYgkND1GOiu5MM0E1rncYC6PLtF7JV";
    private static final String CHALLENGE = "ajls384kdjxxxx";
    private static final String OPEN_ID = "ou_84aad35d084aa403a838cf73ee18467";
    private static final String MESSAGE_ID = "om_5ce6d572455d361153b7cb51da133945";
    private static final byte[] IMAGE_BYTES = "feishu-image-bytes".getBytes(StandardCharsets.UTF_8);

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> System.getenv("DUDU_TEST_JDBC_URL"));
        // 评审账号可用 DUDU_TEST_DB_USER 覆盖，默认与既有集成基建一致
        registry.add("spring.datasource.username",
            () -> System.getenv().getOrDefault("DUDU_TEST_DB_USER", "root"));
        registry.add("spring.datasource.password", () -> System.getenv("DUDU_TEST_DB_PASSWORD"));
    }

    // 渠道发送替身：按构造好的飞书事实响应返回，可观察调用时的持久状态
    static class RecordingSender extends FeishuTextSender {

        volatile Function<String, ChannelSendResult> answer = text -> ChannelSendResult.sent("om_sent_default");

        RecordingSender() {
            // 替身不发起渠道请求：接口地址指向本机保留端口，误请求会以连接失败暴露
            super(RestClient.builder(), "http://127.0.0.1:9");
        }

        @Override
        public ChannelSendResult send(CompanyChannelDO account, String externalUserId, String text) {
            return answer.apply(text);
        }
    }

    // 渠道素材读取替身：记录被读取的复合标识，按构造好的飞书事实响应返回
    static class RecordingMediaReader extends FeishuMediaReader {

        volatile Function<String, ChannelMediaResult> answer =
            id -> ChannelMediaResult.media(IMAGE_BYTES, "image/png");
        final List<String> mediaIds = new CopyOnWriteArrayList<>();

        RecordingMediaReader() {
            super(RestClient.builder(), "http://127.0.0.1:9");
        }

        @Override
        public ChannelMediaResult read(CompanyChannelDO account, String externalMediaId) {
            mediaIds.add(externalMediaId);
            return answer.apply(externalMediaId);
        }
    }

    @TestConfiguration
    static class ChannelConfig {

        @Bean
        @Primary
        RecordingSender recordingSender() {
            return new RecordingSender();
        }

        @Bean
        @Primary
        RecordingMediaReader recordingMediaReader() {
            return new RecordingMediaReader();
        }
    }

    @Autowired MockMvc mvc;
    @Autowired CompanyService companies;
    @Autowired UserService users;
    @Autowired UserGroupService groups;
    @Autowired UserGroupMemberService members;
    @Autowired CompanyChannelService channels;
    @Autowired DeskInboundService deskInboundService;
    @Autowired RecordingSender sender;
    @Autowired RecordingMediaReader mediaReader;
    @Autowired JdbcTemplate jdbc;

    private long channelFeishu;
    private long channelUnconfigured;
    private String ownerToken;
    private String scopedToken;

    @BeforeAll
    void seed() throws Exception {
        companies.createCompany(company(COMPANY_ID, "feishuowner", "飞书验收企业"), 1L);
        UserGroupDO group = group(COMPANY_ID, "飞书组");
        channelFeishu = channel(COMPANY_ID, group.getGroupId(), ChannelEnum.FEISHU, "飞书机器人", Map.of(
            "appId", "cli_9f5343c580712544",
            "appSecret", "dskLLdkasdjlasdKK",
            "verificationToken", TOKEN));
        // 缺 appId/appSecret：凭据未配置，回调不支持、发送与素材受限
        channelUnconfigured = channel(COMPANY_ID, group.getGroupId(), ChannelEnum.FEISHU, "未配凭据飞书",
            Map.of("verificationToken", TOKEN));
        UserDO scoped = plainUser(COMPANY_ID, "feishu.scoped", "坐席甲");
        members.save(member(COMPANY_ID, scoped.getUserId(), group.getGroupId()));
        ownerToken = login("feishuowner");
        scopedToken = login("feishu.scoped");
    }

    @AfterEach
    void resetStubs() {
        sender.answer = text -> ChannelSendResult.sent("om_sent_default");
        mediaReader.answer = id -> ChannelMediaResult.media(IMAGE_BYTES, "image/png");
        mediaReader.mediaIds.clear();
    }

    @Test
    void handshakeEchoesChallengeAndRejectsWrongTokenOrMissingCredentials() throws Exception {
        String handshake = JSONUtil.createObj()
            .set("challenge", CHALLENGE).set("token", TOKEN).set("type", "url_verification").toString();
        MvcResult echoed = mvc.perform(post("/api/channels/" + channelFeishu + "/callback")
                .contentType(MediaType.APPLICATION_JSON).content(handshake))
            .andExpect(status().isOk()).andReturn();
        assertThat(echoed.getResponse().getContentAsString())
            .isEqualTo("{\"challenge\":\"" + CHALLENGE + "\"}");

        // token 与 verificationToken 不符按拒绝
        MvcResult tampered = mvc.perform(post("/api/channels/" + channelFeishu + "/callback")
                .contentType(MediaType.APPLICATION_JSON).content(handshake.replace(TOKEN, "wrong-token")))
            .andReturn();
        assertThat(tampered.getResponse().getStatus()).isEqualTo(403);

        // 必填凭据缺失的账号按不支持（协议未接入该账号）
        MvcResult unconfigured = mvc.perform(post("/api/channels/" + channelUnconfigured + "/callback")
                .contentType(MediaType.APPLICATION_JSON).content(handshake))
            .andReturn();
        assertThat(unconfigured.getResponse().getStatus()).isEqualTo(501);
    }

    @Test
    void messageEventLandsAsVisitorMessageAndOtherEventsOnlyAcknowledge() throws Exception {
        MvcResult pushed = mvc.perform(post("/api/channels/" + channelFeishu + "/callback")
                .contentType(MediaType.APPLICATION_JSON).content(textEvent("hello")))
            .andExpect(status().isOk()).andReturn();
        assertThat(pushed.getResponse().getContentAsString()).isEqualTo("success");

        Map<String, Object> message = jdbc.queryForMap("""
            SELECT m.direction, m.send_status, m.external_message_id, m.content
            FROM message m JOIN visitor v ON v.visitor_id = m.visitor_id
            WHERE v.external_user_id = ? AND v.company_channel_id = ?
            """, OPEN_ID, channelFeishu);
        assertThat(message.get("direction")).isEqualTo("incoming");
        assertThat(message.get("send_status")).isNull();
        assertThat(message.get("external_message_id")).isEqualTo(MESSAGE_ID);
        assertThat(message.get("content").toString()).contains("\"type\": \"text\"").contains("hello");

        // 已读等无可落库事件只应答：消息数不变
        int before = jdbc.queryForObject(
            "SELECT COUNT(*) FROM message m JOIN visitor v ON v.visitor_id = m.visitor_id WHERE v.external_user_id = ?",
            Integer.class, OPEN_ID);
        mvc.perform(post("/api/channels/" + channelFeishu + "/callback")
                .contentType(MediaType.APPLICATION_JSON).content(readEvent()))
            .andExpect(status().isOk());
        assertThat(jdbc.queryForObject(
            "SELECT COUNT(*) FROM message m JOIN visitor v ON v.visitor_id = m.visitor_id WHERE v.external_user_id = ?",
            Integer.class, OPEN_ID)).isEqualTo(before);
    }

    @Test
    void replySendKeepsTheChannelMessageIdAndFailureKeepsTheRealReason() throws Exception {
        long visitorId = newVisitor(channelFeishu, "feishu-reply-ext", "想咨询发货时间");

        sender.answer = text -> ChannelSendResult.sent("om_6740c818900c4b0bbfbc20868a6773bc");
        JSONObject sent = data(mvc.perform(post("/api/desk/visitors/" + visitorId + "/messages")
                .header("Authorization", "Bearer " + scopedToken)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"clientRequestId\": \"cr-feishu-1\", \"text\": \"好的，今天发出\"}"))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertThat(sent.getJSONObject("delivery").getStr("state")).isEqualTo("sent");
        Map<String, Object> saved = jdbc.queryForMap(
            "SELECT send_status, external_message_id, failure_reason FROM message WHERE visitor_id = ? AND sequence = 2",
            visitorId);
        assertThat(saved.get("send_status")).isEqualTo("sent");
        assertThat(saved.get("external_message_id")).isEqualTo("om_6740c818900c4b0bbfbc20868a6773bc");
        assertThat(saved.get("failure_reason")).isNull();

        // 渠道失败原样落库真实原因，不冒成功
        sender.answer = text -> ChannelSendResult.failed("飞书消息发送失败：230020 The message frequency is too high");
        JSONObject failed = data(mvc.perform(post("/api/desk/visitors/" + visitorId + "/messages")
                .header("Authorization", "Bearer " + scopedToken)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"clientRequestId\": \"cr-feishu-2\", \"text\": \"稍等\"}"))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertThat(failed.getJSONObject("delivery").getStr("state")).isEqualTo("failed");
        assertThat(failed.getJSONObject("delivery").getStr("reason"))
            .isEqualTo("飞书消息发送失败：230020 The message frequency is too high");
        Map<String, Object> failedRow = jdbc.queryForMap(
            "SELECT send_status, failure_reason FROM message WHERE visitor_id = ? AND sequence = 3", visitorId);
        assertThat(failedRow.get("send_status")).isEqualTo("failed");
        assertThat(failedRow.get("failure_reason"))
            .isEqualTo("飞书消息发送失败：230020 The message frequency is too high");
    }

    @Test
    void capabilityAndMediaFollowTheConfiguredCredentials() throws Exception {
        long mediaMessageId = seedMessage(channelFeishu, "feishu-media-ext",
            Map.of("type", "image", "media", Map.of("kind", "image", "id", MESSAGE_ID + ":file_v2_47f38a2d:image")));
        long unconfiguredVisitor = newVisitor(channelUnconfigured, "feishu-nocreds-ext", "无凭据来信");

        // 素材按协议层复合标识传给渠道读取边界
        MvcResult media = mvc.perform(get("/api/desk/messages/" + mediaMessageId + "/media")
                .header("Authorization", "Bearer " + ownerToken))
            .andExpect(status().isOk()).andReturn();
        assertThat(media.getResponse().getContentAsByteArray()).isEqualTo(IMAGE_BYTES);
        assertThat(media.getResponse().getContentType()).isEqualTo("image/png");
        assertThat(mediaReader.mediaIds).containsExactly(MESSAGE_ID + ":file_v2_47f38a2d:image");

        // 渠道失败原样透出渠道说明，不冒成功也不伪装成空字节
        mediaReader.answer = id -> ChannelMediaResult.failed("飞书素材读取失败：230110 has no media permission");
        JSONObject failed = errorOf(mvc.perform(get("/api/desk/messages/" + mediaMessageId + "/media")
                .header("Authorization", "Bearer " + ownerToken))
            .andReturn());
        assertThat(failed.getInt("code")).isEqualTo(13100);
        assertThat(failed.getStr("msg")).contains("230110").contains("has no media permission");

        // 凭据缺失：能力如实受限，媒体读取与发送都不调用渠道
        JSONObject capability = capability(unconfiguredVisitor);
        assertThat(capability.getStr("state")).isEqualTo("restricted");
        assertThat(capability.getStr("reason")).isEqualTo("渠道发送凭据未配置");
        JSONObject unconfiguredMedia = errorOf(mvc.perform(get("/api/desk/messages/"
                + seedMessage(channelUnconfigured, "feishu-nocreds-media",
                    Map.of("type", "image", "media", Map.of("kind", "image", "id", MESSAGE_ID + ":k:image")))
                + "/media")
            .header("Authorization", "Bearer " + ownerToken)).andReturn());
        assertThat(unconfiguredMedia.getInt("code")).isEqualTo(12200);
        assertThat(unconfiguredMedia.getStr("msg")).isEqualTo("渠道素材凭据未配置");
        JSONObject rejected = JSONUtil.parseObj(mvc.perform(post("/api/desk/visitors/" + unconfiguredVisitor
                    + "/messages").header("Authorization", "Bearer " + scopedToken)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"clientRequestId\": \"cr-feishu-x\", \"text\": \"不可发\"}"))
            .andReturn().getResponse().getContentAsString());
        assertThat(rejected.getInt("code")).isEqualTo(12200);
        assertThat(rejected.getStr("msg")).isEqualTo("渠道发送凭据未配置");

        // 配齐凭据的账号能力 allowed 且只支持文本
        JSONObject allowed = capability(newVisitor(channelFeishu, "feishu-cap-ext", "能力来信"));
        assertThat(allowed.getStr("state")).isEqualTo("allowed");
        assertThat(allowed.getJSONArray("kinds")).containsExactly("text");
    }

    // ---- 夹具 ----

    // 官方 §5.4 事件样本的 text 事件形状（身份与标识取黄金向量）
    private String textEvent(String text) {
        return event(JSONUtil.createObj()
            .set("sender", JSONUtil.createObj().set("sender_id", JSONUtil.createObj().set("open_id", OPEN_ID)))
            .set("message", JSONUtil.createObj()
                .set("message_id", MESSAGE_ID)
                .set("message_type", "text")
                .set("content", JSONUtil.createObj().set("text", text).toString()))
            .toString());
    }

    // 无 message 的已读事件形状（只应答不落库）
    private String readEvent() {
        return event(JSONUtil.createObj()
            .set("reader", JSONUtil.createObj().set("reader_id", JSONUtil.createObj()
                .set("open_id", OPEN_ID)))
            .toString());
    }

    private String event(String eventJson) {
        return JSONUtil.createObj()
            .set("schema", "2.0")
            .set("header", JSONUtil.createObj()
                .set("event_type", "im.message.receive_v1")
                .set("token", TOKEN))
            .set("event", JSONUtil.parseObj(eventJson))
            .toString();
    }

    private long newVisitor(long channelId, String externalUserId, String firstText) {
        deskInboundService.accept(channels.getById(channelId), new ChannelInboundMessage(channelId, externalUserId,
            null, null, List.of(), "seed-" + externalUserId, MessageDirectionEnum.INCOMING,
            Map.of("type", "text", "text", firstText)));
        return jdbc.queryForObject(
            "SELECT visitor_id FROM visitor WHERE company_id = ? AND company_channel_id = ? AND external_user_id = ?",
            Long.class, COMPANY_ID, channelId, externalUserId);
    }

    private long seedMessage(long channelId, String externalUserId, Map<String, Object> content) {
        deskInboundService.accept(channels.getById(channelId), new ChannelInboundMessage(channelId, externalUserId,
            null, null, List.of(), "seed-" + externalUserId, MessageDirectionEnum.INCOMING, content));
        return jdbc.queryForObject("""
            SELECT m.message_id FROM message m JOIN visitor v ON v.visitor_id = m.visitor_id
            WHERE v.external_user_id = ? ORDER BY m.sequence DESC LIMIT 1
            """, Long.class, externalUserId);
    }

    private JSONObject capability(long visitorId) throws Exception {
        return data(mvc.perform(get("/api/desk/visitors/" + visitorId + "/capability")
                .header("Authorization", "Bearer " + ownerToken))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }

    private JSONObject errorOf(MvcResult result) throws Exception {
        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        return JSONUtil.parseObj(result.getResponse().getContentAsString());
    }

    private JSONObject data(String response) {
        JSONObject json = JSONUtil.parseObj(response);
        assertThat(json.getInt("code")).isZero();
        return json.getJSONObject("data");
    }

    private CompanyCreateDTO company(long companyId, String adminUsername, String companyName) {
        return new CompanyCreateDTO(String.valueOf(companyId), companyName, null, null, null,
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

    private String login(String username) throws Exception {
        String body = mvc.perform(post("/api/desk/login").contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"companyId": "%s", "username": "%s", "password": "%s"}
                    """.formatted(COMPANY_ID, username, PASSWORD)))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        JSONObject data = JSONUtil.parseObj(body).getJSONObject("data");
        assertThat(data.getStr("token")).isNotBlank();
        return data.getStr("token");
    }
}
