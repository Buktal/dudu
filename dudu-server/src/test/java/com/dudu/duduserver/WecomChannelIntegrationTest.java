package com.dudu.duduserver;

import cn.hutool.core.date.DateUtil;
import cn.hutool.crypto.digest.DigestUtil;
import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.dudu.duduserver.channel.ChannelInboundMessage;
import com.dudu.duduserver.channel.wecom.WecomProtocol;
import com.dudu.duduserver.constant.ChannelEnum;
import com.dudu.duduserver.constant.MessageDirectionEnum;
import com.dudu.duduserver.entity.UserDO;
import com.dudu.duduserver.entity.UserGroupDO;
import com.dudu.duduserver.service.DeskInboundService;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
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
import org.springframework.util.LinkedMultiValueMap;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * 企业微信渠道在独立 MySQL 与真实 HTTP 边界验收：GET echostr 握手（合法回显解密明文、
 * 非法签名拒绝）、POST 密文信封入站解析（该渠道全部消息类型按契约统一落库、事件推送只
 * 应答 success）、纯文本发送成功与渠道失败如实落库、素材读取经真实读取实现返回字节与
 * 内容类型（渠道错误原样透传、未配置凭据如实受限）。报文按官方 90968/90239 与
 * mock-pulse wecom 适配器同形构造（黄金凭据见 docs/research/channels/wecom.md §5.1），
 * 渠道 API 用本地替身按官方响应形状应答（91039/90236/90254），不模拟假成功。
 * 运行前需重建 dudu_review。
 */
@SpringBootTest(properties = {"dudu.auth.jwt-secret=integration-test-secret"},
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureMockMvc
@EnabledIfEnvironmentVariable(named = "DUDU_INTEGRATION_TEST", matches = "true")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class WecomChannelIntegrationTest extends DeskIntegrationSupport {

    private static final long COMPANY_ID = 795001L;
    // 官方 90968 加解密完整示例凭据
    private static final String CORP_ID = "wx5823bf96d3bd56c7";
    private static final String TOKEN = "QDG6eK";
    private static final String ENCODING_AES_KEY = "jWmYm7qr5nMoAUwZRjGtBxmz3KA1tkAj3ykkR6q2B2C";
    private static final String AGENT_ID = "218";
    private static final String CORP_SECRET = "wecom-corp-secret";
    // 固定随机数加密，保证用例可复现（官方 §4.3 结构 random(16B) 供解密方跳过）
    private static final byte[] FIXED_RANDOM = "0123456789abcdef".getBytes(StandardCharsets.UTF_8);
    // 官方 91039/90236 响应示例原文形状
    private static final String TOKEN_OK = "{\"errcode\":0,\"errmsg\":\"ok\","
        + "\"access_token\":\"accesstoken000001\",\"expires_in\":7200}";
    private static final String SEND_OK = "{\"errcode\":0,\"errmsg\":\"ok\",\"invaliduser\":\"\","
        + "\"msgid\":\"MSGID_795001\"}";
    private static final String SEND_INVALID_USER = "{\"errcode\":81013,\"errmsg\":\"user not found\"}";
    private static final String MEDIA_INVALID_ID = "{\"errcode\":40007,\"errmsg\":\"invalid media_id\"}";
    private static final byte[] IMAGE_BYTES = "wecom-media-bytes".getBytes(StandardCharsets.UTF_8);

    // 渠道 API 替身：静态启动一次，地址经 dudu.channel.wecom.api-base 注入真实发送/素材实现
    private static final HttpServer API = startApiStub();
    private static final List<String> apiRequests = new CopyOnWriteArrayList<>();
    private static final List<String> sendBodies = new CopyOnWriteArrayList<>();
    private static volatile String tokenBody = TOKEN_OK;
    private static volatile String sendBody = SEND_OK;
    private static volatile String mediaJson;

    @DynamicPropertySource
    static void contextProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> System.getenv("DUDU_TEST_JDBC_URL"));
        registry.add("spring.datasource.username", () -> "root");
        registry.add("spring.datasource.password", () -> System.getenv("DUDU_TEST_DB_PASSWORD"));
        // 真实发送/素材/令牌实现全程走本地替身：请求与响应都按官方接口形状对拍
        registry.add("dudu.channel.wecom.api-base",
            () -> "http://127.0.0.1:" + API.getAddress().getPort());
    }

    private static HttpServer startApiStub() {
        try {
            HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            // 官方 91039：GET /cgi-bin/gettoken?corpid=&corpsecret=
            server.createContext("/cgi-bin/gettoken", exchange -> {
                apiRequests.add(exchange.getRequestMethod() + " " + exchange.getRequestURI());
                respond(exchange, tokenBody);
            });
            // 官方 90236：POST /cgi-bin/message/send?access_token=
            server.createContext("/cgi-bin/message/send", exchange -> {
                apiRequests.add(exchange.getRequestMethod() + " " + exchange.getRequestURI());
                sendBodies.add(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
                respond(exchange, sendBody);
            });
            // 官方 90254：成功与普通 HTTP 下载相同，错误才返回 JSON errcode
            server.createContext("/cgi-bin/media/get", exchange -> {
                apiRequests.add(exchange.getRequestMethod() + " " + exchange.getRequestURI());
                if (mediaJson != null) {
                    respond(exchange, mediaJson);
                    return;
                }
                exchange.getResponseHeaders().set("Content-Type", "image/jpeg");
                exchange.sendResponseHeaders(200, IMAGE_BYTES.length);
                exchange.getResponseBody().write(IMAGE_BYTES);
                exchange.close();
            });
            server.start();
            return server;
        } catch (IOException e) {
            throw new IllegalStateException("企业微信 API 替身启动失败", e);
        }
    }

    private static void respond(HttpExchange exchange, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        exchange.sendResponseHeaders(200, bytes.length);
        exchange.getResponseBody().write(bytes);
        exchange.close();
    }

    @Autowired DeskInboundService deskInboundService;

    private long channelWecom;
    private long channelCallbackOnly;
    private String scopedToken;

    @BeforeAll
    void seed() throws Exception {
        companies.createCompany(company(COMPANY_ID, "wecomowner", "企微验收企业"), 1L);
        UserGroupDO group = group(COMPANY_ID, "企微组");
        channelWecom = channel(COMPANY_ID, group.getGroupId(), ChannelEnum.WECOM, "企业微信", fullInfo());
        // 只有回调材料（无 corpSecret）的账号：推送可继续，发送/素材凭据如实受限
        channelCallbackOnly = channel(COMPANY_ID, group.getGroupId(), ChannelEnum.WECOM, "仅回调企微",
            Map.of("url", "https://dudu.example.com/api/channels/wecom-callback/callback",
                "corpId", CORP_ID, "token", TOKEN, "encodingAesKey", ENCODING_AES_KEY, "agentId", AGENT_ID));
        UserDO scoped = plainUser(COMPANY_ID, "wecom.scoped", "坐席乙");
        members.save(member(COMPANY_ID, scoped.getUserId(), group.getGroupId()));
        scopedToken = login(COMPANY_ID, "wecom.scoped");
    }

    @BeforeEach
    void resetStub() {
        apiRequests.clear();
        sendBodies.clear();
        tokenBody = TOKEN_OK;
        sendBody = SEND_OK;
        mediaJson = null;
    }

    @Test
    void verifyUrlEchoesDecryptedPlaintextAndRejectsForgedSignature() throws Exception {
        // 官方 §3.2：响应体为解密所得明文本身，不加引号、不带换行
        String echostr = encrypt("795001-echostr-plaintext", CORP_ID);
        MvcResult ok = mvc.perform(get("/api/channels/" + channelWecom + "/callback")
                .params(query(signed(echostr, echostr)))).andReturn();
        assertThat(ok.getResponse().getStatus()).isEqualTo(200);
        assertThat(ok.getResponse().getContentAsString()).isEqualTo("795001-echostr-plaintext");

        Map<String, String> forged = signed(echostr, echostr);
        forged.put("msg_signature", "0".repeat(40));
        MvcResult rejected = mvc.perform(get("/api/channels/" + channelWecom + "/callback")
                .params(query(forged))).andReturn();
        assertThat(rejected.getResponse().getStatus()).isEqualTo(403);
        assertThat(rejected.getResponse().getContentAsString()).isEmpty();
    }

    @Test
    void receiveMapsEveryMessageTypeIntoUnifiedBodiesAndOnlyAnswersEvents() throws Exception {
        // 六种普通消息逐条加密推送：每次应答 success，统一消息体按契约第 4 节落库
        assertThat(push(xml("wecom-ext-text", "7950010001", """
                <MsgType><![CDATA[text]]></MsgType>
                <Content><![CDATA[你好，想咨询发货时间]]></Content>""")).getResponse().getContentAsString())
            .isEqualTo("success");
        assertThat(push(xml("wecom-ext-image", "7950010002", """
                <MsgType><![CDATA[image]]></MsgType>
                <PicUrl><![CDATA[http://wecom.img/p1.jpg]]></PicUrl>
                <MediaId><![CDATA[MEDIA_IMG_1]]></MediaId>""")).getResponse().getContentAsString())
            .isEqualTo("success");
        assertThat(push(xml("wecom-ext-voice", "7950010003", """
                <MsgType><![CDATA[voice]]></MsgType>
                <MediaId><![CDATA[MEDIA_VOICE_1]]></MediaId>
                <Format><![CDATA[amr]]></Format>""")).getResponse().getContentAsString())
            .isEqualTo("success");
        assertThat(push(xml("wecom-ext-video", "7950010004", """
                <MsgType><![CDATA[video]]></MsgType>
                <MediaId><![CDATA[MEDIA_VIDEO_1]]></MediaId>
                <ThumbMediaId><![CDATA[THUMB_1]]></ThumbMediaId>""")).getResponse().getContentAsString())
            .isEqualTo("success");
        assertThat(push(xml("wecom-ext-location", "7950010005", """
                <MsgType><![CDATA[location]]></MsgType>
                <Location_X>23.134521</Location_X><Location_Y>113.359419</Location_Y>
                <Scale>20</Scale><Label><![CDATA[广州市天河区]]></Label>""")).getResponse().getContentAsString())
            .isEqualTo("success");
        // 链接消息无 MsgId：外部消息标识按缺失处理，访客与消息照常落库
        assertThat(push(xml("wecom-ext-link", null, """
                <MsgType><![CDATA[link]]></MsgType>
                <Title><![CDATA[打折促销]]></Title>
                <Description><![CDATA[点开查看]]></Description>
                <Url><![CDATA[https://example.com/promo]]></Url>
                <PicUrl><![CDATA[http://wecom.img/l1.jpg]]></PicUrl>""")).getResponse().getContentAsString())
            .isEqualTo("success");

        assertContent("wecom-ext-text", "7950010001", body -> {
            assertThat(body.getStr("type")).isEqualTo("text");
            assertThat(body.getStr("text")).isEqualTo("你好，想咨询发货时间");
        });
        assertContent("wecom-ext-image", "7950010002", body -> {
            assertThat(body.getStr("type")).isEqualTo("image");
            assertThat(body.getJSONObject("media").getStr("kind")).isEqualTo("image");
            assertThat(body.getJSONObject("media").getStr("id")).isEqualTo("MEDIA_IMG_1");
            assertThat(body.getJSONObject("media").getStr("url")).isEqualTo("http://wecom.img/p1.jpg");
        });
        assertContent("wecom-ext-voice", "7950010003", body -> {
            assertThat(body.getStr("type")).isEqualTo("audio");
            assertThat(body.getJSONObject("media").getStr("kind")).isEqualTo("audio");
            assertThat(body.getJSONObject("media").getStr("id")).isEqualTo("MEDIA_VOICE_1");
        });
        assertContent("wecom-ext-video", "7950010004", body -> {
            assertThat(body.getStr("type")).isEqualTo("video");
            assertThat(body.getJSONObject("media").getStr("id")).isEqualTo("MEDIA_VIDEO_1");
        });
        assertContent("wecom-ext-location", "7950010005", body -> {
            assertThat(body.getStr("type")).isEqualTo("location");
            assertThat(body.getStr("label")).isEqualTo("广州市天河区");
            assertThat(body.getDouble("latitude")).isEqualTo(23.134521d);
            assertThat(body.getDouble("longitude")).isEqualTo(113.359419d);
        });
        assertContent("wecom-ext-link", null, body -> {
            assertThat(body.getStr("type")).isEqualTo("link");
            assertThat(body.getStr("title")).isEqualTo("打折促销");
            assertThat(body.getStr("url")).isEqualTo("https://example.com/promo");
            assertThat(body.getStr("description")).isEqualTo("点开查看");
        });

        // 事件推送不是访客消息：只应答 success，不产生访客与消息数据
        assertThat(push(xml("wecom-ext-event", null, """
                <MsgType><![CDATA[event]]></MsgType>
                <Event><![CDATA[subscribe]]></Event>""")).getResponse().getContentAsString())
            .isEqualTo("success");
        assertThat(jdbc.queryForObject(
            "SELECT COUNT(*) FROM visitor WHERE company_id = ? AND external_user_id = 'wecom-ext-event'",
            Integer.class, COMPANY_ID)).isZero();
    }

    @Test
    void sendPersistsRealChannelOutcomeForSuccessAndFailure() throws Exception {
        long visitorId = newVisitor(channelWecom, "wecom-send-ext-1", "想咨询发货时间");

        // 真实发送实现：先取官方 91039 令牌再下发 90236 报文，msgid 回填为渠道消息标识
        JSONObject sent = data(send(scopedToken, visitorId, body("wecom-cr-1", "好的，今天发出")));
        assertThat(sent.getJSONObject("delivery").getStr("state")).isEqualTo("sent");
        Map<String, Object> saved = jdbc.queryForMap("""
            SELECT send_status, external_message_id, failure_reason FROM message
            WHERE visitor_id = ? AND client_request_id = 'wecom-cr-1'
            """, visitorId);
        assertThat(saved.get("send_status")).isEqualTo("sent");
        assertThat(saved.get("external_message_id")).isEqualTo("MSGID_795001");
        assertThat(saved.get("failure_reason")).isNull();
        assertThat(apiRequests.get(0)).startsWith("GET /cgi-bin/gettoken?")
            .contains("corpid=" + CORP_ID).contains("corpsecret=" + CORP_SECRET);
        assertThat(apiRequests.get(1)).startsWith("POST /cgi-bin/message/send?")
            .contains("access_token=accesstoken000001");
        JSONObject payload = JSONUtil.parseObj(sendBodies.get(0));
        assertThat(payload.getStr("touser")).isEqualTo("wecom-send-ext-1");
        assertThat(payload.getStr("msgtype")).isEqualTo("text");
        assertThat(payload.getStr("agentid")).isEqualTo(AGENT_ID);
        assertThat(payload.getJSONObject("text").getStr("content")).isEqualTo("好的，今天发出");

        // 渠道拒绝（官方 90236：全部接收人无效 81013）：失败原因如实落库，不冒成功
        sendBody = SEND_INVALID_USER;
        JSONObject failed = data(send(scopedToken, visitorId, body("wecom-cr-2", "稍等，我查一下")));
        assertThat(failed.getJSONObject("delivery").getStr("state")).isEqualTo("failed");
        assertThat(failed.getJSONObject("delivery").getStr("reason"))
            .isEqualTo("企业微信应用消息发送失败：81013 user not found");
        Map<String, Object> failedRow = jdbc.queryForMap("""
            SELECT send_status, external_message_id, failure_reason FROM message
            WHERE visitor_id = ? AND client_request_id = 'wecom-cr-2'
            """, visitorId);
        assertThat(failedRow.get("send_status")).isEqualTo("failed");
        assertThat(failedRow.get("failure_reason")).isEqualTo("企业微信应用消息发送失败：81013 user not found");
        assertThat(failedRow.get("external_message_id")).isNull();
        // 失败不改接待状态：首次成功回复已转入 waiting，失败保持不变
        assertThat(jdbc.queryForObject("SELECT status FROM visitor WHERE visitor_id = ?", String.class, visitorId))
            .isEqualTo("waiting");
    }

    @Test
    void mediaServesBytesThroughRealReaderAndReportsFailuresHonestly() throws Exception {
        long mediaMessageId = seedMessage(channelWecom, "wecom-media-ext-1",
            Map.of("type", "image", "media", Map.of("kind", "image", "id", "WECOM_MEDIA_1")));

        // 官方 90254 成功：字节与内容类型按渠道响应返回
        MvcResult ok = mvc.perform(get("/api/desk/messages/" + mediaMessageId + "/media")
                .header("Authorization", "Bearer " + scopedToken)).andReturn();
        assertThat(ok.getResponse().getStatus()).isEqualTo(200);
        assertThat(ok.getResponse().getContentAsByteArray()).isEqualTo(IMAGE_BYTES);
        assertThat(ok.getResponse().getContentType()).isEqualTo("image/jpeg");
        assertThat(apiRequests.get(0)).startsWith("GET /cgi-bin/gettoken?")
            .contains("corpid=" + CORP_ID).contains("corpsecret=" + CORP_SECRET);
        assertThat(apiRequests.get(1)).startsWith("GET /cgi-bin/media/get?")
            .contains("access_token=accesstoken000001").contains("media_id=WECOM_MEDIA_1");

        // 官方 90254 错误：errcode 原样透传为 13100，不冒成功也不伪装空字节
        mediaJson = MEDIA_INVALID_ID;
        JSONObject channelError = errorOf(mvc.perform(get("/api/desk/messages/" + mediaMessageId + "/media")
                .header("Authorization", "Bearer " + scopedToken)).andReturn());
        assertThat(channelError.getInt("code")).isEqualTo(13100);
        assertThat(channelError.getStr("msg")).contains("40007").contains("invalid media_id");

        // 未配置素材凭据的账号：如实受限 12200，不发起渠道请求
        long unconfiguredId = seedMessage(channelCallbackOnly, "wecom-media-ext-2",
            Map.of("type", "image", "media", Map.of("kind", "image", "id", "WECOM_MEDIA_2")));
        JSONObject restricted = errorOf(mvc.perform(get("/api/desk/messages/" + unconfiguredId + "/media")
                .header("Authorization", "Bearer " + scopedToken)).andReturn());
        assertThat(restricted.getInt("code")).isEqualTo(12200);
        assertThat(restricted.getStr("msg")).isEqualTo("渠道素材凭据未配置");
        // 未配置凭据的读取不再发起令牌与素材请求
        assertThat(apiRequests).hasSize(4);
    }

    // ---------- 回调报文构造（官方 §3.3/§5.1 与 mock-pulse agent 通道同形） ----------

    // 明文加密后按信封元素序 ToUserName → Encrypt → AgentID 推送，返回回调响应
    private MvcResult push(String plaintextXml) throws Exception {
        String encrypt = encrypt(plaintextXml, CORP_ID);
        String envelope = "<xml><ToUserName><![CDATA[" + CORP_ID + "]]></ToUserName>"
            + "<Encrypt><![CDATA[" + encrypt + "]]></Encrypt>"
            + "<AgentID><![CDATA[" + AGENT_ID + "]]></AgentID></xml>";
        return mvc.perform(post("/api/channels/" + channelWecom + "/callback")
                .params(query(signed(encrypt, null)))
                .contentType(MediaType.valueOf("text/xml")).content(envelope))
            .andReturn();
    }

    // 官方普通消息公共头尾：ToUserName 为企业 CorpID，MsgId 缺省表示该类型本就无此字段
    private String xml(String from, String msgId, String inner) {
        return "<xml><ToUserName><![CDATA[" + CORP_ID + "]]></ToUserName>"
            + "<FromUserName><![CDATA[" + from + "]]></FromUserName>"
            + "<CreateTime>" + DateUtil.currentSeconds() + "</CreateTime>"
            + inner
            + (msgId == null ? "" : "<MsgId>" + msgId + "</MsgId>")
            + "<AgentID>" + AGENT_ID + "</AgentID></xml>";
    }

    private String encrypt(String plaintext, String receiveid) {
        return new WecomProtocol().encrypt(ENCODING_AES_KEY, FIXED_RANDOM,
            plaintext.getBytes(StandardCharsets.UTF_8), receiveid);
    }

    // 四值签名查询参数（官方 §4.2）：签名覆盖 echostr（握手）或信封密文（推送）
    private Map<String, String> signed(String signatureSource, String echostr) {
        String timestamp = String.valueOf(DateUtil.currentSeconds());
        String nonce = "nonce-" + System.nanoTime();
        String[] parts = {TOKEN, timestamp, nonce, signatureSource};
        Arrays.sort(parts);
        Map<String, String> params = new HashMap<>();
        params.put("timestamp", timestamp);
        params.put("nonce", nonce);
        params.put("msg_signature", DigestUtil.sha1Hex(String.join("", parts)));
        if (echostr != null) {
            params.put("echostr", echostr);
        }
        return params;
    }

    private LinkedMultiValueMap<String, String> query(Map<String, String> source) {
        LinkedMultiValueMap<String, String> params = new LinkedMultiValueMap<>();
        source.forEach(params::add);
        return params;
    }

    private Map<String, Object> fullInfo() {
        Map<String, Object> info = new HashMap<>();
        info.put("url", "https://dudu.example.com/api/channels/wecom-full/callback");
        info.put("corpId", CORP_ID);
        info.put("token", TOKEN);
        info.put("encodingAesKey", ENCODING_AES_KEY);
        info.put("agentId", AGENT_ID);
        info.put("corpSecret", CORP_SECRET);
        return info;
    }

    // ---------- Desk 侧公共小工具（与既有集成测试同口径） ----------

    private void assertContent(String externalUserId, String externalMessageId,
                               java.util.function.Consumer<JSONObject> assertions) {
        Map<String, Object> row = jdbc.queryForMap("""
            SELECT m.* FROM message m JOIN visitor v ON v.visitor_id = m.visitor_id
            WHERE v.external_user_id = ? ORDER BY m.sequence DESC LIMIT 1
            """, externalUserId);
        assertThat(row.get("direction")).isEqualTo("incoming");
        if (externalMessageId == null) {
            assertThat(row.get("external_message_id")).isNull();
        } else {
            assertThat(row.get("external_message_id")).isEqualTo(externalMessageId);
        }
        assertions.accept(JSONUtil.parseObj(row.get("content").toString()));
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

    private JSONObject send(String token, long visitorId, String body) throws Exception {
        return JSONUtil.parseObj(mvc.perform(post("/api/desk/visitors/" + visitorId + "/messages")
                .header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isOk())
            .andReturn().getResponse().getContentAsString());
    }

    private String body(String clientRequestId, String text) {
        return JSONUtil.createObj().set("clientRequestId", clientRequestId).set("text", text).toString();
    }

    private JSONObject errorOf(MvcResult result) throws Exception {
        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        return JSONUtil.parseObj(result.getResponse().getContentAsString());
    }
}
