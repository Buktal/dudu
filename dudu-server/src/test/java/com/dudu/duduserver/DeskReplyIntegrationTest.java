package com.dudu.duduserver;

import cn.hutool.core.date.DateUtil;
import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.dudu.duduserver.channel.ChannelInboundMessage;
import com.dudu.duduserver.channel.ChannelSendResult;
import com.dudu.duduserver.channel.wechatmp.WechatMpTextSender;
import com.dudu.duduserver.config.auth.JwtManager;
import com.dudu.duduserver.config.auth.JwtUser;
import com.dudu.duduserver.constant.ChannelEnum;
import com.dudu.duduserver.constant.MessageDirectionEnum;
import com.dudu.duduserver.constant.UserRoleEnum;
import com.dudu.duduserver.constant.VisitorStatusEnum;
import com.dudu.duduserver.entity.CompanyChannelDO;
import com.dudu.duduserver.entity.UserDO;
import com.dudu.duduserver.entity.UserGroupDO;
import com.dudu.duduserver.service.DeskInboundService;
import com.dudu.duduserver.testutil.IntegrationTestEnv;

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
import org.springframework.web.client.RestClient;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.function.Consumer;
import java.util.function.Function;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 纯文本回复在独立 MySQL、真实 HTTP 与真实 WebSocket 边界验收：发送中先落库再调用渠道、
 * 成功与失败结果、接待状态与 waiting_since 规则、推送报文、手动重发保留两段记录、
 * 入参拒绝、附件与员工字段不接受、权限与越权、能力接口按渠道凭据如实返回。
 * 渠道发送用可控替身构造公众号成功/失败响应（不模拟假成功）；运行前需重建 dudu_review。
 */
@SpringBootTest(properties = {"dudu.auth.jwt-secret=integration-test-secret"},
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureMockMvc
@EnabledIfEnvironmentVariable(named = "DUDU_INTEGRATION_TEST", matches = "true")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class DeskReplyIntegrationTest extends DeskIntegrationSupport {

    private static final long COMPANY_ID = 789001L;
    private static final long OTHER_COMPANY_ID = 789002L;
    private static final String CHANNEL_FAILURE =
        "微信客服消息发送失败：40001 invalid credential, access_token is invalid or not latest";

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", IntegrationTestEnv::jdbcUrl);
        registry.add("spring.datasource.username", IntegrationTestEnv::dbUser);
        registry.add("spring.datasource.password", IntegrationTestEnv::dbPassword);
    }

    // 渠道发送替身：成功/失败响应按公众号事实构造，可观察调用时的持久状态
    static class RecordingSender extends WechatMpTextSender {

        volatile Function<String, ChannelSendResult> answer = text -> ChannelSendResult.sent(null);
        volatile Consumer<String> observer = text -> { };
        final List<String> texts = new CopyOnWriteArrayList<>();

        RecordingSender() {
            // 替身不发起渠道请求：接口地址指向本机保留端口，误请求会以连接失败暴露
            super(RestClient.builder(), "http://127.0.0.1:9");
        }

        @Override
        public ChannelSendResult send(CompanyChannelDO account, String externalUserId, String text) {
            texts.add(text);
            observer.accept(text);
            return answer.apply(text);
        }
    }

    @TestConfiguration
    static class SenderConfig {

        @Bean
        @Primary
        RecordingSender recordingSender() {
            return new RecordingSender();
        }
    }

    @Autowired DeskInboundService deskInboundService;
    @Autowired RecordingSender sender;

    private long channelWechat;
    private long channelDouyin;
    private long channelUnconfigured;
    private long scopedUserId;
    private String ownerToken;
    private String scopedToken;
    private String outsideToken;

    @BeforeAll
    void seed() throws Exception {
        companies.createCompany(company(COMPANY_ID, "replyowner", "回复验收企业"), 1L);
        companies.createCompany(company(OTHER_COMPANY_ID, "replyowner2", "回复验收企业"), 1L);
        UserGroupDO group = group(COMPANY_ID, "回复组");
        channelWechat = channel(COMPANY_ID, group.getGroupId(), ChannelEnum.WECHAT_MP, "公众号",
            Map.of("token", "reply-token", "appId", "wx_reply_appid", "appSecret", "reply-secret"));
        channelUnconfigured = channel(COMPANY_ID, group.getGroupId(), ChannelEnum.WECHAT_MP, "未配凭据公众号",
            Map.of("token", "reply-token"));
        channelDouyin = channel(COMPANY_ID, group.getGroupId(), ChannelEnum.DOUYIN, "抖音号",
            Map.of("token", "reply-token"));

        UserDO scoped = plainUser(COMPANY_ID, "reply.scoped", "坐席甲");
        scopedUserId = scoped.getUserId();
        members.save(member(COMPANY_ID, scoped.getUserId(), group.getGroupId()));
        plainUser(COMPANY_ID, "reply.none", "无权员工");
        ownerToken = login(COMPANY_ID, "replyowner");
        scopedToken = login(COMPANY_ID, "reply.scoped");
        outsideToken = login(COMPANY_ID, "reply.none");
    }

    @AfterEach
    void resetSender() {
        sender.answer = text -> ChannelSendResult.sent(null);
        sender.observer = text -> { };
        sender.texts.clear();
    }

    @Test
    void sendSavesSendingRecordFirstThenReportsSuccessAndPushesSummary() throws Exception {
        long visitorId = newVisitor(channelWechat, "reply-ext-1", "想咨询发货时间");
        LocalDateTime waitingSince = waitingSince(visitorId);
        SocketClient client = connectAndAuth(scopedToken);
        Observed midFlight = sendAndObserve(visitorId, "cr-success-1", "好的，今天发出");

        // 调用未返回时：消息已是 sending，计数与最后摘要已更新，接待状态按契约不变
        assertThat(midFlight.message().get("send_status")).isEqualTo("sending");
        assertThat(midFlight.message().get("direction")).isEqualTo("outgoing");
        assertThat(midFlight.message().get("sender_user_id")).isEqualTo(scopedUserId);
        assertThat(midFlight.message().get("client_request_id")).isEqualTo("cr-success-1");
        assertThat(midFlight.message().get("external_message_id")).isNull();
        assertThat(midFlight.visitor().get("status")).isEqualTo("needs-reply");
        assertThat(midFlight.visitor().get("waiting_since")).isEqualTo(waitingSince);
        assertThat(midFlight.visitor().get("message_count")).isEqualTo(2L);
        assertThat(midFlight.visitor().get("last_message_preview")).isEqualTo("好的，今天发出");

        JSONObject message = data(midFlight.response());
        assertThat(message.getStr("direction")).isEqualTo("outgoing");
        assertThat(message.getStr("clientRequestId")).isEqualTo("cr-success-1");
        assertThat(message.getStr("senderUserId")).isEqualTo(String.valueOf(scopedUserId));
        assertThat(message.getStr("senderName")).isEqualTo("坐席甲");
        assertThat(message.getInt("sequence")).isEqualTo(2);
        assertThat(message.getJSONObject("body").getStr("text")).isEqualTo("好的，今天发出");
        assertThat(message.getJSONObject("delivery").getStr("state")).isEqualTo("sent");

        // 保存结果后一次推送：完整消息 + 最新访客摘要（含发送者本人）
        JSONObject frame = client.next(Duration.ofSeconds(5));
        assertThat(frame.getStr("type")).isEqualTo("message");
        assertThat(frame.getJSONObject("message").getStr("id")).isEqualTo(message.getStr("id"));
        assertThat(frame.getJSONObject("message").getJSONObject("delivery").getStr("state")).isEqualTo("sent");
        JSONObject conversation = frame.getJSONObject("conversation");
        assertThat(conversation.getStr("status")).isEqualTo("waiting");
        assertThat(conversation.get("waitingSince")).isNull();
        assertThat(conversation.getStr("preview")).isEqualTo("好的，今天发出");
        assertThat(conversation.getInt("messageCount")).isEqualTo(2);
        assertThat(conversation.getJSONObject("capability").getStr("state")).isEqualTo("allowed");
        // 结果保存后只推送一次，没有第二条报文
        assertThat((Object) client.next(Duration.ofMillis(300))).isNull();

        // 成功回复按后端结果更新共享接待状态并清空等待计时
        Map<String, Object> visitor = jdbc.queryForMap("SELECT * FROM visitor WHERE visitor_id = ?", visitorId);
        assertThat(visitor.get("status")).isEqualTo("waiting");
        assertThat(visitor.get("waiting_since")).isNull();
        assertThat(visitor.get("version")).isEqualTo((long) conversation.getInt("version"));
        Map<String, Object> saved = jdbc.queryForMap("SELECT * FROM message WHERE visitor_id = ? AND sequence = 2",
            visitorId);
        assertThat(saved.get("send_status")).isEqualTo("sent");
        assertThat(saved.get("failure_reason")).isNull();
        assertThat(saved.get("external_message_id")).isNull();
        assertThat(sender.texts).containsExactly("好的，今天发出");
    }

    @Test
    void channelFailureKeepsFailedRecordWithTheRealReasonWithoutTouchingReceptionStatus() throws Exception {
        long visitorId = newVisitor(channelWechat, "reply-ext-2", "在吗");
        LocalDateTime waitingSince = waitingSince(visitorId);
        SocketClient client = connectAndAuth(scopedToken);
        sender.answer = text -> ChannelSendResult.failed(CHANNEL_FAILURE);

        JSONObject message = data(send(scopedToken, visitorId, body("cr-fail-1", "稍等，我查一下")));

        assertThat(message.getJSONObject("delivery").getStr("state")).isEqualTo("failed");
        assertThat(message.getJSONObject("delivery").getStr("reason")).isEqualTo(CHANNEL_FAILURE);

        // 渠道失败同样是已保存的消息，客户端能拿到最终结果；失败不把咨询算作已回复
        JSONObject frame = client.next(Duration.ofSeconds(5));
        assertThat(frame.getJSONObject("message").getStr("id")).isEqualTo(message.getStr("id"));
        assertThat(frame.getJSONObject("message").getJSONObject("delivery").getStr("state")).isEqualTo("failed");
        assertThat(frame.getJSONObject("conversation").getStr("status")).isEqualTo("needs-reply");
        Map<String, Object> visitor = jdbc.queryForMap("SELECT * FROM visitor WHERE visitor_id = ?", visitorId);
        assertThat(visitor.get("status")).isEqualTo("needs-reply");
        assertThat(((LocalDateTime) visitor.get("waiting_since"))).isEqualTo(waitingSince);
        Map<String, Object> saved = jdbc.queryForMap("SELECT * FROM message WHERE visitor_id = ? AND sequence = 2",
            visitorId);
        assertThat(saved.get("send_status")).isEqualTo("failed");
        assertThat(saved.get("failure_reason")).isEqualTo(CHANNEL_FAILURE);

        // 重登后按库显示：历史接口仍返回失败记录与真实原因
        JSONObject history = data(JSONUtil.parseObj(mvc.perform(get("/api/desk/visitors/" + visitorId + "/messages")
                .header("Authorization", "Bearer " + ownerToken))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString()));
        JSONObject latest = history.getJSONArray("items").getJSONObject(1);
        assertThat(latest.getJSONObject("delivery").getStr("state")).isEqualTo("failed");
        assertThat(latest.getJSONObject("delivery").getStr("reason")).isEqualTo(CHANNEL_FAILURE);
    }

    @Test
    void sendRejectsBlankOversizedAndMalformedInputWithoutSavingMessages() throws Exception {
        long visitorId = newVisitor(channelWechat, "reply-ext-3", "第一条");
        record Case(String body, int code) { }
        List<Case> cases = List.of(
            new Case("{\"text\": \"缺标识\"}", 11100),
            new Case("{\"clientRequestId\": \"cr-x\"}", 11100),
            new Case("{\"clientRequestId\": \"cr-1\", \"text\": \"   \\n  \"}", 11000),
            new Case("{\"clientRequestId\": \"  \", \"text\": \"内容\"}", 11000),
            new Case("{\"clientRequestId\": \"cr-1\", \"text\": \"" + "长".repeat(4001) + "\"}", 11200),
            new Case("{\"clientRequestId\": \"" + "a".repeat(65) + "\", \"text\": \"内容\"}", 11200));

        for (Case item : cases) {
            JSONObject response = send(scopedToken, visitorId, item.body());
            assertThat(response.getInt("code")).isEqualTo(item.code());
        }
        assertThat(sender.texts).isEmpty();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM message WHERE visitor_id = ? AND direction = 'outgoing'",
            Long.class, visitorId)).isZero();
        assertThat(jdbc.queryForObject("SELECT message_count FROM visitor WHERE visitor_id = ?", Integer.class,
            visitorId)).isEqualTo(1);
    }

    @Test
    void sendAcceptsOnlyPlainTextAndBindsTheLoggedInEmployee() throws Exception {
        long visitorId = newVisitor(channelWechat, "reply-ext-4", "附件相关来信");

        // 客户端提交的附件与员工字段不被接受：实际发送员工来自登录身份，正文按纯文本保存
        JSONObject message = data(send(scopedToken, visitorId, """
            {"clientRequestId": "cr-image-1", "text": "只发文字\\n换行也保留",
             "attachments": [{"type": "image", "media": {"id": "m1"}}], "senderUserId": "1",
             "sendStatus": "sent"}
            """));

        assertThat(message.getStr("senderUserId")).isEqualTo(String.valueOf(scopedUserId));
        assertThat(message.getJSONObject("body").getStr("type")).isEqualTo("text");
        assertThat(message.getJSONObject("body").getStr("text")).isEqualTo("只发文字\n换行也保留");
        assertThat(sender.texts).containsExactly("只发文字\n换行也保留");
        Map<String, Object> saved = jdbc.queryForMap("SELECT content FROM message WHERE visitor_id = ? AND sequence = 2",
            visitorId);
        assertThat(saved.get("content").toString()).contains("\"text\": \"只发文字\\n换行也保留\"")
            .doesNotContain("image").doesNotContain("media");
    }

    @Test
    void sendKeepsNeedsReplyWhenANewerIncomingArrivedWhileTheChannelCallWasInFlight() throws Exception {
        long visitorId = newVisitor(channelWechat, "reply-ext-5", "想咨询价格");
        LocalDateTime beforeSend = LocalDateTime.of(2026, 10, 12, 8, 0, 0);
        jdbc.update("UPDATE visitor SET waiting_since = ? WHERE visitor_id = ?", beforeSend, visitorId);
        sender.observer = text -> {
            // 渠道调用期间访客又来一条：sequence 在本次 outgoing 之后，接待状态保持待回复
            LocalDateTime now = LocalDateTime.now();
            jdbc.update("""
                INSERT INTO message(visitor_id, sequence, direction, content, version, create_time, update_time)
                VALUES(?, 3, 'incoming', JSON_OBJECT('type', 'text', 'text', '再问一句'), 1, ?, ?)
                """, visitorId, now, now);
            jdbc.update("""
                UPDATE visitor SET message_count = 3, status = 'needs-reply', waiting_since = ?,
                last_message_preview = '再问一句', last_message_time = ?, version = version + 1, update_time = ?
                WHERE visitor_id = ?
                """, now, now, now, visitorId);
        };

        JSONObject message = data(send(scopedToken, visitorId, body("cr-race-1", "收到，正在确认")));

        assertThat(message.getJSONObject("delivery").getStr("state")).isEqualTo("sent");
        Map<String, Object> visitor = jdbc.queryForMap(
            "SELECT status, waiting_since, message_count FROM visitor WHERE visitor_id = ?", visitorId);
        assertThat(visitor.get("status")).isEqualTo("needs-reply");
        assertThat(visitor.get("waiting_since")).isNotNull();
        assertThat(((LocalDateTime) visitor.get("waiting_since"))).isAfter(beforeSend);
        assertThat(visitor.get("message_count")).isEqualTo(3L);
    }

    @Test
    void manualResendKeepsBothRecordsAndFailureStillCountsInTheSummary() throws Exception {
        long visitorId = newVisitor(channelWechat, "reply-ext-6", "第一次来信");
        sender.answer = text -> ChannelSendResult.failed("微信客服消息发送失败：45015 response out of time limit");
        JSONObject failed = data(send(scopedToken, visitorId, body("cr-retry-1", "第一次回复")));

        // 失败同样入库并计入摘要：计数加一、预览更新，排序口径按消息数累计
        Map<String, Object> afterFailure = jdbc.queryForMap(
            "SELECT message_count, last_message_preview, last_message_time FROM visitor WHERE visitor_id = ?",
            visitorId);
        assertThat(afterFailure.get("message_count")).isEqualTo(2L);
        assertThat(afterFailure.get("last_message_preview")).isEqualTo("第一次回复");
        assertThat(afterFailure.get("last_message_time")).isNotNull();

        sender.answer = text -> ChannelSendResult.sent(null);
        JSONObject resent = data(send(scopedToken, visitorId, body("cr-retry-2", "第一次回复")));

        assertThat(resent.getStr("id")).isNotEqualTo(failed.getStr("id"));
        assertThat(resent.getInt("sequence")).isEqualTo(3);
        JSONObject page = data(JSONUtil.parseObj(mvc.perform(post("/api/desk/visitors/query")
                .header("Authorization", "Bearer " + scopedToken)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"search\": \"reply-ext-6\", \"order\": \"messages\"}"))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString()));
        assertThat(page.getJSONArray("items").getJSONObject(0).getInt("messageCount")).isEqualTo(3);
        List<Map<String, Object>> rows = jdbc.queryForList(
            "SELECT sequence, send_status, client_request_id FROM message WHERE visitor_id = ? ORDER BY sequence",
            visitorId);
        assertThat(rows).hasSize(3);
        assertThat(rows.get(1).get("send_status")).isEqualTo("failed");
        assertThat(rows.get(1).get("client_request_id")).isEqualTo("cr-retry-1");
        assertThat(rows.get(2).get("send_status")).isEqualTo("sent");
        assertThat(rows.get(2).get("client_request_id")).isEqualTo("cr-retry-2");
    }

    @Test
    void capabilityFollowsTheRealChannelAndCredentialsAndSendingRechecksIt() throws Exception {
        assertThat(capability(channelWechat, "reply-ext-7").toString())
            .isEqualTo("{\"state\":\"allowed\",\"kinds\":[\"text\"]}");
        JSONObject unconfigured = capability(channelUnconfigured, "reply-ext-8");
        assertThat(unconfigured.getStr("state")).isEqualTo("restricted");
        assertThat(unconfigured.getJSONArray("kinds")).isEmpty();
        assertThat(unconfigured.getStr("reason")).isEqualTo("渠道发送凭据未配置");
        JSONObject otherChannel = capability(channelDouyin, "reply-ext-9");
        assertThat(otherChannel.getStr("state")).isEqualTo("restricted");
        assertThat(otherChannel.getStr("reason")).isEqualTo("当前渠道暂未接入发送");

        // 发送端再校验一次：不可发渠道不落库、不调用渠道
        long douyinVisitor = visitorIdOf(channelDouyin, "reply-ext-9");
        JSONObject rejected = send(scopedToken, douyinVisitor, body("cr-restricted-1", "抖音回复"));
        assertThat(rejected.getInt("code")).isEqualTo(12200);
        assertThat(rejected.getStr("msg")).isEqualTo("当前渠道暂未接入发送");
        assertThat(sender.texts).isEmpty();
        assertThat(jdbc.queryForObject("SELECT message_count FROM visitor WHERE visitor_id = ?", Integer.class,
            douyinVisitor)).isEqualTo(1);

        // 会话对象与能力接口同源：可发账号 allowed + ["text"]
        JSONObject conversation = data(JSONUtil.parseObj(mvc.perform(get("/api/desk/visitors/" +
                visitorIdOf(channelWechat, "reply-ext-7"))
                .header("Authorization", "Bearer " + ownerToken))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString()));
        assertThat(conversation.getJSONObject("capability").getStr("state")).isEqualTo("allowed");
        assertThat(conversation.getJSONObject("capability").getJSONArray("kinds").getStr(0)).isEqualTo("text");
    }

    @Test
    void sendAndCapabilityReuseTheExistingAccessGuard() throws Exception {
        long visitorId = newVisitor(channelWechat, "reply-ext-10", "守卫来信");
        long otherVisitorId = otherCompanyVisitor();

        assertThat(send(outsideToken, visitorId, body("cr-guard-1", "越权")).getInt("code")).isEqualTo(10106);
        assertThat(send(ownerToken, otherVisitorId, body("cr-guard-2", "跨企业")).getInt("code")).isEqualTo(10106);
        assertThat(send(scopedToken, 789999L, body("cr-guard-3", "不存在")).getInt("code")).isEqualTo(12100);
        assertThat(mvc.perform(get("/api/desk/visitors/" + visitorId + "/capability")
                .header("Authorization", "Bearer " + outsideToken))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).contains("10106");
        assertThat(mvc.perform(get("/api/desk/visitors/" + visitorId + "/capability"))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).contains("10101");
        assertThat(mvc.perform(get("/api/desk/visitors/" + visitorId + "/capability")
                .header("Authorization", "Bearer " + jwtManager.createToken(
                    new JwtUser(null, 1L, UserRoleEnum.ADMIN, DateUtil.currentSeconds() + 600))))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).contains("10106");
        assertThat(sender.texts).isEmpty();
    }

    private Observed sendAndObserve(long visitorId, String clientRequestId, String text) throws Exception {
        List<Map<String, Object>> messages = new CopyOnWriteArrayList<>();
        List<Map<String, Object>> visitors = new CopyOnWriteArrayList<>();
        sender.observer = ignored -> {
            messages.add(jdbc.queryForMap(
                "SELECT send_status, direction, sender_user_id, client_request_id, external_message_id FROM message"
                    + " WHERE visitor_id = ? AND client_request_id = ?", visitorId, clientRequestId));
            visitors.add(jdbc.queryForMap(
                "SELECT status, waiting_since, message_count, last_message_preview FROM visitor WHERE visitor_id = ?",
                visitorId));
        };
        JSONObject response = send(scopedToken, visitorId, body(clientRequestId, text));
        return new Observed(response, messages.get(0), visitors.get(0));
    }

    // 一次发送：HTTP 返回，以及渠道调用进行中读取的消息与访客状态
    private record Observed(JSONObject response, Map<String, Object> message, Map<String, Object> visitor) {
    }

    private JSONObject capability(long channelId, String externalUserId) throws Exception {
        JSONObject response = JSONUtil.parseObj(mvc.perform(get("/api/desk/visitors/" +
                newVisitor(channelId, externalUserId, "能力来信") + "/capability")
                .header("Authorization", "Bearer " + scopedToken))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertThat(response.getInt("code")).isZero();
        return response.getJSONObject("data");
    }

    private JSONObject send(String token, long visitorId, String body) throws Exception {
        return JSONUtil.parseObj(mvc.perform(post("/api/desk/visitors/" + visitorId + "/messages")
                .header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }

    private String body(String clientRequestId, String text) {
        return JSONUtil.createObj().set("clientRequestId", clientRequestId).set("text", text).toString();
    }

    private long newVisitor(long channelId, String externalUserId, String firstText) {
        deskInboundService.accept(channels.getById(channelId), new ChannelInboundMessage(channelId, externalUserId,
            null, null, List.of(), "seed-" + externalUserId, MessageDirectionEnum.INCOMING,
            Map.of("type", "text", "text", firstText)));
        return visitorIdOf(channelId, externalUserId);
    }

    private long visitorIdOf(long channelId, String externalUserId) {
        return jdbc.queryForObject(
            "SELECT visitor_id FROM visitor WHERE company_id = ? AND company_channel_id = ? AND external_user_id = ?",
            Long.class, COMPANY_ID, channelId, externalUserId);
    }

    private long otherCompanyVisitor() {
        UserGroupDO otherGroup = group(OTHER_COMPANY_ID, "外部回复组");
        long otherChannel = channel(OTHER_COMPANY_ID, otherGroup.getGroupId(), ChannelEnum.WECHAT_MP, "外部公众号",
            Map.of("token", "reply-token", "appId", "wx_other", "appSecret", "other-secret"));
        deskInboundService.accept(channels.getById(otherChannel), new ChannelInboundMessage(otherChannel,
            "reply-ext-foreign", null, null, List.of(), "seed-foreign", MessageDirectionEnum.INCOMING,
            Map.of("type", "text", "text", "外部来信")));
        return jdbc.queryForObject(
            "SELECT visitor_id FROM visitor WHERE company_id = ? AND external_user_id = 'reply-ext-foreign'",
            Long.class, OTHER_COMPANY_ID);
    }

    private LocalDateTime waitingSince(long visitorId) {
        return jdbc.queryForObject("SELECT waiting_since FROM visitor WHERE visitor_id = ?", LocalDateTime.class,
            visitorId);
    }
}
