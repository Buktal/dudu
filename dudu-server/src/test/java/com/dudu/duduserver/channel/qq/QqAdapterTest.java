package com.dudu.duduserver.channel.qq;

import com.dudu.duduserver.channel.ChannelReceiveResult;
import com.dudu.duduserver.entity.CompanyChannelDO;
import com.dudu.duduserver.constant.ChannelEnum;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;

import java.util.HexFormat;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * QQ 适配器路由语义验收（协议事实见 docs/research/channels/qq.md）：op13 握手回黄金
 * 签名应答、op0 Dispatch 验签通过后解析入站、签名失败拒绝、参数错误与未知 op 按状态
 * 如实应答；只配 appSecret 的账号仍可回调验签，缺接口凭据的账号发送受限、素材读取不受限。
 */
class QqAdapterTest {

    private static final long CHANNEL_ID = 9602L;
    // 官方 op13 示例账号（qq.md §3.2）
    private static final String GOLDEN_SECRET = "DG5g3B4j9X2KOErG";
    private static final String GOLDEN_PLAIN_TOKEN = "Arq0D5A61EgUu4OxUvOp";
    private static final String GOLDEN_EVENT_TS = "1725442341";

    private final QqProtocol protocol = new QqProtocol();
    private final QqAdapter adapter = new QqAdapter(protocol,
        new QqTextSender(org.springframework.web.client.RestClient.builder(), "http://127.0.0.1:1"),
        new QqMediaReader(org.springframework.web.client.RestClient.builder()));

    @Test
    void channelRoutesThroughQqValue() {
        assertThat(adapter.channel()).isEqualTo(ChannelEnum.QQ);
    }

    @Test
    void getUrlVerificationUsesInterfaceDefaultUnsupported() {
        // QQ 无 GET 验证阶段（webhook 页仅 op13 握手），默认实现按不支持应答
        assertThat(adapter.verifyUrl(account(Map.of("appSecret", GOLDEN_SECRET)), Map.of(), new HttpHeaders()))
            .isEqualTo(com.dudu.duduserver.channel.ChannelCallbackResult.unsupported());
    }

    @Test
    void handshakeAnswersFreshRequestAndUnverifiableOrStaleRequestsBadRequest() {
        // 官方 op13 握手（§3.2）：应答 plain_token 回显 + event_ts+plain_token 签名；
        // 黄金签名本身由 QqProtocolTest 锚定，适配器层只应答新鲜 event_ts（防滥用窗口）
        String freshTs = String.valueOf(java.time.Instant.now().getEpochSecond());
        ChannelReceiveResult ok = adapter.receive(account(Map.of("appSecret", GOLDEN_SECRET)), Map.of(),
            new HttpHeaders(), "{\"op\":13,\"d\":{\"plain_token\":\"" + GOLDEN_PLAIN_TOKEN
                + "\",\"event_ts\":\"" + freshTs + "\"}}");
        assertThat(ok.message()).isNull();
        assertThat(ok.response().status()).isEqualTo(200);
        assertThat(ok.response().body())
            .isEqualTo(protocol.handshakeResponse(GOLDEN_SECRET, GOLDEN_PLAIN_TOKEN, freshTs));

        // 窗口下沿（恰 300 秒前）仍应答签名
        String edgeTs = String.valueOf(java.time.Instant.now().getEpochSecond() - 300);
        assertThat(adapter.receive(account(Map.of("appSecret", GOLDEN_SECRET)), Map.of(), new HttpHeaders(),
            "{\"op\":13,\"d\":{\"plain_token\":\"p\",\"event_ts\":\"" + edgeTs + "\"}}")
            .response().status()).isEqualTo(200);

        // 超窗握手不应答签名（官方黄金报文的 2024 年时间戳在此被拒）：旧握手骗签可再攻击
        // op0 验签（协议弱点缓解）
        assertThat(adapter.receive(account(Map.of("appSecret", GOLDEN_SECRET)), Map.of(), new HttpHeaders(),
            "{\"op\":13,\"d\":{\"plain_token\":\"" + GOLDEN_PLAIN_TOKEN + "\",\"event_ts\":\""
                + GOLDEN_EVENT_TS + "\"}}").response().status()).isEqualTo(400);
        // 未来时间超窗同样拒绝
        String futureTs = String.valueOf(java.time.Instant.now().getEpochSecond() + 301);
        assertThat(adapter.receive(account(Map.of("appSecret", GOLDEN_SECRET)), Map.of(), new HttpHeaders(),
            "{\"op\":13,\"d\":{\"plain_token\":\"p\",\"event_ts\":\"" + futureTs + "\"}}")
            .response().status()).isEqualTo(400);

        // 握手报文缺 plain_token / event_ts / 非数字 event_ts 无法应答，按参数错误拒绝
        assertThat(adapter.receive(account(Map.of("appSecret", GOLDEN_SECRET)), Map.of(), new HttpHeaders(),
            "{\"op\":13,\"d\":{\"event_ts\":\"" + freshTs + "\"}}").response().status()).isEqualTo(400);
        assertThat(adapter.receive(account(Map.of("appSecret", GOLDEN_SECRET)), Map.of(), new HttpHeaders(),
            "{\"op\":13,\"d\":{}}").response().status()).isEqualTo(400);
        assertThat(adapter.receive(account(Map.of("appSecret", GOLDEN_SECRET)), Map.of(), new HttpHeaders(),
            "{\"op\":13,\"d\":{\"plain_token\":\"p\",\"event_ts\":\"not-a-number\"}}")
            .response().status()).isEqualTo(400);
    }

    @Test
    void dispatchWithValidSignatureAcceptsMessageAndForgedSignatureIsRejected() {
        String body = "{\"op\":0,\"t\":\"C2C_MESSAGE_CREATE\",\"d\":{\"id\":\"ROBOT1.0_1\","
            + "\"author\":{\"user_openid\":\"C2C_1\",\"username\":\"小明\"},\"content\":\"你好\","
            + "\"message_type\":0}}";
        String signature = HexFormat.of().formatHex(
            protocol.sign(GOLDEN_SECRET, GOLDEN_EVENT_TS.getBytes(), body.getBytes()));

        ChannelReceiveResult accepted = adapter.receive(account(Map.of("appSecret", GOLDEN_SECRET)), Map.of(),
            headers(signature), body);
        assertThat(accepted.response().status()).isEqualTo(200);
        assertThat(accepted.message()).isNotNull();
        assertThat(accepted.message().externalUserId()).isEqualTo("c2c:C2C_1");

        // 签名不符按 403 拒绝，不落库
        ChannelReceiveResult rejected = adapter.receive(account(Map.of("appSecret", GOLDEN_SECRET)), Map.of(),
            headers(signature), body.replace("你好", "被篡改"));
        assertThat(rejected.response().status()).isEqualTo(403);
        assertThat(rejected.message()).isNull();

        // 签名头缺失同样拒绝
        assertThat(adapter.receive(account(Map.of("appSecret", GOLDEN_SECRET)), Map.of(),
            new HttpHeaders(), body).response().status()).isEqualTo(403);
    }

    @Test
    void dispatchParsesRelationEventsAsAnswerOnlyAndRejectsMalformedPayloads() {
        // 关系链事件只应答 success 不落库
        ChannelReceiveResult relation = adapter.receive(account(Map.of("appSecret", GOLDEN_SECRET)), Map.of(),
            signedHeaders("{\"op\":0,\"t\":\"FRIEND_ADD\",\"d\":{\"openid\":\"O\"}}"),
            "{\"op\":0,\"t\":\"FRIEND_ADD\",\"d\":{\"openid\":\"O\"}}");
        assertThat(relation.response().status()).isEqualTo(200);
        assertThat(relation.message()).isNull();

        // 消息缺会话对象身份：验签通过也按参数错误拒绝，不冒充成功
        String orphan = "{\"op\":0,\"t\":\"C2C_MESSAGE_CREATE\",\"d\":{\"id\":\"X\","
            + "\"author\":{},\"content\":\"hi\",\"message_type\":0}}";
        ChannelReceiveResult malformed = adapter.receive(account(Map.of("appSecret", GOLDEN_SECRET)), Map.of(),
            signedHeaders(orphan), orphan);
        assertThat(malformed.response().status()).isEqualTo(400);
        assertThat(malformed.message()).isNull();

        // 非 JSON 报文按参数错误拒绝
        assertThat(adapter.receive(account(Map.of("appSecret", GOLDEN_SECRET)), Map.of(),
            new HttpHeaders(), "not json").response().status()).isEqualTo(400);

        // 未知 op 无法解读，按参数错误拒绝
        assertThat(adapter.receive(account(Map.of("appSecret", GOLDEN_SECRET)), Map.of(),
            new HttpHeaders(), "{\"op\":99,\"d\":{}}").response().status()).isEqualTo(400);
    }

    @Test
    void callbackWithoutAppSecretAndSendWithoutApiCredentialsStayHonest() {
        // 未配置 appSecret 的账号无法验签，回调按不支持应答
        assertThat(adapter.receive(account(Map.of("appId", "APPID")), Map.of(), new HttpHeaders(),
            "{\"op\":13,\"d\":{}}").response().status()).isEqualTo(501);
        assertThat(adapter.receive(account(Map.of()), Map.of(), new HttpHeaders(),
            "{\"op\":0,\"t\":\"X\",\"d\":{}}").response().status()).isEqualTo(501);

        // 只配 appSecret 的账号仍可回调验签
        String freshTs = String.valueOf(java.time.Instant.now().getEpochSecond());
        assertThat(adapter.receive(account(Map.of("appSecret", GOLDEN_SECRET)), Map.of(), new HttpHeaders(),
            "{\"op\":13,\"d\":{\"plain_token\":\"p\",\"event_ts\":\"" + freshTs + "\"}}")
            .response().status()).isEqualTo(200);

        // 接口凭据缺失如实限制发送；素材读取凭 URL 直读，不受凭据限制
        assertThat(adapter.sendRestriction(account(Map.of("appSecret", GOLDEN_SECRET))))
            .isEqualTo("渠道发送凭据未配置");
        assertThat(adapter.sendRestriction(account(Map.of("appId", "A", "appSecret", GOLDEN_SECRET)))).isNull();
        assertThat(adapter.mediaRestriction(account(Map.of()))).isNull();
    }

    private ChannelReceiveResult receiveWithGoldenSignature(String body) {
        return adapter.receive(account(Map.of("appSecret", GOLDEN_SECRET)), Map.of(),
            headers(HexFormat.of().formatHex(
                protocol.sign(GOLDEN_SECRET, GOLDEN_EVENT_TS.getBytes(), body.getBytes()))), body);
    }

    // 以黄金密钥对报文现场签名（验签正确性由 QqProtocolTest 官方向量锚定）
    private HttpHeaders signedHeaders(String body) {
        return headers(HexFormat.of().formatHex(
            protocol.sign(GOLDEN_SECRET, GOLDEN_EVENT_TS.getBytes(), body.getBytes())));
    }

    private HttpHeaders headers(String signature) {
        HttpHeaders headers = new HttpHeaders();
        headers.add("X-Signature-Ed25519", signature);
        headers.add("X-Signature-Timestamp", GOLDEN_EVENT_TS);
        return headers;
    }

    private CompanyChannelDO account(Map<String, Object> channelInfo) {
        CompanyChannelDO account = new CompanyChannelDO();
        account.setCompanyChannelId(CHANNEL_ID);
        account.setChannel(ChannelEnum.QQ);
        account.setChannelInfo(channelInfo);
        return account;
    }
}
