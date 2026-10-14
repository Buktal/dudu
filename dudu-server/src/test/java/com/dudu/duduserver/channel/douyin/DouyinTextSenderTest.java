package com.dudu.duduserver.channel.douyin;

import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.dudu.duduserver.channel.ChannelSendResult;
import com.dudu.duduserver.constant.ChannelEnum;
import com.dudu.duduserver.entity.CompanyChannelDO;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 抖音纯文本发送验收（事实见 docs/research/channels/douyin.md §6.1）：场景一回复——
 * POST /im/send/msg/?open_id=<发送方 open_id>，Header access-token，body 携带
 * scene=im_reply_msg、msg_id（来信 server_message_id）、conversation_id、to_user_id
 * 与 content.msg_type=1 文本报文；成功以 data.error_code=0 为准并取响应 msg_id，
 * 回复上下文缺失、凭据未配置、未完成用户授权与渠道错误如实失败不冒成功。
 */
class DouyinTextSenderTest {

    // §6.1 场景一成功响应形状（逐字）：渠道消息标识为顶层 msg_id
    private static final String SEND_OK =
        "{\"extra\":{\"description\":\"\",\"sub_error_code\":0,\"sub_description\":\"\","
            + "\"now\":1648797449,\"logid\":\"021648797449846fd1b1111000700600000000000000086dfb920\","
            + "\"error_code\":0},\"data\":{\"error_code\":0,\"description\":\"\"},"
            + "\"msg_id\":\"@c29bfc000+MNggFhRkwGuX1ntuc0RPc0VHKefj/yWEJ8DtjU==\"}";

    // §6.1 渠道错误形状：28003081 上条消息已超 24 小时
    private static final String SEND_EXPIRED =
        "{\"extra\":{\"error_code\":28003081,\"description\":\"上条消息已经超过24小时，无法回复\","
            + "\"logid\":\"02172527001221200000000000000000000ffff0a70750423ef80\",\"now\":1725270012},"
            + "\"data\":{\"error_code\":28003081,\"description\":\"上条消息已经超过24小时，无法回复\"}}";

    private final List<String> requestLines = new CopyOnWriteArrayList<>();
    private final List<String> bodies = new CopyOnWriteArrayList<>();
    private final List<String> accessTokens = new CopyOnWriteArrayList<>();
    private HttpServer server;
    private String baseUrl;

    @BeforeEach
    void startServer() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.start();
        baseUrl = "http://127.0.0.1:" + server.getAddress().getPort();
    }

    @AfterEach
    void stopServer() {
        server.stop(0);
    }

    @Test
    void repliesWithSceneOneWireShapeAndKeepsTheChannelMessageId() {
        handle("/oauth/refresh_token/", 200,
            "{\"data\":{\"access_token\":\"act.1d1021d2aee3d41fee2d2add43456badMFZnrhFhfWotu3Ec\","
                + "\"expires_in\":1296000},\"message\":\"success\",\"code\":0}");
        handle("/im/send/msg/", 200, SEND_OK);

        ChannelSendResult result = sender(reply("@msgId:0", "@conv:0", "owner-open")).send(
            account(), "visitor-open", "好的，今天发出");

        assertThat(result.succeeded()).isTrue();
        assertThat(result.externalMessageId()).isEqualTo("@c29bfc000+MNggFhRkwGuX1ntuc0RPc0VHKefj/yWEJ8DtjU==");
        assertThat(result.failureReason()).isNull();

        // 线格式：路径尾斜杠 + query open_id=发送方 + Header access-token
        assertThat(requestLines.get(1)).startsWith("POST /im/send/msg/?open_id=owner-open");
        assertThat(accessTokens.get(1)).isEqualTo("act.1d1021d2aee3d41fee2d2add43456badMFZnrhFhfWotu3Ec");

        // 报文：scene/msg_id/conversation_id/to_user_id/content.msg_type=1（§6.1 文本构造）
        JSONObject payload = JSONUtil.parseObj(bodies.get(1));
        assertThat(payload.getStr("scene")).isEqualTo("im_reply_msg");
        assertThat(payload.getStr("msg_id")).isEqualTo("@msgId:0");
        assertThat(payload.getStr("conversation_id")).isEqualTo("@conv:0");
        assertThat(payload.getStr("to_user_id")).isEqualTo("visitor-open");
        assertThat(payload.getJSONObject("content").getInt("msg_type")).isEqualTo(1);
        assertThat(payload.getJSONObject("content").getJSONObject("text").getStr("text"))
            .isEqualTo("好的，今天发出");
    }

    @Test
    void failsHonestlyWhenReplyContextIsMissingOrIncomplete() {
        // 无来信：抖音仅支持回复场景，没有 webhook 派生上下文不可发
        ChannelSendResult noVisitor = sender((channelId, userId) -> null).send(account(), "visitor-open", "在吗");
        assertThat(noVisitor.succeeded()).isFalse();
        assertThat(noVisitor.failureReason()).contains("缺少可回复的来信");

        // 复合标识不完整（如旧数据只有 server_message_id）：不猜会话
        ChannelSendResult incomplete = sender(reply("@msgId:0", null, null)).send(account(), "visitor-open", "在吗");
        assertThat(incomplete.succeeded()).isFalse();
        assertThat(incomplete.failureReason()).contains("缺少可回复的来信");
        assertThat(requestLines).isEmpty();
    }

    @Test
    void failsHonestlyWhenCredentialsOrAuthorizationAreMissing() {
        CompanyChannelDO unconfigured = new CompanyChannelDO();
        unconfigured.setChannel(ChannelEnum.DOUYIN);
        unconfigured.setChannelInfo(Map.of("clientKey", "asdfavetgbvasf"));
        ChannelSendResult noCreds = sender(reply("@m", "@c", "o")).send(unconfigured, "v", "在吗");
        assertThat(noCreds.succeeded()).isFalse();
        assertThat(noCreds.failureReason()).isEqualTo("渠道发送凭据未配置");
        assertThat(requestLines).isEmpty();
    }

    @Test
    void reportsChannelRejectionWithTheOriginalErrorCodeAndDescription() {
        handle("/oauth/refresh_token/", 200,
            "{\"data\":{\"access_token\":\"act.tok\",\"expires_in\":1296000},\"code\":0}");
        handle("/im/send/msg/", 200, SEND_EXPIRED);

        ChannelSendResult result = sender(reply("@m", "@c", "o")).send(account(), "visitor-open", "稍等");

        assertThat(result.succeeded()).isFalse();
        assertThat(result.failureReason()).contains("28003081").contains("上条消息已经超过24小时");
    }

    @Test
    void reportsTransportFailureInsteadOfPretendingSuccess() {
        // 替身未注册发送路径（HTTP 404）：如实记录调用失败，不冒成功
        ChannelSendResult result = sender(reply("@m", "@c", "o")).send(account(), "visitor-open", "稍等");
        assertThat(result.succeeded()).isFalse();
        assertThat(result.failureReason()).isNotBlank();
    }

    // ---- 夹具 ----

    private DouyinTextSender sender(DouyinReplyContext replyContext) {
        return new DouyinTextSender(RestClient.builder(), baseUrl, replyContext);
    }

    private DouyinReplyContext reply(String msgId, String conversationId, String ownerOpenId) {
        return (companyChannelId, externalUserId) ->
            new DouyinReplyContext.Reply(msgId, conversationId, ownerOpenId);
    }

    private CompanyChannelDO account() {
        CompanyChannelDO account = new CompanyChannelDO();
        account.setChannel(ChannelEnum.DOUYIN);
        account.setCompanyChannelId(77L);
        account.setChannelInfo(Map.of(
            "clientKey", "asdfavetgbvasf",
            "clientSecret", "9e096e3a2a8b4e0f9c0f",
            "refreshToken", "rft.1d1021d2aee3d41fee2d2ad"));
        return account;
    }

    private void handle(String path, int status, String response) {
        server.createContext(path, exchange -> {
            requestLines.add(exchange.getRequestMethod() + " " + exchange.getRequestURI());
            bodies.add(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            accessTokens.add(String.valueOf(exchange.getRequestHeaders().getFirst("access-token")));
            byte[] body = response.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
            exchange.sendResponseHeaders(status, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
    }
}
