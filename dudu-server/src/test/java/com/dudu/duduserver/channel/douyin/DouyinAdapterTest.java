package com.dudu.duduserver.channel.douyin;

import com.dudu.duduserver.channel.ChannelCallbackResult;
import com.dudu.duduserver.channel.ChannelReceiveResult;
import com.dudu.duduserver.constant.ChannelEnum;
import com.dudu.duduserver.entity.CompanyChannelDO;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.web.client.RestClient;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 抖音适配器回调四态验收（事实见 docs/research/channels/douyin.md §3.1/§4.1）：
 * 缺凭据按不支持、签名不符按拒绝、verify_webhook 握手按数字 challenge 原样回显、
 * im_receive_msg 落统一入站消息、其余事件只应答、无法解析的报文按参数错误；
 * 发送限制随凭据与用户授权如实回答，素材限制随凭据如实回答。
 */
class DouyinAdapterTest {

    private static final long CHANNEL_ID = 9201L;
    private static final String CLIENT_SECRET = "9e096e3a2a8b4e0f9c0f";
    private static final String SIGNATURE_HEADER = "X-Douyin-Signature";

    private final HttpHeaders headers = new HttpHeaders();

    private DouyinAdapter adapter;

    @BeforeEach
    void setUp() {
        // 发送与素材实现不参与回调路径：接口地址指向本机保留端口，误请求会以连接失败暴露
        adapter = new DouyinAdapter(new DouyinProtocol(),
            new DouyinTextSender(RestClient.builder(), "http://127.0.0.1:9", (channelId, userId) -> null),
            new DouyinMediaReader(RestClient.builder()));
    }

    @Test
    void channelRegistersDouyin() {
        assertThat(adapter.channel()).isEqualTo(ChannelEnum.DOUYIN);
    }

    @Test
    void receiveWithoutRequiredCredentialsAnswersUnsupported() {
        // 必填键 clientSecret 缺失即凭据未配置，不模拟成功
        CompanyChannelDO incomplete = new CompanyChannelDO();
        incomplete.setCompanyChannelId(CHANNEL_ID);
        incomplete.setChannel(ChannelEnum.DOUYIN);
        incomplete.setChannelInfo(Map.of("clientKey", "asdfavetgbvasf"));
        assertThat(adapter.receive(incomplete, Map.of(), headers, "{}").response().status()).isEqualTo(501);
    }

    @Test
    void signedHandshakeEchoesNumericChallengeVerbatim() {
        String body = "{\"event\":\"verify_webhook\",\"content\":{\"challenge\":123456}}";
        sign(body);

        ChannelCallbackResult response = adapter.receive(account(null), Map.of(), headers, body).response();
        assertThat(response.status()).isEqualTo(200);
        assertThat(response.body()).isEqualTo("{\"challenge\":123456}");
    }

    @Test
    void signatureMismatchIsRejected() {
        String body = "{\"event\":\"verify_webhook\",\"content\":{\"challenge\":123456}}";
        sign(body);
        headers.set(SIGNATURE_HEADER, "0".repeat(40));
        assertThat(adapter.receive(account(null), Map.of(), headers, body).response())
            .isEqualTo(ChannelCallbackResult.rejected());

        // 签名头缺失同样按拒绝处理
        headers.remove(SIGNATURE_HEADER);
        assertThat(adapter.receive(account(null), Map.of(), headers, body).response())
            .isEqualTo(ChannelCallbackResult.rejected());
    }

    @Test
    void imReceiveMessageBecomesInboundAndOtherEventsOnlyAcknowledge() {
        String message = "{\"event\":\"im_receive_msg\",\"from_user_id\":\"visitor-open\","
            + "\"to_user_id\":\"owner-open\",\"client_key\":\"asdfavetgbvasf\",\"log_id\":\"log-1\","
            + "\"content\":{\"message_type\":\"text\",\"text\":\"在吗\","
            + "\"server_message_id\":\"@msg1\",\"conversation_short_id\":\"@conv1\"}}";
        sign(message);

        ChannelReceiveResult result = adapter.receive(account(null), Map.of(), headers, message);
        assertThat(result.response()).isEqualTo(ChannelCallbackResult.success());
        assertThat(result.message()).isNotNull();
        assertThat(result.message().externalUserId()).isEqualTo("visitor-open");
        assertThat(result.message().content()).isEqualTo(Map.of("type", "text", "text", "在吗"));

        // 已读事件只应答，没有可落库的访客消息
        String read = "{\"event\":\"im_message_read\",\"from_user_id\":\"visitor-open\","
            + "\"to_user_id\":\"owner-open\",\"content\":{\"message_id\":\"@msg1\"}}";
        sign(read);
        ChannelReceiveResult acked = adapter.receive(account(null), Map.of(), headers, read);
        assertThat(acked.response()).isEqualTo(ChannelCallbackResult.success());
        assertThat(acked.message()).isNull();
    }

    @Test
    void signedButUnparsableBodyIsBadRequest() {
        // 签名合法但报文不是合法 JSON → 按参数错误
        sign("not-json");
        assertThat(adapter.receive(account(null), Map.of(), headers, "not-json").response().status()).isEqualTo(400);

        // 解析成功但缺少发送方身份 → 同样按参数错误
        String identityMissing = "{\"event\":\"im_receive_msg\",\"to_user_id\":\"owner-open\","
            + "\"content\":{\"message_type\":\"text\",\"text\":\"在吗\"}}";
        sign(identityMissing);
        assertThat(adapter.receive(account(null), Map.of(), headers, identityMissing).response().status())
            .isEqualTo(400);
    }

    @Test
    void restrictionsReflectConfiguredCredentialsAndAuthorization() {
        // 无 channel_info 的账号缺少必填凭据，如实说明不可发不可读
        CompanyChannelDO incomplete = new CompanyChannelDO();
        incomplete.setChannel(ChannelEnum.DOUYIN);
        assertThat(adapter.sendRestriction(incomplete)).isEqualTo("渠道发送凭据未配置");
        assertThat(adapter.mediaRestriction(incomplete)).isEqualTo("渠道素材凭据未配置");

        // 凭据齐全但未完成用户授权（缺 refreshToken）：不可发的原因如实指向授权，素材不受影响
        Map<String, Object> withoutRefresh = new HashMap<>();
        withoutRefresh.put("clientKey", "asdfavetgbvasf");
        withoutRefresh.put("clientSecret", CLIENT_SECRET);
        CompanyChannelDO unauthorized = new CompanyChannelDO();
        unauthorized.setCompanyChannelId(CHANNEL_ID);
        unauthorized.setChannel(ChannelEnum.DOUYIN);
        unauthorized.setChannelInfo(withoutRefresh);
        assertThat(adapter.sendRestriction(unauthorized))
            .isEqualTo("抖音发送未完成用户授权：channel_info 缺少 refreshToken（需运营完成抖音号授权后录入）");
        assertThat(adapter.mediaRestriction(unauthorized)).isNull();

        // 凭据与授权齐全不设限制
        assertThat(adapter.sendRestriction(account("rft.1d1021d2aee3d41fee2d2ad"))).isNull();
        assertThat(adapter.mediaRestriction(account("rft.1d1021d2aee3d41fee2d2ad"))).isNull();
    }

    // ---- 夹具 ----

    // 凭据齐全账号；refreshToken 为 null 表示未完成用户授权（不写 refreshToken 键）
    private CompanyChannelDO account(String refreshToken) {
        CompanyChannelDO account = new CompanyChannelDO();
        account.setCompanyChannelId(CHANNEL_ID);
        account.setChannel(ChannelEnum.DOUYIN);
        Map<String, Object> info = new HashMap<>();
        info.put("clientKey", "asdfavetgbvasf");
        info.put("clientSecret", CLIENT_SECRET);
        if (refreshToken != null) {
            info.put("refreshToken", refreshToken);
        }
        account.setChannelInfo(info);
        return account;
    }

    // 按官方 §4.1 计算签名并写入 X-Douyin-Signature：sha1(client_secret + body) 小写 hex
    private void sign(String body) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-1");
            digest.update(CLIENT_SECRET.getBytes(StandardCharsets.UTF_8));
            digest.update(body.getBytes(StandardCharsets.UTF_8));
            headers.set(SIGNATURE_HEADER, HexFormat.of().formatHex(digest.digest()));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
