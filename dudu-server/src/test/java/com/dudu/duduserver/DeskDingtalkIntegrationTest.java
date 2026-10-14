package com.dudu.duduserver;

import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.dudu.duduserver.channel.ChannelInboundMessage;
import com.dudu.duduserver.channel.dingtalk.DingtalkCrypto;
import com.dudu.duduserver.constant.ChannelEnum;
import com.dudu.duduserver.constant.MessageDirectionEnum;
import com.dudu.duduserver.entity.CompanyChannelDO;
import com.dudu.duduserver.service.DeskInboundService;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MvcResult;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 钉钉渠道在独立 MySQL、真实 HTTP 与真实 WebSocket 边界验收：加密握手回包与非法签名
 * 拒绝、机器人六种 msgtype 密文推送按统一消息体落库且事件只应答、纯文本发送经真实
 * 工作通知客户端（本地替身按官方事实构造响应）回传 task_id 与渠道失败如实落库、
 * 媒体读取按凭据与渠道错误如实返回。运行前需重建 dudu_review。
 */
@SpringBootTest(properties = {"dudu.auth.jwt-secret=integration-test-secret"},
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureMockMvc
@EnabledIfEnvironmentVariable(named = "DUDU_INTEGRATION_TEST", matches = "true")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class DeskDingtalkIntegrationTest extends DeskIntegrationSupport {

    private static final long COMPANY_ID = 796001L;
    private static final String TOKEN = "dt-callback-token";
    private static final String AES_KEY = "4g5j64qlyl3zvetqxz5jiocdr586fn2zvjpa8zls3ij";
    private static final String OWNER = "ding9f50b15bxxxx16741";
    private static final String TIMESTAMP = "1708327204136";
    private static final String NONCE = "nEXhMP4r";

    // 官方返回示例原文形状：新版凭证与工作通知成功响应
    private static final String TOKEN_OK = "{\"accessToken\":\"ACCESS_TOKEN\",\"expireIn\":7200}";
    private static final String SEND_OK =
        "{\"errcode\":0,\"errmsg\":\"ok\",\"task_id\":256271667526,\"request_id\":\"4jzllmte0wau\"}";
    private static final String SEND_REJECTED = "{\"errcode\":88,\"errmsg\":\"工作通知的接收人个数超过100\"}";
    private static final String EXCHANGE_REJECTED =
        "{\"code\":\"ForbiddenAccess\",\"message\":\"此 downloadCode 和机器人 robotCode 不匹配\"}";

    // 受控替身：真实 sender/reader 经动态属性指向本替身；响应可按用例切换
    private static final List<String> REQUESTS = new CopyOnWriteArrayList<>();
    private static final HttpServer STUB = startStub();
    private static volatile String sendReply = SEND_OK;
    private static volatile String exchangeReply = EXCHANGE_REJECTED;

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> System.getenv("DUDU_TEST_JDBC_URL"));
        registry.add("spring.datasource.username", () -> "root");
        registry.add("spring.datasource.password", () -> System.getenv("DUDU_TEST_DB_PASSWORD"));
        String stubUrl = "http://127.0.0.1:" + STUB.getAddress().getPort();
        registry.add("dudu.channel.dingtalk.api-base", () -> stubUrl);
        registry.add("dudu.channel.dingtalk.oapi-base", () -> stubUrl);
    }

    @Autowired DeskInboundService deskInboundService;

    private long channelDingtalk;
    private long channelReceiveOnly;
    private String ownerToken;

    @BeforeAll
    void seed() throws Exception {
        companies.createCompany(company(COMPANY_ID, "dingowner", "钉钉验收企业"), 1L);
        Map<String, Object> receiveInfo = Map.of("url", "https://desk.example/api/channels/x/callback",
            "token", TOKEN, "encodingAesKey", AES_KEY, "ownerKey", OWNER);
        Map<String, Object> fullInfo = new java.util.HashMap<>(receiveInfo);
        fullInfo.put("appKey", "dingeqqpkv3xxxxxx");
        fullInfo.put("appSecret", "GT-lsu-taDAxxx");
        fullInfo.put("agentId", "123456789");
        var group = group(COMPANY_ID, "钉钉组");
        channelDingtalk = channel(COMPANY_ID, group.getGroupId(), ChannelEnum.DINGTALK, "钉钉应用", fullInfo);
        channelReceiveOnly = channel(COMPANY_ID, group.getGroupId(), ChannelEnum.DINGTALK, "只收不发钉钉",
            receiveInfo);
        ownerToken = login(COMPANY_ID, "dingowner");
    }

    @AfterAll
    void stopStub() {
        STUB.stop(0);
    }

    @Test
    void handshakeAnswersEncryptedSuccessAndRejectsTamperedSignature() throws Exception {
        MvcResult handshake = push("{\"EventType\":\"check_url\"}", false);
        assertThat(handshake.getResponse().getStatus()).isEqualTo(200);
        JSONObject reply = JSONUtil.parseObj(handshake.getResponse().getContentAsString());
        // 加密 success 回包：四字段、解密为 success、签名按回包自身四参成立
        assertThat(reply.keySet()).containsExactlyInAnyOrder("msg_signature", "timeStamp", "nonce", "encrypt");
        assertThat(DingtalkCrypto.decrypt(reply.getStr("encrypt"), AES_KEY, OWNER).message()).isEqualTo("success");
        assertThat(DingtalkCrypto.verify(reply.getStr("msg_signature"), TOKEN, reply.getStr("timeStamp"),
            reply.getStr("nonce"), reply.getStr("encrypt"))).isTrue();

        assertThat(push("{\"EventType\":\"check_url\"}", true).getResponse().getStatus()).isEqualTo(403);
    }

    @Test
    void inboundRobotMessagesPersistUnifiedBodiesAndEventsAnswerOnly() throws Exception {
        SocketClient client = connectAndAuth(ownerToken);

        push(robotText("dt-ext-1", "你好，想咨询发货时间", "msgr1"), false)
            .getResponse().getStatus();
        JSONObject frame = client.next(Duration.ofSeconds(5));
        assertThat(frame.getStr("type")).isEqualTo("message");
        assertThat(frame.getJSONObject("conversation").getJSONObject("identity").getStr("channelId"))
            .isEqualTo("dingtalk");

        // 六种 msgtype 黄金片段（事实库 §5.1 逐字）按统一消息体落库
        push("{\"msgtype\":\"text\",\"senderId\":\"dt-ext-media\",\"text\":{\"content\":\" text\"},"
            + "\"msgId\":\"msgr-text\"}", false);
        push("{\"msgtype\":\"picture\",\"senderId\":\"dt-ext-media\",\"msgId\":\"msgr-pic\","
            + "\"content\":{\"downloadCode\":\"mIofN681YE3f/…\"}}", false);
        push("{\"msgtype\":\"audio\",\"senderId\":\"dt-ext-media\",\"msgId\":\"msgr-audio\","
            + "\"content\":{\"duration\":4000,\"downloadCode\":\"mIofN…\",\"recognition\":\"钉钉，让进步发生\"}}", false);
        push("{\"msgtype\":\"video\",\"senderId\":\"dt-ext-media\",\"msgId\":\"msgr-video\","
            + "\"content\":{\"duration\":4000,\"downloadCode\":\"mIofN…\",\"videoType\":\"mp4\"}}", false);
        push("{\"msgtype\":\"file\",\"senderId\":\"dt-ext-media\",\"msgId\":\"msgr-file\","
            + "\"content\":{\"downloadCode\":\"mIofN…\",\"fileName\":\"钉钉让进步发生.pdf\"}}", false);
        push("{\"msgtype\":\"richText\",\"senderId\":\"dt-ext-media\",\"msgId\":\"msgr-rich\","
            + "\"content\":{\"richText\":[{\"text\":\"你好\"},{\"downloadCode\":\"mIofN…\",\"type\":\"picture\"}]}}",
            false);
        long mediaVisitor = visitorIdOf("dt-ext-media");

        List<Map<String, Object>> rows = jdbc.queryForList(
            "SELECT content FROM message WHERE visitor_id = ? ORDER BY sequence", mediaVisitor);
        assertThat(rows).hasSize(6);
        assertThat(rows.get(0).get("content").toString()).contains("\"type\": \"text\"").contains(" text");
        assertThat(rows.get(1).get("content").toString()).contains("\"type\": \"image\"")
            .contains("mIofN681YE3f/…");
        assertThat(rows.get(2).get("content").toString()).contains("\"type\": \"audio\"").contains("mIofN…");
        assertThat(rows.get(3).get("content").toString()).contains("\"type\": \"video\"")
            .doesNotContain("mp4").doesNotContain("4000");
        assertThat(rows.get(4).get("content").toString()).contains("\"type\": \"file\"")
            .contains("钉钉让进步发生.pdf");
        assertThat(rows.get(5).get("content").toString()).contains("\"type\": \"reply\"")
            .contains("attachments").contains("mIofN…");

        // 事件信封只应答不落库：访客计数不变
        int visitorsBefore = jdbc.queryForObject("SELECT COUNT(*) FROM visitor", Integer.class);
        assertThat(push("{\"EventType\":\"user_add_org\",\"CorpId\":\"" + OWNER + "\",\"UserId\":[\"u1\"]}",
            false).getResponse().getStatus()).isEqualTo(200);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM visitor", Integer.class)).isEqualTo(visitorsBefore);

        // 未识别明文：只应答加密 success 包，不落库不拒绝
        assertThat(push("{\"foo\":\"bar\"}", false).getResponse().getStatus()).isEqualTo(200);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM visitor", Integer.class)).isEqualTo(visitorsBefore);
    }

    @Test
    void replySendsWorkNotificationAndPersistsTaskIdAndChannelFailure() throws Exception {
        long visitorId = pushIncoming("dt-ext-reply-1", "想咨询发货时间");

        JSONObject sent = data(sendReply(visitorId, "{\"clientRequestId\":\"cr-dt-1\",\"text\":\"好的，今天发出\"}"));
        assertThat(sent.getJSONObject("delivery").getStr("state")).isEqualTo("sent");
        Map<String, Object> saved = jdbc.queryForMap(
            "SELECT send_status, external_message_id, failure_reason FROM message WHERE visitor_id = ?"
                + " AND client_request_id = 'cr-dt-1'", visitorId);
        assertThat(saved.get("send_status")).isEqualTo("sent");
        assertThat(saved.get("external_message_id")).isEqualTo("256271667526");
        assertThat(saved.get("failure_reason")).isNull();
        // 工作通知真实出网：凭证一次 + 发送一次，body 按 agent_id/userid_list/msg
        assertThat(REQUESTS.stream().filter(line -> line.contains("oauth2/accessToken")).count()).isEqualTo(1);
        assertThat(REQUESTS.stream().filter(line -> line.contains("asyncsend_v2")).count()).isEqualTo(1);

        sendReply = SEND_REJECTED;
        try {
            long failingVisitor = pushIncoming("dt-ext-reply-2", "在吗");
            JSONObject failed = data(sendReply(failingVisitor,
                "{\"clientRequestId\":\"cr-dt-2\",\"text\":\"稍等，我查一下\"}"));
            assertThat(failed.getJSONObject("delivery").getStr("state")).isEqualTo("failed");
            assertThat(failed.getJSONObject("delivery").getStr("reason"))
                .isEqualTo("钉钉工作通知发送失败：88 工作通知的接收人个数超过100");
            Map<String, Object> failure = jdbc.queryForMap(
                "SELECT send_status, failure_reason FROM message WHERE visitor_id = ?"
                    + " AND client_request_id = 'cr-dt-2'", failingVisitor);
            assertThat(failure.get("send_status")).isEqualTo("failed");
            assertThat(failure.get("failure_reason")).isEqualTo("钉钉工作通知发送失败：88 工作通知的接收人个数超过100");
        } finally {
            sendReply = SEND_OK;
        }
    }

    @Test
    void mediaReadFollowsCredentialsAndSurfacesChannelErrorsHonestly() throws Exception {
        // 未配置发送凭据：能力限制如实说明，不发起任何渠道请求
        long unconfiguredVisitor = seedMessage(channelReceiveOnly, "dt-ext-nocreds",
            Map.of("type", "image", "media", Map.of("kind", "image", "id", "NO_CRED_CODE")));
        JSONObject unconfigured = errorOf(mvc.perform(get("/api/desk/messages/"
                + mediaIdOf(unconfiguredVisitor) + "/media").header("Authorization", "Bearer " + ownerToken))
            .andReturn());
        assertThat(unconfigured.getInt("code")).isEqualTo(12200);
        assertThat(unconfigured.getStr("msg")).isEqualTo("渠道素材凭据未配置");
        int requestsBefore = REQUESTS.size();

        // 配了凭据但渠道拒绝换链：错误码 13100 + 渠道原始 code/message
        long visitorId = seedMessage(channelDingtalk, "dt-ext-media-read",
            Map.of("type", "image", "media", Map.of("kind", "image", "id", "mIofN681YE3f/…")));
        JSONObject failed = errorOf(mvc.perform(get("/api/desk/messages/" + mediaIdOf(visitorId) + "/media")
                .header("Authorization", "Bearer " + ownerToken))
            .andReturn());
        assertThat(failed.getInt("code")).isEqualTo(13100);
        assertThat(failed.getStr("msg")).contains("ForbiddenAccess").contains("此 downloadCode 和机器人 robotCode 不匹配");
        assertThat(REQUESTS.size()).isGreaterThan(requestsBefore);
    }

    // 以真实三元组加密明文并按四参签名推送到回调入口；tamper 模拟签名被篡改
    private MvcResult push(String plaintext, boolean tamper) throws Exception {
        String encrypt = DingtalkCrypto.encrypt(plaintext, AES_KEY, OWNER);
        String signature = DingtalkCrypto.buildSignature(TOKEN, TIMESTAMP, NONCE, encrypt);
        if (tamper) {
            signature = "0".repeat(40);
        }
        return mvc.perform(post("/api/channels/" + channelDingtalk + "/callback")
                .queryParam("signature", signature)
                .queryParam("timestamp", TIMESTAMP)
                .queryParam("nonce", NONCE)
                .contentType(MediaType.APPLICATION_JSON)
                .content(JSONUtil.createObj().set("encrypt", encrypt).toString()))
            .andReturn();
    }

    // 机器人文本密文推送一次：返回落库后的访客 ID
    private long pushIncoming(String externalUserId, String text) throws Exception {
        push(robotText(externalUserId, text, "msgr-" + externalUserId), false);
        return visitorIdOf(externalUserId);
    }

    private String robotText(String senderId, String content, String msgId) {
        return JSONUtil.createObj()
            .set("msgtype", "text")
            .set("senderId", senderId)
            .set("senderNick", "小钉")
            .set("msgId", msgId)
            .set("text", Map.of("content", content))
            .toString();
    }

    private long visitorIdOf(String externalUserId) {
        return jdbc.queryForObject(
            "SELECT visitor_id FROM visitor WHERE company_id = ? AND external_user_id = ?",
            Long.class, COMPANY_ID, externalUserId);
    }

    private long seedMessage(long channelId, String externalUserId, Map<String, Object> content) {
        CompanyChannelDO account = channels.getById(channelId);
        deskInboundService.accept(account, new ChannelInboundMessage(channelId, externalUserId,
            null, null, List.of(), "seed-" + externalUserId, MessageDirectionEnum.INCOMING, content));
        return visitorIdOf(externalUserId);
    }

    private long mediaIdOf(long visitorId) {
        return jdbc.queryForObject(
            "SELECT message_id FROM message WHERE visitor_id = ? ORDER BY sequence DESC LIMIT 1", Long.class,
            visitorId);
    }

    private JSONObject sendReply(long visitorId, String body) throws Exception {
        return JSONUtil.parseObj(mvc.perform(post("/api/desk/visitors/" + visitorId + "/messages")
                .header("Authorization", "Bearer " + ownerToken)
                .contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }

    private JSONObject errorOf(MvcResult result) throws Exception {
        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        return JSONUtil.parseObj(result.getResponse().getContentAsString());
    }

    // 本地替身：真实钉钉客户端的出网全部落到这里，按官方事实构造响应
    private static HttpServer startStub() {
        try {
            HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            server.createContext("/v1.0/oauth2/accessToken", exchange -> {
                REQUESTS.add(exchange.getRequestMethod() + " " + exchange.getRequestURI());
                respond(exchange, TOKEN_OK.getBytes(StandardCharsets.UTF_8));
            });
            server.createContext("/topapi/message/corpconversation/asyncsend_v2", exchange -> {
                REQUESTS.add(exchange.getRequestMethod() + " " + exchange.getRequestURI());
                respond(exchange, sendReply.getBytes(StandardCharsets.UTF_8));
            });
            server.createContext("/v1.0/robot/messageFiles/download", exchange -> {
                REQUESTS.add(exchange.getRequestMethod() + " " + exchange.getRequestURI());
                exchange.getRequestBody().readAllBytes();
                respond(exchange, exchangeReply.getBytes(StandardCharsets.UTF_8));
            });
            server.start();
            return server;
        } catch (IOException e) {
            throw new IllegalStateException("替身服务启动失败", e);
        }
    }

    private static void respond(com.sun.net.httpserver.HttpExchange exchange, byte[] body) throws IOException {
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        exchange.sendResponseHeaders(200, body.length);
        exchange.getResponseBody().write(body);
        exchange.close();
    }
}
