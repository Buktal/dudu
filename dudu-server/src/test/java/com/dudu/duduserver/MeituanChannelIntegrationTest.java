package com.dudu.duduserver;

import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.dudu.duduserver.channel.ChannelInboundMessage;
import com.dudu.duduserver.channel.meituan.MeituanProtocol;
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
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.util.LinkedMultiValueMap;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * 美团渠道在共享评审 MySQL 与真实 HTTP 边界验收（docs/research/channels/meituan.md §3、
 * §4.1、§5、§8；mock-pulse 探针语义同构）：POST 表单推送按重建回调 URL 验签——合法探针
 * （GOLDEN_PROBE_BODY 字段值）放行、伪造签名 403、缺 app_secret 不支持、未知账号 404；
 * IM 单聊按契约统一落库、订单/门店/群聊推送只应答；纯文本 msg/send 经真实发送实现打到
 * 本地替身（系统级签名与家族错误形状如实落库）；素材按未实锤边界与凭据缺失如实受限。
 * 评审库在共享服务器上自建自删：测试开始先重置为全新库。
 */
@SpringBootTest(properties = {"dudu.auth.jwt-secret=integration-test-secret"},
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureMockMvc
@EnabledIfEnvironmentVariable(named = "DUDU_INTEGRATION_TEST", matches = "true")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class MeituanChannelIntegrationTest extends DeskIntegrationSupport {

    private static final long COMPANY_ID = 799001L;
    // 待签串含完整回调 URL（§8 第 1 条）：测试显式指定 Host，适配器按同一规则重建
    private static final String HOST = "callback.dudu.local";
    private static final String APP_ID = "mt-app-799001";
    private static final String APP_SECRET = "mt-secret-799001";
    // mock-pulse 推送探针（GOLDEN_PROBE_BODY）字段值逐字：官方订单核验样本
    private static final String PROBE_POI = "668921";
    private static final String PROBE_ORDER_ID = "27061900338318741";

    // 共享评审服务器：dudu_review 用户只授权 dudu_review_%.*，本渠道用 109 号库
    private static final String SERVER_JDBC_URL = "jdbc:mysql://127.0.0.1:3306";
    private static final String REVIEW_DB = "dudu_review_109";
    private static final String REVIEW_USER = "dudu_review";
    private static final String REVIEW_PASSWORD = "dudu_review_local";

    // 官方家族错误形状（§5.6 逐字）：data:ng + error{code,msg}
    private static final String SEND_OK = "{}";
    private static final String SEND_REJECTED =
        "{\"data\": \"ng\", \"error\": { \"code\": 808, \"msg\": \"操作失败，订单支付状态发生变化，不能同意退款, wm_order_id=790579611172872\" }}";

    // 渠道发送替身：静态启动一次，地址经 dudu.channel.meituan.api-base 注入真实发送实现
    private static final HttpServer API = startApiStub();
    private static final List<String> apiRequests = new CopyOnWriteArrayList<>();
    private static final List<String> sendBodies = new CopyOnWriteArrayList<>();
    private static volatile String sendBody = SEND_OK;

    private static HttpServer startApiStub() {
        try {
            HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            // 官方 msg/send：POST 表单，错误形状缺席即成功（§8 第 5 条口径）
            server.createContext("/msg/send", exchange -> {
                apiRequests.add(exchange.getRequestMethod() + " " + exchange.getRequestURI().getPath());
                sendBodies.add(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
                byte[] body = sendBody.getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
                exchange.sendResponseHeaders(200, body.length);
                exchange.getResponseBody().write(body);
                exchange.close();
            });
            server.start();
            return server;
        } catch (IOException e) {
            throw new IllegalStateException("美团 API 替身启动失败", e);
        }
    }

    @DynamicPropertySource
    static void contextProperties(DynamicPropertyRegistry registry) {
        resetReviewDatabase();
        registry.add("spring.datasource.url",
            () -> SERVER_JDBC_URL + "/" + REVIEW_DB + "?connectionTimeZone=Asia/Shanghai&characterEncoding=UTF-8");
        registry.add("spring.datasource.username", () -> REVIEW_USER);
        registry.add("spring.datasource.password", () -> REVIEW_PASSWORD);
        // 真实发送实现全程走本地替身：请求与响应都按官方接口形状对拍
        registry.add("dudu.channel.meituan.api-base", () -> "http://127.0.0.1:" + API.getAddress().getPort());
    }

    // 共享评审库自建自删：开始先重置为全新库，Flyway 空库迁移建表
    private static void resetReviewDatabase() {
        try (Connection connection = DriverManager.getConnection(SERVER_JDBC_URL, REVIEW_USER, REVIEW_PASSWORD);
             Statement statement = connection.createStatement()) {
            statement.execute("DROP DATABASE IF EXISTS " + REVIEW_DB);
            statement.execute("CREATE DATABASE " + REVIEW_DB + " CHARACTER SET utf8mb4");
        } catch (SQLException e) {
            throw new IllegalStateException("评审库重置失败：" + REVIEW_DB, e);
        }
    }

    @Autowired DeskInboundService deskInboundService;
    @Autowired JdbcTemplate jdbc;

    private final MeituanProtocol protocol = new MeituanProtocol();

    private String scopedToken;
    private long channelMeituan;
    private long channelOnlyAppId;

    @BeforeAll
    void seed() throws Exception {
        companies.createCompany(company(COMPANY_ID, "meituanowner", "美团验收企业"), 1L);
        UserGroupDO group = group(COMPANY_ID, "美团组");
        channelMeituan = channel(COMPANY_ID, group.getGroupId(), ChannelEnum.MEITUAN, "美团", fullInfo());
        // 只配 app_id 的账号：无法验签也不可发送/读素材，能力限制按真实原因说明
        channelOnlyAppId = channel(COMPANY_ID, group.getGroupId(), ChannelEnum.MEITUAN, "半配置美团",
            Map.of("app_id", APP_ID));
        UserDO scoped = plainUser(COMPANY_ID, "meituan.scoped", "坐席甲");
        members.save(member(COMPANY_ID, scoped.getUserId(), group.getGroupId()));
        scopedToken = login(COMPANY_ID, "meituan.scoped");
    }

    @BeforeEach
    void resetStubAndDeskData() {
        apiRequests.clear();
        sendBodies.clear();
        sendBody = SEND_OK;
        // 类级共享评审库跨用例残留清理：本企业 Desk 数据每个用例前清空
        jdbc.update("DELETE FROM message WHERE visitor_id IN"
            + " (SELECT visitor_id FROM visitor WHERE company_id = ?)", COMPANY_ID);
        jdbc.update("DELETE FROM visitor_profile WHERE visitor_id IN"
            + " (SELECT visitor_id FROM visitor WHERE company_id = ?)", COMPANY_ID);
        jdbc.update("DELETE FROM visitor WHERE company_id = ?", COMPANY_ID);
    }

    @Test
    void handshakeProbesVerifySignatureOverTheRebuiltCallbackUrl() throws Exception {
        // mock-pulse 探针语义（GOLDEN_PROBE_BODY 字段值逐字）：order_id 家族按事件回小写 ok
        Map<String, String> probe = new HashMap<>();
        probe.put("app_poi_code", PROBE_POI);
        probe.put("order_id", PROBE_ORDER_ID);
        MvcResult ok = mvc.perform(post("/api/channels/" + channelMeituan + "/callback")
                .header("Host", HOST)
                .params(encoded(signed(channelMeituan, probe)))
                .contentType(MediaType.APPLICATION_FORM_URLENCODED))
            .andReturn();
        assertThat(ok.getResponse().getStatus()).isEqualTo(200);
        assertThat(ok.getResponse().getContentAsString()).isEqualTo("{\"data\":\"ok\"}");

        // 伪造签名拒绝，且不产生访客数据
        Map<String, String> forged = signed(channelMeituan, probe);
        forged.put("sig", "0".repeat(32));
        MvcResult rejected = mvc.perform(post("/api/channels/" + channelMeituan + "/callback")
                .header("Host", HOST)
                .params(encoded(forged))
                .contentType(MediaType.APPLICATION_FORM_URLENCODED))
            .andReturn();
        assertThat(rejected.getResponse().getStatus()).isEqualTo(403);

        // 缺 app_secret 无法验签按不支持应答；未知账号按不存在应答
        MvcResult unconfigured = mvc.perform(post("/api/channels/" + channelOnlyAppId + "/callback")
                .header("Host", HOST)
                .params(encoded(signed(channelOnlyAppId, probe)))
                .contentType(MediaType.APPLICATION_FORM_URLENCODED))
            .andReturn();
        assertThat(unconfigured.getResponse().getStatus()).isEqualTo(501);
        assertThat(mvc.perform(post("/api/channels/99999999/callback")
                .header("Host", HOST)
                .params(encoded(signed(channelMeituan, probe)))
                .contentType(MediaType.APPLICATION_FORM_URLENCODED))
            .andReturn().getResponse().getStatus()).isEqualTo(404);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM visitor", Integer.class)).isZero();
    }

    @Test
    void receiveMapsImChatIntoUnifiedBodyAndOnlyAnswersEvents() throws Exception {
        // IM 单聊（§5.4 字段逐字）：200 {"data":"OK"}，统一消息体落库
        Map<String, String> chat = new HashMap<>();
        chat.put("biz_type", "1");
        chat.put("app_poi_code", PROBE_POI);
        chat.put("push_content", "你好，在吗？");
        chat.put("extended_field", "example");
        assertThat(push(channelMeituan, chat)).isEqualTo("{\"data\":\"OK\"}");
        assertContent(PROBE_POI, body -> {
            assertThat(body.getStr("type")).isEqualTo("text");
            assertThat(body.getStr("text")).isEqualTo("你好，在吗？");
        });

        // 订单推送（§5.3 字段逐字，中文经编码传输）：只应答小写 ok，不落访客数据
        Map<String, String> order = new HashMap<>();
        order.put("order_id", PROBE_ORDER_ID);
        order.put("order_tag_list", "8");
        order.put("wm_order_id_view", PROBE_ORDER_ID);
        order.put("app_poi_code", PROBE_POI);
        order.put("wm_poi_name", "药品01店");
        order.put("recipient_phone", "13812345678_1236");
        order.put("pay_type", "2");
        assertThat(push(channelMeituan, order)).isEqualTo("{\"data\":\"ok\"}");

        // 门店绑定（§5.5 字段逐字）与群聊 biz_type=4：同样只应答
        Map<String, String> store = new HashMap<>();
        store.put("op_type", "1");
        store.put("poi_info", "{\"app_poi_code\":\"668921\",\"poi_name\":\"药品01店\"}");
        store.put("op_time", "1583393145");
        store.put("op_source", "商家账号信息");
        assertThat(push(channelMeituan, store)).isEqualTo("{\"data\":\"ok\"}");
        Map<String, String> groupChat = new HashMap<>(chat);
        groupChat.put("biz_type", "4");
        assertThat(push(channelMeituan, groupChat)).isEqualTo("{\"data\":\"OK\"}");

        // 事件与群聊都不产生访客：只有单聊的 668921 一个访客
        Integer visitors = jdbc.queryForObject("SELECT COUNT(*) FROM visitor", Integer.class);
        assertThat(visitors).isEqualTo(1);
        assertThat(jdbc.queryForObject(
            "SELECT COUNT(*) FROM message WHERE direction = 'incoming'", Integer.class)).isEqualTo(1);
    }

    @Test
    void sendPersistsRealChannelOutcomeForSuccessAndFailure() throws Exception {
        long visitorId = newVisitor(channelMeituan, PROBE_POI, "想咨询发货时间");

        // 真实发送实现：form 下发 msg/send，错误形状缺席即成功（无消息标识）
        JSONObject sent = data(send(scopedToken, visitorId, body("mt-cr-1", "好的，今天发出")));
        assertThat(sent.getJSONObject("delivery").getStr("state")).isEqualTo("sent");
        Map<String, Object> saved = jdbc.queryForMap("""
            SELECT send_status, external_message_id, failure_reason FROM message
            WHERE visitor_id = ? AND client_request_id = 'mt-cr-1'
            """, visitorId);
        assertThat(saved.get("send_status")).isEqualTo("sent");
        assertThat(saved.get("external_message_id")).isNull();
        assertThat(saved.get("failure_reason")).isNull();
        assertThat(apiRequests.get(0)).isEqualTo("POST /msg/send");

        // 请求报文按官方口径：应用级同名词法 + 系统级三件，sig 对替身地址全参参签
        Map<String, String> form = formFields(sendBodies.get(0));
        assertThat(form.get("biz_type")).isEqualTo("1");
        assertThat(form.get("app_poi_code")).isEqualTo(PROBE_POI);
        assertThat(form.get("push_content")).isEqualTo("好的，今天发出");
        assertThat(form.get("app_id")).isEqualTo(APP_ID);
        assertThat(form.get("timestamp")).matches("\\d{10}");
        Map<String, String> withoutSig = new HashMap<>(form);
        withoutSig.remove("sig");
        assertThat(form.get("sig")).isEqualTo(protocol.sign(
            "http://127.0.0.1:" + API.getAddress().getPort() + "/msg/send", withoutSig, APP_SECRET));

        // 渠道拒绝（§5.6 家族错误形状）：失败原因如实落库，不冒成功
        sendBody = SEND_REJECTED;
        JSONObject failed = data(send(scopedToken, visitorId, body("mt-cr-2", "稍等，我查一下")));
        assertThat(failed.getJSONObject("delivery").getStr("state")).isEqualTo("failed");
        assertThat(failed.getJSONObject("delivery").getStr("reason")).startsWith("美团消息发送失败：808 操作失败");
        Map<String, Object> failedRow = jdbc.queryForMap("""
            SELECT send_status, external_message_id, failure_reason FROM message
            WHERE visitor_id = ? AND client_request_id = 'mt-cr-2'
            """, visitorId);
        assertThat(failedRow.get("send_status")).isEqualTo("failed");
        assertThat(failedRow.get("external_message_id")).isNull();
        // 失败不改接待状态：首次成功回复已转入 waiting，失败保持不变
        assertThat(jdbc.queryForObject("SELECT status FROM visitor WHERE visitor_id = ?", String.class, visitorId))
            .isEqualTo("waiting");
    }

    @Test
    void mediaReportsMissingCredentialsAndUnconfirmedApiHonestly() throws Exception {
        // 半配置账号：凭据缺失如实受限 12200，不发起渠道请求
        long restrictedId = seedMessage(channelOnlyAppId, "7990019101",
            Map.of("type", "image", "media", Map.of("kind", "image", "id", "media-1")));
        JSONObject restricted = errorOf(mvc.perform(get("/api/desk/messages/" + restrictedId + "/media")
                .header("Authorization", "Bearer " + scopedToken)).andReturn());
        assertThat(restricted.getInt("code")).isEqualTo(12200);
        assertThat(restricted.getStr("msg")).isEqualTo("渠道素材凭据未配置");

        // 凭据齐备的账号：官方素材接口未实锤，如实返回失败原因，不伪装字节（票面要点 4）
        long mediaMessageId = seedMessage(channelMeituan, "7990019102",
            Map.of("type", "image", "media", Map.of("kind", "image", "id", "media-2")));
        JSONObject honest = errorOf(mvc.perform(get("/api/desk/messages/" + mediaMessageId + "/media")
                .header("Authorization", "Bearer " + scopedToken)).andReturn());
        assertThat(honest.getInt("code")).isEqualTo(13100);
        assertThat(honest.getStr("msg")).isEqualTo("美团渠道素材接口未实锤，暂无法读取素材");
        // 媒体受限全程未发起任何渠道请求
        assertThat(apiRequests).isEmpty();
    }

    // ---------- 回调报文构造（官方 §5 载荷原文形状与 mock-pulse 适配器同形） ----------

    // 美团推送：POST 表单参数（容器一次解码后的值参签，请求线路上按 URL 编码传输）
    private String push(long channelId, Map<String, String> form) throws Exception {
        return mvc.perform(post("/api/channels/" + channelId + "/callback")
                .header("Host", HOST)
                .params(encoded(signed(channelId, form)))
                .contentType(MediaType.APPLICATION_FORM_URLENCODED))
            .andReturn().getResponse().getContentAsString();
    }

    // 按官方五步现算 sig：解码值 + 重建回调 URL（http://host/api/channels/{id}/callback）
    private Map<String, String> signed(long channelId, Map<String, String> form) {
        form.put("app_id", APP_ID);
        form.put("timestamp", "1760000000");
        String url = "http://" + HOST + "/api/channels/" + channelId + "/callback";
        form.put("sig", protocol.sign(url, form, APP_SECRET));
        return form;
    }

    // 线路编码：容器按 application/x-www-form-urlencoded 解码一次后还原出参签用的解码值
    private LinkedMultiValueMap<String, String> encoded(Map<String, String> form) {
        LinkedMultiValueMap<String, String> params = new LinkedMultiValueMap<>();
        form.forEach((key, value) -> params.add(key, URLEncoder.encode(value, StandardCharsets.UTF_8)));
        return params;
    }

    // form 表单还原：按 & 与 = 切分后逐段 URLDecode
    private Map<String, String> formFields(String body) {
        Map<String, String> fields = new HashMap<>();
        for (String pair : body.split("&")) {
            int eq = pair.indexOf('=');
            fields.put(URLDecoder.decode(pair.substring(0, eq), StandardCharsets.UTF_8),
                URLDecoder.decode(pair.substring(eq + 1), StandardCharsets.UTF_8));
        }
        return fields;
    }

    private Map<String, Object> fullInfo() {
        Map<String, Object> info = new HashMap<>();
        info.put("app_id", APP_ID);
        info.put("app_secret", APP_SECRET);
        return info;
    }

    // ---------- Desk 侧公共小工具（与既有集成测试同口径） ----------

    private void assertContent(String externalUserId, java.util.function.Consumer<JSONObject> assertions) {
        Map<String, Object> row = jdbc.queryForMap("""
            SELECT m.* FROM message m JOIN visitor v ON v.visitor_id = m.visitor_id
            WHERE v.external_user_id = ? ORDER BY m.sequence DESC LIMIT 1
            """, externalUserId);
        assertThat(row.get("direction")).isEqualTo("incoming");
        assertThat(row.get("external_message_id")).isNull();
        assertions.accept(JSONUtil.parseObj(row.get("content").toString()));
    }

    private long newVisitor(long channelId, String externalUserId, String firstText) {
        deskInboundService.accept(channels.getById(channelId), new ChannelInboundMessage(channelId, externalUserId,
            null, null, List.of(), null, MessageDirectionEnum.INCOMING,
            Map.of("type", "text", "text", firstText)));
        return jdbc.queryForObject(
            "SELECT visitor_id FROM visitor WHERE company_id = ? AND company_channel_id = ? AND external_user_id = ?",
            Long.class, COMPANY_ID, channelId, externalUserId);
    }

    private long seedMessage(long channelId, String externalUserId, Map<String, Object> content) {
        deskInboundService.accept(channels.getById(channelId), new ChannelInboundMessage(channelId, externalUserId,
            null, null, List.of(), null, MessageDirectionEnum.INCOMING, content));
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
