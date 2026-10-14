package com.dudu.duduserver;

import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.dudu.duduserver.channel.ChannelInboundMessage;
import com.dudu.duduserver.channel.wechatmp.WechatMpMediaReader;
import com.dudu.duduserver.channel.ChannelMediaResult;
import com.dudu.duduserver.constant.ChannelEnum;
import com.dudu.duduserver.constant.EnableStatusEnum;
import com.dudu.duduserver.constant.MessageDirectionEnum;
import com.dudu.duduserver.constant.UserRoleEnum;
import com.dudu.duduserver.dto.CompanyAdminInitDTO;
import com.dudu.duduserver.dto.CompanyCreateDTO;
import com.dudu.duduserver.entity.CompanyChannelDO;
import com.dudu.duduserver.entity.UserDO;
import com.dudu.duduserver.entity.UserGroupDO;
import com.dudu.duduserver.service.CompanyChannelService;
import com.dudu.duduserver.service.CompanyService;
import com.dudu.duduserver.service.DeskInboundService;
import com.dudu.duduserver.service.UserGroupService;
import com.dudu.duduserver.service.UserService;
import com.dudu.duduserver.testutil.IntegrationTestEnv;

import com.dudu.duduserver.util.PasswordHasher;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
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
import org.springframework.web.client.RestClient;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

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
 * 消息媒体读取接口在独立 MySQL 与真实 HTTP 边界验收：只按消息中已保存的引用读取，
 * 需渠道凭据的素材经渠道读取边界返回字节与内容类型；公开链接不被接口代理；
 * 同一消息多媒体的序号选择、索引与参数错误、消息不存在 / 越权 / 未授权员工、
 * 渠道不可读与渠道失败如实返回普通 R 错误。渠道读取用可控替身（成功/失败响应按
 * 公众号事实构造，不模拟假成功）。运行前需重建 dudu_review。
 */
@SpringBootTest(properties = {"dudu.auth.jwt-secret=integration-test-secret"},
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureMockMvc
@EnabledIfEnvironmentVariable(named = "DUDU_INTEGRATION_TEST", matches = "true")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class DeskMediaIntegrationTest {

    private static final String PASSWORD = "password123";
    private static final long COMPANY_ID = 793001L;
    private static final byte[] IMAGE_BYTES = "channel-image-bytes".getBytes(StandardCharsets.UTF_8);

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", IntegrationTestEnv::jdbcUrl);
        registry.add("spring.datasource.username", IntegrationTestEnv::dbUser);
        registry.add("spring.datasource.password", IntegrationTestEnv::dbPassword);
    }

    // 渠道素材读取替身：记录被读取的渠道标识，按构造好的公众号事实响应返回
    static class RecordingMediaReader extends WechatMpMediaReader {

        volatile Function<String, ChannelMediaResult> answer =
            id -> ChannelMediaResult.media(IMAGE_BYTES, "image/jpeg");
        final List<String> mediaIds = new CopyOnWriteArrayList<>();

        RecordingMediaReader() {
            // 替身不发起渠道请求：接口地址指向本机保留端口，误请求会以连接失败暴露
            super(RestClient.builder(), "http://127.0.0.1:9");
        }

        @Override
        public ChannelMediaResult read(CompanyChannelDO account, String externalMediaId) {
            mediaIds.add(externalMediaId);
            return answer.apply(externalMediaId);
        }
    }

    @TestConfiguration
    static class MediaConfig {

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
    @Autowired CompanyChannelService channels;
    @Autowired DeskInboundService deskInboundService;
    @Autowired RecordingMediaReader mediaReader;
    @Autowired JdbcTemplate jdbc;

    private long channelWechat;
    private long channelUnconfigured;
    private long channelDouyin;
    private String ownerToken;
    private String outsideToken;

    private long imageMessageId;
    private long publicUrlMessageId;
    private long replyMessageId;
    private long cardMessageId;
    private long douyinMessageId;
    private long unconfiguredMessageId;

    @BeforeAll
    void seed() throws Exception {
        companies.createCompany(new CompanyCreateDTO(String.valueOf(COMPANY_ID), "媒体验收企业", null, null, null,
            new CompanyAdminInitDTO("mediaowner", PASSWORD, null)), 1L);
        UserGroupDO group = group(COMPANY_ID, "媒体组");
        channelWechat = channel(COMPANY_ID, group.getGroupId(), ChannelEnum.WECHAT_MP, "媒体公众号",
            Map.of("token", "media-token", "appId", "wx_media_appid", "appSecret", "media-secret"));
        channelUnconfigured = channel(COMPANY_ID, group.getGroupId(), ChannelEnum.WECHAT_MP, "未配凭据公众号",
            Map.of("token", "media-token-2"));
        channelDouyin = channel(COMPANY_ID, group.getGroupId(), ChannelEnum.DOUYIN, "抖音号", Map.of("token", "x"));
        plainUser(COMPANY_ID, "media.outside");
        ownerToken = login("mediaowner");
        outsideToken = login("media.outside");

        imageMessageId = seedMessage(channelWechat, "media-ext-image",
            Map.of("type", "image", "media", Map.of("kind", "image", "id", "MEDIA_IMAGE")));
        publicUrlMessageId = seedMessage(channelWechat, "media-ext-public",
            Map.of("type", "image", "media", Map.of("kind", "image", "id", "MEDIA_PUBLIC",
                "url", "http://mmbiz.qpic.cn/public")));
        replyMessageId = seedMessage(channelWechat, "media-ext-reply",
            Map.of("type", "reply", "text", "附件回复", "attachments",
                List.of(Map.of("kind", "image", "id", "ATT_A"), Map.of("kind", "file", "id", "ATT_B"))));
        cardMessageId = seedMessage(channelWechat, "media-ext-card",
            Map.of("type", "card", "kind", "order", "title", "订单卡片"));
        douyinMessageId = seedMessage(channelDouyin, "media-ext-douyin",
            Map.of("type", "image", "media", Map.of("kind", "image", "id", "DY_MEDIA")));
        unconfiguredMessageId = seedMessage(channelUnconfigured, "media-ext-nocreds",
            Map.of("type", "image", "media", Map.of("kind", "image", "id", "NO_CRED_MEDIA")));
    }

    @BeforeEach
    void resetReader() {
        mediaReader.mediaIds.clear();
        mediaReader.answer = id -> ChannelMediaResult.media(IMAGE_BYTES, "image/jpeg");
    }

    @Test
    void servesCredentialMediaBytesByTheChannelIdentifier() throws Exception {
        MvcResult result = mvc.perform(get("/api/desk/messages/" + imageMessageId + "/media")
                .header("Authorization", "Bearer " + ownerToken))
            .andExpect(status().isOk()).andReturn();

        assertThat(result.getResponse().getContentAsByteArray()).isEqualTo(IMAGE_BYTES);
        assertThat(result.getResponse().getContentType()).isEqualTo("image/jpeg");
        assertThat(mediaReader.mediaIds).containsExactly("MEDIA_IMAGE");
    }

    @Test
    void defaultsTheIndexToTheFirstMediaAndSelectsReplyAttachmentsByIndex() throws Exception {
        mvc.perform(get("/api/desk/messages/" + replyMessageId + "/media?index=1")
                .header("Authorization", "Bearer " + ownerToken))
            .andExpect(status().isOk()).andReturn();
        assertThat(mediaReader.mediaIds).containsExactly("ATT_B");

        mediaReader.mediaIds.clear();
        mvc.perform(get("/api/desk/messages/" + replyMessageId + "/media?index=0")
                .header("Authorization", "Bearer " + ownerToken))
            .andExpect(status().isOk());
        assertThat(mediaReader.mediaIds).containsExactly("ATT_A");
    }

    @Test
    void neverProxiesPublicLinksOrReadsBeyondTheSavedReferences() throws Exception {
        // 公开链接不代理、也不占用渠道能力码 12200：按普通参数错误说明，由 Desk 直连渠道
        JSONObject publicUrl = errorOf(mvc.perform(get("/api/desk/messages/" + publicUrlMessageId + "/media")
            .header("Authorization", "Bearer " + ownerToken)).andReturn());
        assertThat(publicUrl.getInt("code")).isEqualTo(11000);
        assertThat(publicUrl.getStr("msg")).isEqualTo("该素材为公开链接，请直接使用其 URL");
        assertThat(mediaReader.mediaIds).isEmpty();

        JSONObject beyondIndex = errorOf(mvc.perform(get("/api/desk/messages/" + replyMessageId + "/media?index=2")
            .header("Authorization", "Bearer " + ownerToken)).andReturn());
        assertThat(beyondIndex.getInt("code")).isEqualTo(12100);

        JSONObject noMedia = errorOf(mvc.perform(get("/api/desk/messages/" + cardMessageId + "/media")
            .header("Authorization", "Bearer " + ownerToken)).andReturn());
        assertThat(noMedia.getInt("code")).isEqualTo(12100);
        assertThat(mediaReader.mediaIds).isEmpty();
    }

    @Test
    void rejectsUnknownMessagesBadIndexesAndUnauthorizedEmployeesWithContractCodes() throws Exception {
        JSONObject missing = errorOf(mvc.perform(get("/api/desk/messages/99999999/media")
            .header("Authorization", "Bearer " + ownerToken)).andReturn());
        assertThat(missing.getInt("code")).isEqualTo(12100);

        JSONObject malformedId = errorOf(mvc.perform(get("/api/desk/messages/abc/media")
            .header("Authorization", "Bearer " + ownerToken)).andReturn());
        assertThat(malformedId.getInt("code")).isEqualTo(11000);

        JSONObject badIndex = errorOf(mvc.perform(get("/api/desk/messages/" + imageMessageId + "/media?index=abc")
            .header("Authorization", "Bearer " + ownerToken)).andReturn());
        assertThat(badIndex.getInt("code")).isEqualTo(11000);
        JSONObject negativeIndex = errorOf(mvc.perform(
            get("/api/desk/messages/" + imageMessageId + "/media?index=-1")
                .header("Authorization", "Bearer " + ownerToken)).andReturn());
        assertThat(negativeIndex.getInt("code")).isEqualTo(11000);

        // 未授权员工与缺令牌都不得读到媒体字节
        JSONObject forbidden = errorOf(mvc.perform(get("/api/desk/messages/" + imageMessageId + "/media")
            .header("Authorization", "Bearer " + outsideToken)).andReturn());
        assertThat(forbidden.getInt("code")).isEqualTo(10106);
        JSONObject anonymous = errorOf(mvc.perform(get("/api/desk/messages/" + imageMessageId + "/media"))
            .andReturn());
        assertThat(anonymous.getInt("code")).isEqualTo(10101);
        assertThat(mediaReader.mediaIds).isEmpty();
    }

    @Test
    void reportsUnsupportedChannelsAndChannelFailuresAsOrdinaryRErrors() throws Exception {
        JSONObject douyin = errorOf(mvc.perform(get("/api/desk/messages/" + douyinMessageId + "/media")
            .header("Authorization", "Bearer " + ownerToken)).andReturn());
        assertThat(douyin.getInt("code")).isEqualTo(12200);
        assertThat(douyin.getStr("msg")).isEqualTo("当前渠道暂未接入素材读取");

        JSONObject unconfigured = errorOf(mvc.perform(
            get("/api/desk/messages/" + unconfiguredMessageId + "/media")
                .header("Authorization", "Bearer " + ownerToken)).andReturn());
        assertThat(unconfigured.getInt("code")).isEqualTo(12200);
        assertThat(unconfigured.getStr("msg")).isEqualTo("渠道素材凭据未配置");
        assertThat(mediaReader.mediaIds).isEmpty();

        // 渠道失败原样透传渠道说明，不冒成功也不伪装成空字节
        mediaReader.answer = id -> ChannelMediaResult.failed("微信素材读取失败：40007 invalid media_id");
        JSONObject failed = errorOf(mvc.perform(get("/api/desk/messages/" + imageMessageId + "/media")
            .header("Authorization", "Bearer " + ownerToken)).andReturn());
        assertThat(failed.getInt("code")).isEqualTo(13100);
        assertThat(failed.getStr("msg")).contains("40007").contains("invalid media_id");
        assertThat(mediaReader.mediaIds).containsExactly("MEDIA_IMAGE");
    }

    private long seedMessage(long channelId, String externalUserId, Map<String, Object> content) {
        CompanyChannelDO account = channels.getById(channelId);
        deskInboundService.accept(account, new ChannelInboundMessage(channelId, externalUserId,
            null, null, List.of(), "seed-" + externalUserId, MessageDirectionEnum.INCOMING, content));
        return jdbc.queryForObject("""
            SELECT m.message_id FROM message m JOIN visitor v ON v.visitor_id = m.visitor_id
            WHERE v.external_user_id = ? ORDER BY m.sequence DESC LIMIT 1
            """, Long.class, externalUserId);
    }

    private JSONObject errorOf(MvcResult result) throws Exception {
        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        JSONObject response = JSONUtil.parseObj(result.getResponse().getContentAsString());
        return response;
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
}
