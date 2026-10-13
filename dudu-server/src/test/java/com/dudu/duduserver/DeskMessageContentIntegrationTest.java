package com.dudu.duduserver;

import cn.hutool.core.date.DateUtil;
import cn.hutool.crypto.digest.DigestUtil;
import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.dudu.duduserver.constant.ChannelEnum;
import com.dudu.duduserver.dto.CompanyAdminInitDTO;
import com.dudu.duduserver.dto.CompanyCreateDTO;
import com.dudu.duduserver.entity.CompanyChannelDO;
import com.dudu.duduserver.entity.UserGroupDO;
import com.dudu.duduserver.service.CompanyChannelService;
import com.dudu.duduserver.service.CompanyService;
import com.dudu.duduserver.service.UserGroupService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.time.Duration;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 多类型入站内容在独立 MySQL、真实 HTTP 与真实 WebSocket 边界验收：按公众号事实构造的
 * 受控 XML 样本（image/voice/video/shortvideo/location/link 与未知类型）映射为契约第 4 节
 * content 并持久化、摘要规则正确、历史查询与实时推送展示一致、重登读取一致；
 * 只保存结构化字段与媒体引用，不保存渠道原始载荷与媒体字节。运行前需重建 dudu_review。
 */
@SpringBootTest(properties = {"dudu.auth.jwt-secret=integration-test-secret"},
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureMockMvc
@EnabledIfEnvironmentVariable(named = "DUDU_INTEGRATION_TEST", matches = "true")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class DeskMessageContentIntegrationTest {

    private static final String PASSWORD = "password123";
    private static final long COMPANY_ID = 790001L;
    private static final String CALLBACK_TOKEN = "content-callback-token";

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> System.getenv("DUDU_TEST_JDBC_URL"));
        registry.add("spring.datasource.username", () -> "root");
        registry.add("spring.datasource.password", () -> System.getenv("DUDU_TEST_DB_PASSWORD"));
    }

    @LocalServerPort int port;
    @Autowired MockMvc mvc;
    @Autowired CompanyService companies;
    @Autowired UserGroupService groups;
    @Autowired CompanyChannelService channels;
    @Autowired JdbcTemplate jdbc;

    private long channelWechat;
    private String ownerToken;

    private final List<WebSocketSession> openSessions = new ArrayList<>();

    @BeforeAll
    void seed() throws Exception {
        companies.createCompany(new CompanyCreateDTO(String.valueOf(COMPANY_ID), "内容验收企业", null, null, null,
            new CompanyAdminInitDTO("contentowner", PASSWORD, null)), 1L);
        UserGroupDO group = group(COMPANY_ID, "内容组");
        channelWechat = channel(COMPANY_ID, group.getGroupId(), ChannelEnum.WECHAT_MP, "内容公众号",
            Map.of("token", CALLBACK_TOKEN, "appId", "wx_content_appid", "appSecret", "content-secret"));
        ownerToken = login();
    }

    @AfterEach
    void closeSockets() throws Exception {
        for (WebSocketSession session : openSessions) {
            if (session.isOpen()) {
                session.close(CloseStatus.NORMAL);
            }
        }
        openSessions.clear();
    }

    @Test
    void channelSamplesPersistStructuredContentAndFollowTheSummaryRules() throws Exception {
        long visitorId = push("content-image", imagePush("content-image", "MEDIA_IMAGE", "http://mmbiz.qpic.cn/pic", "4001"));
        JSONObject image = content(visitorId, 1);
        assertThat(image.getStr("type")).isEqualTo("image");
        // 只保存渠道标识、公开链接与类型，不保存 PicUrl 之外的渠道载荷与媒体字节
        Map<String, Object> imageMedia = image.getJSONObject("media");
        assertThat(imageMedia).containsOnlyKeys("kind", "id", "url");
        assertThat(imageMedia.get("kind")).isEqualTo("image");
        assertThat(imageMedia.get("id")).isEqualTo("MEDIA_IMAGE");
        assertThat(imageMedia.get("url")).isEqualTo("http://mmbiz.qpic.cn/pic");
        assertThat(previewOf(visitorId)).isEqualTo("图片");

        long voiceVisitor = push("content-voice", voicePush("content-voice", "MEDIA_VOICE", "amr", "4002"));
        JSONObject voice = content(voiceVisitor, 1);
        assertThat(voice.getStr("type")).isEqualTo("audio");
        Map<String, Object> voiceMedia = voice.getJSONObject("media");
        assertThat(voiceMedia).containsOnlyKeys("kind", "id");
        assertThat(voiceMedia.get("id")).isEqualTo("MEDIA_VOICE");
        assertThat(previewOf(voiceVisitor)).isEqualTo("语音");

        long videoVisitor = push("content-video", videoPush("content-video", "video", "MEDIA_VIDEO", "4003"));
        assertThat(content(videoVisitor, 1).getStr("type")).isEqualTo("video");
        assertThat(previewOf(videoVisitor)).isEqualTo("视频");

        // 小视频与视频同族，按 video 分支映射
        long shortVisitor = push("content-shortvideo", videoPush("content-shortvideo", "shortvideo", "MEDIA_SHORT", "4004"));
        JSONObject shortVideo = content(shortVisitor, 1);
        assertThat(shortVideo.getStr("type")).isEqualTo("video");
        assertThat((Map<String, Object>) shortVideo.getJSONObject("media")).containsEntry("id", "MEDIA_SHORT");

        long locationVisitor = push("content-location", locationPush("content-location", "广州市海珠区客村", "4005"));
        JSONObject location = content(locationVisitor, 1);
        assertThat(location.getStr("type")).isEqualTo("location");
        assertThat(location.getDouble("latitude")).isEqualTo(23.134521d);
        assertThat(location.getDouble("longitude")).isEqualTo(113.358803d);
        assertThat(location.getStr("label")).isEqualTo("广州市海珠区客村");
        assertThat(previewOf(locationVisitor)).isEqualTo("广州市海珠区客村");

        long linkVisitor = push("content-link", linkPush("content-link", "活动页", "限时活动说明", "http://example.com/act", "4006"));
        JSONObject link = content(linkVisitor, 1);
        assertThat(link.getStr("type")).isEqualTo("link");
        assertThat(link.getStr("title")).isEqualTo("活动页");
        assertThat(link.getStr("url")).isEqualTo("http://example.com/act");
        assertThat(link.getStr("description")).isEqualTo("限时活动说明");
        assertThat(previewOf(linkVisitor)).isEqualTo("活动页");

        // 无法映射的消息类型如实保存为 unknown，只保留必要原始字段
        long unknownVisitor = push("content-unknown", unknownPush("content-unknown", "sticker", "4007"));
        JSONObject unknown = content(unknownVisitor, 1);
        assertThat(unknown.getStr("type")).isEqualTo("unknown");
        assertThat(unknown.getStr("originalType")).isEqualTo("sticker");
        assertThat((Map<String, Object>) unknown).containsOnlyKeys("type", "originalType");
        assertThat(previewOf(unknownVisitor)).isEmpty();
    }

    @Test
    void historyLivePushAndFreshLoginShowTheSameBodyForNonTextMessages() throws Exception {
        SocketClient client = connectAndAuth();
        String msgId = "msg-" + System.nanoTime();
        long visitorId = push("content-consistent", imagePush("content-consistent", "MEDIA_CONSISTENT", "http://mmbiz.qpic.cn/pic2", msgId));

        JSONObject frame = client.next(Duration.ofSeconds(5));
        assertThat((Object) frame).isNotNull();
        assertThat(frame.getStr("type")).isEqualTo("message");
        JSONObject pushed = frame.getJSONObject("message");
        assertThat(pushed.getJSONObject("body").getStr("type")).isEqualTo("image");
        assertThat(frame.getJSONObject("conversation").getStr("preview")).isEqualTo("图片");

        JSONObject stored = JSONUtil.parseObj(jdbc.queryForMap(
            "SELECT content FROM message WHERE visitor_id = ?", visitorId).get("content"));

        JSONObject history = history(visitorId, ownerToken).getJSONArray("items").getJSONObject(0);
        assertThat((Map<String, Object>) history.getJSONObject("body")).isEqualTo(stored);
        assertThat((Map<String, Object>) history.getJSONObject("body")).isEqualTo(pushed.getJSONObject("body"));

        // 重登后读取持久结果，展示与首次一致
        String freshToken = login();
        JSONObject relogin = history(visitorId, freshToken).getJSONArray("items").getJSONObject(0);
        assertThat((Map<String, Object>) relogin.getJSONObject("body")).isEqualTo(stored);
    }

    private long push(String externalUserId, String xml) throws Exception {
        assertThat(callback(xml)).isEqualTo(200);
        return jdbc.queryForObject(
            "SELECT visitor_id FROM visitor WHERE company_id = ? AND external_user_id = ?",
            Long.class, COMPANY_ID, externalUserId);
    }

    private JSONObject content(long visitorId, int sequence) {
        return JSONUtil.parseObj(jdbc.queryForMap(
            "SELECT content FROM message WHERE visitor_id = ? AND sequence = ?", visitorId, sequence)
            .get("content"));
    }

    private String previewOf(long visitorId) {
        return jdbc.queryForObject("SELECT last_message_preview FROM visitor WHERE visitor_id = ?",
            String.class, visitorId);
    }

    private int callback(String body) throws Exception {
        return mvc.perform(post("/api/channels/" + channelWechat + "/callback").params(queryParams(signedParams()))
                .contentType(MediaType.valueOf("text/xml")).content(body))
            .andReturn().getResponse().getStatus();
    }

    private JSONObject history(long visitorId, String token) throws Exception {
        String body = mvc.perform(get("/api/desk/visitors/" + visitorId + "/messages")
                .header("Authorization", "Bearer " + token))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        JSONObject response = JSONUtil.parseObj(body);
        assertThat(response.getInt("code")).isZero();
        return response.getJSONObject("data");
    }

    private LinkedMultiValueMap<String, String> queryParams(Map<String, String> source) {
        LinkedMultiValueMap<String, String> params = new LinkedMultiValueMap<>();
        source.forEach(params::add);
        return params;
    }

    private Map<String, String> signedParams() {
        Map<String, String> params = new java.util.HashMap<>();
        String timestamp = String.valueOf(DateUtil.currentSeconds());
        String nonce = "nonce-" + System.nanoTime();
        params.put("timestamp", timestamp);
        params.put("nonce", nonce);
        params.put("signature", signature(CALLBACK_TOKEN, timestamp, nonce));
        return params;
    }

    private String signature(String token, String timestamp, String nonce) {
        String[] parts = {token, timestamp, nonce};
        Arrays.sort(parts);
        return DigestUtil.sha1Hex(String.join("", parts));
    }

    // 受控渠道样本：字段与结构按 docs/research/channels/wechat-mp.md §2.1、§5 的官方原文构造
    private String imagePush(String from, String mediaId, String picUrl, String msgId) {
        return """
            <xml><ToUserName><![CDATA[gh_content]]></ToUserName><FromUserName><![CDATA[%s]]></FromUserName>
            <CreateTime>%d</CreateTime><MsgType><![CDATA[image]]></MsgType>
            <PicUrl><![CDATA[%s]]></PicUrl><MediaId><![CDATA[%s]]></MediaId><MsgId>%s</MsgId></xml>
            """.formatted(from, DateUtil.currentSeconds(), picUrl, mediaId, msgId);
    }

    private String voicePush(String from, String mediaId, String format, String msgId) {
        return """
            <xml><ToUserName><![CDATA[gh_content]]></ToUserName><FromUserName><![CDATA[%s]]></FromUserName>
            <CreateTime>%d</CreateTime><MsgType><![CDATA[voice]]></MsgType>
            <MediaId><![CDATA[%s]]></MediaId><Format><![CDATA[%s]]></Format>
            <MediaId16K><![CDATA[%s-16k]]></MediaId16K><MsgId>%s</MsgId></xml>
            """.formatted(from, DateUtil.currentSeconds(), mediaId, format, mediaId, msgId);
    }

    private String videoPush(String from, String msgType, String mediaId, String msgId) {
        return """
            <xml><ToUserName><![CDATA[gh_content]]></ToUserName><FromUserName><![CDATA[%s]]></FromUserName>
            <CreateTime>%d</CreateTime><MsgType><![CDATA[%s]]></MsgType>
            <MediaId><![CDATA[%s]]></MediaId><ThumbMediaId><![CDATA[thumb-%s]]></ThumbMediaId>
            <MsgId>%s</MsgId></xml>
            """.formatted(from, DateUtil.currentSeconds(), msgType, mediaId, mediaId, msgId);
    }

    private String locationPush(String from, String label, String msgId) {
        return """
            <xml><ToUserName><![CDATA[gh_content]]></ToUserName><FromUserName><![CDATA[%s]]></FromUserName>
            <CreateTime>%d</CreateTime><MsgType><![CDATA[location]]></MsgType>
            <Location_X>23.134521</Location_X><Location_Y>113.358803</Location_Y><Scale>20</Scale>
            <Label><![CDATA[%s]]></Label><MsgId>%s</MsgId></xml>
            """.formatted(from, DateUtil.currentSeconds(), label, msgId);
    }

    private String linkPush(String from, String title, String description, String url, String msgId) {
        return """
            <xml><ToUserName><![CDATA[gh_content]]></ToUserName><FromUserName><![CDATA[%s]]></FromUserName>
            <CreateTime>%d</CreateTime><MsgType><![CDATA[link]]></MsgType>
            <Title><![CDATA[%s]]></Title><Description><![CDATA[%s]]></Description>
            <Url><![CDATA[%s]]></Url><MsgId>%s</MsgId></xml>
            """.formatted(from, DateUtil.currentSeconds(), title, description, url, msgId);
    }

    private String unknownPush(String from, String msgType, String msgId) {
        return """
            <xml><ToUserName><![CDATA[gh_content]]></ToUserName><FromUserName><![CDATA[%s]]></FromUserName>
            <CreateTime>%d</CreateTime><MsgType><![CDATA[%s]]></MsgType>
            <Payload><![CDATA[{"raw":"channel-payload"}]]></Payload><MsgId>%s</MsgId></xml>
            """.formatted(from, DateUtil.currentSeconds(), msgType, msgId);
    }

    private SocketClient connectAndAuth() throws Exception {
        SocketClient client = new SocketClient();
        WebSocketSession session = new StandardWebSocketClient()
            .execute(client, "ws://127.0.0.1:" + port + "/ws/desk")
            .get(5, TimeUnit.SECONDS);
        openSessions.add(session);
        client.session = session;
        session.sendMessage(new TextMessage(
            JSONUtil.createObj().set("type", "auth").set("token", ownerToken).toString()));
        assertThat(client.next(Duration.ofSeconds(5)).getStr("type")).isEqualTo("ready");
        return client;
    }

    private String login() throws Exception {
        String body = mvc.perform(post("/api/desk/login").contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"companyId": "%s", "username": "contentowner", "password": "%s"}
                    """.formatted(COMPANY_ID, PASSWORD)))
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

    private static final class SocketClient extends TextWebSocketHandler {

        private final BlockingQueue<JSONObject> frames = new LinkedBlockingQueue<>();
        private WebSocketSession session;

        @Override
        protected void handleTextMessage(WebSocketSession session, TextMessage message) {
            frames.add(JSONUtil.parseObj(message.getPayload()));
        }

        JSONObject next(Duration timeout) throws InterruptedException {
            return frames.poll(timeout.toMillis(), TimeUnit.MILLISECONDS);
        }
    }
}
