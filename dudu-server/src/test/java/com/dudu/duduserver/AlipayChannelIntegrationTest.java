package com.dudu.duduserver;

import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.dudu.duduserver.channel.ChannelInboundMessage;
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

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.Signature;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.concurrent.CopyOnWriteArrayList;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * 支付宝生活号渠道在独立 MySQL 与真实 HTTP 边界验收（事实见 docs/research/channels/
 * alipay.md §2.3、§3.2）：POST 网关验证握手（生活号口径验签通过回签名 XML 信封、篡改
 * 参数拒绝、未配置凭据不支持）、被动通知入站解析落库（text/image 按契约第 4 节统一消息体、
 * UserInfo 名称入库、事件族只应答 ack 不落库）、无 service 的表单推送（mock-pulse 探测
 * 形态，通用口径加签）按 success 应答、纯文本发送成功与渠道失败如实落库、媒体读取经真实
 * 读取实现从媒体网关替身取回图片字节（未配置凭据受限 12200）。报文按官方文档形状构造
 * （§3.2 握手 XML、§2.3 通知 XML 与 ack），签名以本测试自造 RSA 密钥对按官方规则现算
 * ——事实库 §5.1 拼串与 mock-pulse 探测签名值不作验签向量（对拍仅报文形态），渠道 API 用
 * 本地替身按官方响应形状应答，不模拟假成功。运行前需重建 dudu_review_116。
 */
@SpringBootTest(properties = {"dudu.auth.jwt-secret=integration-test-secret"},
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureMockMvc
@EnabledIfEnvironmentVariable(named = "DUDU_INTEGRATION_TEST", matches = "true")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class AlipayChannelIntegrationTest extends DeskIntegrationSupport {

    private static final long COMPANY_ID = 797116L;
    // 测试自造 RSA2 密钥对：channel_info 只存 PKCS#8 私钥（Base64），与生产形状一致
    private static final String APP_ID = "2014072300007148";
    private static final String HANDSHAKE_XML = "<?xml version=\"1.0\" encoding=\"gbk\"?><XML>"
        + "<AppId><![CDATA[" + APP_ID + "]]></AppId><FromUserId></FromUserId>"
        + "<CreateTime><![CDATA[1406083506817]]></CreateTime>"
        + "<MsgType><![CDATA[event]]></MsgType><EventType><![CDATA[verifygw]]></EventType>"
        + "<ActionParam></ActionParam><AgreementId></AgreementId><AccountNo></AccountNo></XML>";
    // 官方 §2.3 被动通知形状：FromAlipayUserId 现用 userid + 已废弃 FromUserId 并存，
    // UserInfo 为 JSON 字符串（logon_id/user_name）
    private static final String TEXT_ENVELOPE = "<?xml version=\"1.0\" encoding=\"GBK\"?><XML>"
        + "<AppId><![CDATA[" + APP_ID + "]]></AppId>"
        + "<FromUserId><![CDATA[2088102123456789]]></FromUserId>"
        + "<FromAlipayUserId><![CDATA[2088102111111111]]></FromAlipayUserId>"
        + "<CreateTime><![CDATA[1406165628612]]></CreateTime>"
        + "<MsgId><![CDATA[9000123456789012]]></MsgId>"
        + "<MsgType><![CDATA[text]]></MsgType>"
        + "<UserInfo><![CDATA[{\"logon_id\":\"zhangsan\",\"user_name\":\"张三\"}]]></UserInfo>"
        + "<Text><Content><![CDATA[你好，想咨询发货时间]]></Content></Text></XML>";
    private static final String IMAGE_ENVELOPE = "<?xml version=\"1.0\" encoding=\"GBK\"?><XML>"
        + "<AppId><![CDATA[" + APP_ID + "]]></AppId>"
        + "<FromAlipayUserId><![CDATA[2088102144444444]]></FromAlipayUserId>"
        + "<CreateTime><![CDATA[1406165628613]]></CreateTime>"
        + "<MsgId><![CDATA[9000123456789013]]></MsgId>"
        + "<MsgType><![CDATA[image]]></MsgType>"
        + "<Image><MediaId><![CDATA[MEDIA_ABC_1]]></MediaId><Format><![CDATA[jpg]]></Format></Image></XML>";
    private static final String FOLLOW_ENVELOPE = "<?xml version=\"1.0\" encoding=\"GBK\"?><XML>"
        + "<AppId><![CDATA[" + APP_ID + "]]></AppId>"
        + "<FromAlipayUserId><![CDATA[2088102111111111]]></FromAlipayUserId>"
        + "<CreateTime><![CDATA[1406165628614]]></CreateTime>"
        + "<MsgType><![CDATA[event]]></MsgType><EventType><![CDATA[follow]]></EventType></XML>";
    private static final String SEND_OK =
        "{\"alipay_open_public_message_custom_send_response\":{\"code\":\"10000\",\"msg\":\"Success\"}}";
    private static final String SEND_REJECTED =
        "{\"alipay_open_public_message_custom_send_response\":{\"code\":\"20000\",\"msg\":\"Failure\","
            + "\"sub_code\":\"isp.usr-interaction-timeout\",\"sub_msg\":\"48 小时内未交互\"}}";
    private static final byte[] IMAGE_BYTES = "alipay-media-bytes".getBytes(StandardCharsets.UTF_8);

    // 渠道 API 替身：静态启动一次，地址经 dudu.channel.alipay.api-base / media-base 注入真实实现
    private static final HttpServer API = startApiStub();
    private static final List<String> apiRequests = new CopyOnWriteArrayList<>();
    private static final List<String> apiBodies = new CopyOnWriteArrayList<>();
    private static volatile String sendBody = SEND_OK;

    @DynamicPropertySource
    static void contextProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> System.getenv("DUDU_TEST_JDBC_URL"));
        // 共享评审库用户可由环境指定，缺省维持本地 root
        registry.add("spring.datasource.username",
            () -> System.getenv().getOrDefault("DUDU_TEST_DB_USER", "root"));
        registry.add("spring.datasource.password", () -> System.getenv("DUDU_TEST_DB_PASSWORD"));
        // 真实发送/媒体实现全程走本地替身：请求与响应都按官方接口形状对拍
        String stubBase = "http://127.0.0.1:" + API.getAddress().getPort();
        registry.add("dudu.channel.alipay.api-base", () -> stubBase);
        registry.add("dudu.channel.alipay.media-base", () -> stubBase);
    }

    private static HttpServer startApiStub() {
        try {
            HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            // 官方 §2.3：POST gateway.do，custom.send 以响应节点 code=10000 表成功
            server.createContext("/gateway.do", exchange -> {
                record(exchange);
                respond(exchange, sendBody, "application/json; charset=utf-8");
            });
            // 官方 §2.3：POST openfile/chat/multimedia.do，成功响应体即图片流（无 JSON 信封）
            server.createContext("/chat/multimedia.do", exchange -> {
                record(exchange);
                exchange.getResponseHeaders().set("Content-Type", "image/jpeg");
                exchange.sendResponseHeaders(200, IMAGE_BYTES.length);
                exchange.getResponseBody().write(IMAGE_BYTES);
                exchange.close();
            });
            server.start();
            return server;
        } catch (IOException e) {
            throw new IllegalStateException("支付宝 API 替身启动失败", e);
        }
    }

    private static void record(HttpExchange exchange) throws IOException {
        apiRequests.add(exchange.getRequestMethod() + " " + exchange.getRequestURI());
        apiBodies.add(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
    }

    private static void respond(HttpExchange exchange, String body, String contentType) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", contentType);
        exchange.sendResponseHeaders(200, bytes.length);
        exchange.getResponseBody().write(bytes);
        exchange.close();
    }

    @Autowired DeskInboundService deskInboundService;

    private static KeyPair keyPair;

    private long channelAlipay;
    private long channelBare;
    private String scopedToken;
    private String stubBase;

    @BeforeAll
    void seed() throws Exception {
        keyPair = KeyPairGenerator.getInstance("RSA").genKeyPair();
        companies.createCompany(company(COMPANY_ID, "alipayowner", "支付宝验收企业"), 1L);
        UserGroupDO group = group(COMPANY_ID, "支付宝组");
        stubBase = "http://127.0.0.1:" + API.getAddress().getPort();
        channelAlipay = channel(COMPANY_ID, group.getGroupId(), ChannelEnum.ALIPAY, "支付宝生活号", fullInfo());
        // 未配置任何渠道凭据的账号：推送不支持、发送与素材读取受限
        channelBare = channel(COMPANY_ID, group.getGroupId(), ChannelEnum.ALIPAY, "裸支付宝",
            Map.of("url", "https://dudu.example.com/api/channels/alipay-bare/callback"));
        UserDO scoped = plainUser(COMPANY_ID, "alipay.scoped", "坐席丙");
        members.save(member(COMPANY_ID, scoped.getUserId(), group.getGroupId()));
        scopedToken = login(COMPANY_ID, "alipay.scoped");
    }

    @BeforeEach
    void resetStub() {
        apiRequests.clear();
        apiBodies.clear();
        sendBody = SEND_OK;
    }

    @Test
    void gatewayCheckActivatesDeveloperModeAndRejectsForgedSignatures() throws Exception {
        // 官方 §3.2：验签通过回签名 XML 信封，biz_content=开发者公钥（由 appPrivateKey 推导）
        MvcResult ok = pushForm(Map.of("service", "alipay.service.check", "charset", "GBK",
            "biz_content", HANDSHAKE_XML), false);
        assertThat(ok.getResponse().getStatus()).isEqualTo(200);
        String body = ok.getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertThat(body).startsWith("<?xml version=\"1.0\" encoding=\"GBK\"?><alipay><response>")
            .contains("<success>true</success>")
            .contains("<biz_content>" + derivedPublicKey() + "</biz_content>")
            .contains("<sign_type>RSA2</sign_type></alipay>");

        // 报文任一参数被篡改（按原报文加签后改写 biz_content 中的 appId）：验签失败按拒绝应答
        String tamperedForm = signedForm(Map.of("service", "alipay.service.check", "charset", "GBK",
            "biz_content", HANDSHAKE_XML), false).replaceFirst(APP_ID, "2014000000000000");
        MvcResult rejected = mvc.perform(post("/api/channels/" + channelAlipay + "/callback")
                .contentType(MediaType.APPLICATION_FORM_URLENCODED).content(tamperedForm)).andReturn();
        assertThat(rejected.getResponse().getStatus()).isEqualTo(403);
        assertThat(rejected.getResponse().getContentAsString(StandardCharsets.UTF_8)).isEmpty();

        // 未配置回调凭据的账号：按不支持应答
        MvcResult unsupported = pushForm(Map.of("service", "alipay.service.check", "charset", "GBK",
            "biz_content", HANDSHAKE_XML), false, channelBare);
        assertThat(unsupported.getResponse().getStatus()).isEqualTo(501);
    }

    @Test
    void receivePersistsTextAndImageMessagesAndOnlyAnswersEvents() throws Exception {
        // 官方 §2.3：被动通知必须同步回无签名 XML ack（不是明文 success）
        MvcResult text = pushForm(Map.of("service", "alipay.mobile.public.message.notify",
            "charset", "GBK", "biz_content", TEXT_ENVELOPE), false);
        assertThat(text.getResponse().getStatus()).isEqualTo(200);
        String ack = text.getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertThat(ack).startsWith("<XML><ToUserId><![CDATA[2088102111111111]]></ToUserId>")
            .contains("<AppId><![CDATA[" + APP_ID + "]]></AppId>")
            .endsWith("<MsgType><![CDATA[ack]]></MsgType></XML>");

        MvcResult image = pushForm(Map.of("service", "alipay.mobile.public.message.notify",
            "charset", "GBK", "biz_content", IMAGE_ENVELOPE), false);
        assertThat(image.getResponse().getContentAsString(StandardCharsets.UTF_8))
            .contains("<ToUserId><![CDATA[2088102144444444]]></ToUserId>")
            .contains("<MsgType><![CDATA[ack]]></MsgType></XML>");

        // 文本落库：external_user_id 取 FromAlipayUserId，UserInfo.user_name 入访客名称，
        // content 按契约第 4 节统一消息体
        Map<String, Object> visitorRow = jdbc.queryForMap(
            "SELECT name FROM visitor WHERE company_id = ? AND external_user_id = '2088102111111111'",
            COMPANY_ID);
        assertThat(visitorRow.get("name")).isEqualTo("张三");
        Map<String, Object> textRow = jdbc.queryForMap("""
            SELECT m.* FROM message m JOIN visitor v ON v.visitor_id = m.visitor_id
            WHERE v.external_user_id = '2088102111111111' ORDER BY m.sequence DESC LIMIT 1
            """);
        assertThat(textRow.get("direction")).isEqualTo("incoming");
        assertThat(textRow.get("external_message_id")).isEqualTo("9000123456789012");
        JSONObject textContent = JSONUtil.parseObj(textRow.get("content").toString());
        assertThat(textContent.getStr("type")).isEqualTo("text");
        assertThat(textContent.getStr("text")).isEqualTo("你好，想咨询发货时间");

        // 图片落库：MediaId 为唯一下载凭据（无公开链接）
        Map<String, Object> imageRow = jdbc.queryForMap("""
            SELECT m.* FROM message m JOIN visitor v ON v.visitor_id = m.visitor_id
            WHERE v.external_user_id = '2088102144444444' ORDER BY m.sequence DESC LIMIT 1
            """);
        JSONObject imageContent = JSONUtil.parseObj(imageRow.get("content").toString());
        assertThat(imageContent.getStr("type")).isEqualTo("image");
        assertThat(imageContent.getJSONObject("media").getStr("kind")).isEqualTo("image");
        assertThat(imageContent.getJSONObject("media").getStr("id")).isEqualTo("MEDIA_ABC_1");

        // 事件回调族不是访客消息：只应答 ack，不产生访客与消息数据
        MvcResult event = pushForm(Map.of("service", "alipay.mobile.public.message.notify",
            "charset", "GBK", "biz_content", FOLLOW_ENVELOPE), false);
        assertThat(event.getResponse().getContentAsString(StandardCharsets.UTF_8))
            .contains("<MsgType><![CDATA[ack]]></MsgType></XML>");
        assertThat(jdbc.queryForObject(
            "SELECT COUNT(*) FROM visitor WHERE company_id = ? AND name = '张三' AND company_channel_id = ?",
            Integer.class, COMPANY_ID, channelAlipay)).isEqualTo(1);

        // mock-pulse 探测（支付通知形态，无 service/biz_content，通用口径加签——其
        // signing_concat 剔除 sign_type，报文形态对拍见 docs/research/channels/alipay.md 附）：
        // 验签通过回明文 success，不产生访客数据
        MvcResult probe = pushForm(Map.of(
            "notify_time", "2018-10-21 15:45:22",
            "notify_type", "trade_status_sync",
            "notify_id", "ac05099524730693a8b330c45cf72da943",
            "charset", "utf-8",
            "version", "1.0",
            "auth_app_id", "2018072300007418",
            "trade_no", "2013112011001004330000121536",
            "app_id", APP_ID,
            "out_trade_no", "6823789339978248"), true);
        assertThat(probe.getResponse().getStatus()).isEqualTo(200);
        assertThat(probe.getResponse().getContentAsString(StandardCharsets.UTF_8)).isEqualTo("success");
        // 探测不产生访客数据：本用例两个外部用户各自恰好一条来信
        assertThat(jdbc.queryForObject(
            "SELECT COUNT(*) FROM message m JOIN visitor v ON v.visitor_id = m.visitor_id "
                + "WHERE v.external_user_id IN ('2088102111111111', '2088102144444444')",
            Integer.class)).isEqualTo(2);
    }

    @Test
    void sendPersistsRealChannelOutcomeForSuccessAndFailure() throws Exception {
        long visitorId = newVisitor(channelAlipay, "alipay-send-ext-1", "想咨询发货时间");

        // 真实发送实现：POST gateway.do 表单，接口不返回消息标识
        JSONObject sent = data(send(scopedToken, visitorId, body("alipay-cr-1", "好的，今天发出")));
        assertThat(sent.getJSONObject("delivery").getStr("state")).isEqualTo("sent");
        Map<String, Object> saved = jdbc.queryForMap("""
            SELECT send_status, external_message_id, failure_reason FROM message
            WHERE visitor_id = ? AND client_request_id = 'alipay-cr-1'
            """, visitorId);
        assertThat(saved.get("send_status")).isEqualTo("sent");
        assertThat(saved.get("external_message_id")).isNull();
        assertThat(saved.get("failure_reason")).isNull();
        assertThat(apiRequests.get(0)).isEqualTo("POST /gateway.do");
        Map<String, String> form = formFields(apiBodies.get(0));
        assertThat(form.get("method")).isEqualTo("alipay.open.public.message.custom.send");
        assertThat(form.get("app_id")).isEqualTo(APP_ID);
        assertThat(form.get("sign_type")).isEqualTo("RSA2");
        assertThat(form.get("version")).isEqualTo("1.0");
        assertThat(JSONUtil.parseObj(form.get("biz_content")).getStr("to_user_id")).isEqualTo("alipay-send-ext-1");
        assertThat(JSONUtil.parseObj(form.get("biz_content")).getStr("msg_type")).isEqualTo("text");
        assertThat(JSONUtil.parseObj(form.get("biz_content")).getJSONObject("text").getStr("content"))
            .isEqualTo("好的，今天发出");
        // 请求签名独立复核：剔除 sign 与空值参数、ASCII 升序 k=v&（sign_type 参与）
        Signature verifier = Signature.getInstance("SHA256withRSA");
        verifier.initVerify(keyPair.getPublic());
        verifier.update(toVerifyString(form, false).getBytes(StandardCharsets.UTF_8));
        assertThat(verifier.verify(Base64.getDecoder().decode(form.get("sign")))).isTrue();

        // 渠道拒绝（code!=10000）：失败原因如实落库，不冒成功
        sendBody = SEND_REJECTED;
        JSONObject failed = data(send(scopedToken, visitorId, body("alipay-cr-2", "稍等，我查一下")));
        assertThat(failed.getJSONObject("delivery").getStr("state")).isEqualTo("failed");
        assertThat(failed.getJSONObject("delivery").getStr("reason"))
            .isEqualTo("支付宝客服消息发送失败：code=20000, msg=Failure, sub_code=isp.usr-interaction-timeout, "
                + "sub_msg=48 小时内未交互");
        Map<String, Object> failedRow = jdbc.queryForMap("""
            SELECT send_status, external_message_id, failure_reason FROM message
            WHERE visitor_id = ? AND client_request_id = 'alipay-cr-2'
            """, visitorId);
        assertThat(failedRow.get("send_status")).isEqualTo("failed");
        assertThat((String) failedRow.get("failure_reason")).contains("isp.usr-interaction-timeout");
        assertThat(failedRow.get("external_message_id")).isNull();
    }

    @Test
    void mediaDownloadsThroughRealReaderAndReportsRestrictionsHonestly() throws Exception {
        // 图片消息的 MediaId 经真实读取实现向媒体网关下载：字节与内容类型按渠道响应返回
        long mediaMessageId = seedMessage(channelAlipay, "alipay-media-ext-1",
            Map.of("type", "image", "media", Map.of("kind", "image", "id", "MEDIA_IMG_1")));
        MvcResult ok = mvc.perform(get("/api/desk/messages/" + mediaMessageId + "/media")
                .header("Authorization", "Bearer " + scopedToken)).andReturn();
        assertThat(ok.getResponse().getStatus()).isEqualTo(200);
        assertThat(ok.getResponse().getContentAsByteArray()).isEqualTo(IMAGE_BYTES);
        assertThat(ok.getResponse().getContentType()).isEqualTo("image/jpeg");
        assertThat(apiRequests.get(0)).isEqualTo("POST /chat/multimedia.do");
        Map<String, String> form = formFields(apiBodies.get(0));
        assertThat(form.get("method")).isEqualTo("alipay.mobile.public.multimedia.download");
        assertThat(JSONUtil.parseObj(form.get("biz_content")).getStr("mediaId")).isEqualTo("MEDIA_IMG_1");

        // 未配置渠道凭据的账号：如实受限 12200，不发起渠道请求
        long unconfiguredId = seedMessage(channelBare, "alipay-media-ext-2",
            Map.of("type", "image", "media", Map.of("kind", "image", "id", "MEDIA_IMG_2")));
        JSONObject restricted = errorOf(mvc.perform(get("/api/desk/messages/" + unconfiguredId + "/media")
                .header("Authorization", "Bearer " + scopedToken)).andReturn());
        assertThat(restricted.getInt("code")).isEqualTo(12200);
        assertThat(restricted.getStr("msg")).isEqualTo("渠道媒体凭据未配置");
        // 除成功一次下载外，其余用例不再触碰媒体替身
        assertThat(apiRequests.stream().filter(r -> r.contains("/chat/multimedia.do")).toList()).hasSize(1);
    }

    // ---------- 回调报文构造（官方 §3.2/§2.3 表单形状，签名按官方规则现算） ----------

    // POST 表单推送：参数按 x-www-form-urlencoded 编码入 body；dropSignType=true 复刻
    // mock-pulse 通用口径（signing_concat 剔除 sign_type），false 为生活号官方口径
    private MvcResult pushForm(Map<String, String> params, boolean dropSignType) throws Exception {
        return pushForm(params, dropSignType, channelAlipay);
    }

    private MvcResult pushForm(Map<String, String> params, boolean dropSignType, long channelId) throws Exception {
        return mvc.perform(post("/api/channels/" + channelId + "/callback")
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .content(signedForm(params, dropSignType)))
            .andReturn();
    }

    // 官方表单序：业务参数 + sign_type=RSA2 + sign（Base64 经 percent-encode 置尾）
    private String signedForm(Map<String, String> params, boolean dropSignType) {
        Map<String, String> signed = new TreeMap<>(params);
        signed.put("sign_type", "RSA2");
        signed.put("sign", sign(toVerifyString(signed, dropSignType)));
        StringBuilder form = new StringBuilder();
        for (Map.Entry<String, String> entry : signed.entrySet()) {
            if (form.length() > 0) {
                form.append('&');
            }
            form.append(URLEncoder.encode(entry.getKey(), StandardCharsets.UTF_8))
                .append('=')
                .append(URLEncoder.encode(entry.getValue(), StandardCharsets.UTF_8));
        }
        return form.toString();
    }

    // 待签串独立构造：剔除 sign（按口径剔 sign_type），ASCII 升序 k=v& 拼接（§4.3/§3.2）
    private String toVerifyString(Map<String, String> params, boolean dropSignType) {
        Map<String, String> sorted = new TreeMap<>(params);
        sorted.remove("sign");
        if (dropSignType) {
            sorted.remove("sign_type");
        }
        StringBuilder toVerify = new StringBuilder();
        for (Map.Entry<String, String> entry : sorted.entrySet()) {
            if (toVerify.length() > 0) {
                toVerify.append('&');
            }
            toVerify.append(entry.getKey()).append('=').append(entry.getValue());
        }
        return toVerify.toString();
    }

    private String sign(String toVerify) {
        try {
            Signature signature = Signature.getInstance("SHA256withRSA");
            signature.initSign(keyPair.getPrivate());
            signature.update(toVerify.getBytes(StandardCharsets.UTF_8));
            return Base64.getEncoder().encodeToString(signature.sign());
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    // 握手回包 biz_content 应为测试密钥对的应用公钥（X.509 Base64），独立推导复核
    private String derivedPublicKey() {
        return Base64.getMimeEncoder().encodeToString(keyPair.getPublic().getEncoded());
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
        info.put("url", "https://dudu.example.com/api/channels/alipay-full/callback");
        info.put("appId", APP_ID);
        info.put("appPrivateKey", Base64.getMimeEncoder().encodeToString(keyPair.getPrivate().getEncoded()));
        // 回调验签钥（§4.3 支付宝平台公钥）：本测试报文由自造密钥对加签，平台公钥即其对钥
        info.put("alipayPublicKey", Base64.getMimeEncoder().encodeToString(keyPair.getPublic().getEncoded()));
        return info;
    }

    // ---------- Desk 侧公共小工具（与既有集成测试同口径） ----------

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
