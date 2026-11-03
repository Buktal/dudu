package com.dudu.duduserver.channel.kuaishou;

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
 * 快手适配器回调四态验收（事实见 docs/research/channels/kuaishou.md §6.5.3）：
 * 缺凭据按不支持、Ks-Sign 不符按拒绝、type=1 买家消息落统一入站消息并按渠道定义体
 * {"result":1} 应答、心跳与转接事件只应答、无法解析的报文按参数错误；发送限制随
 * 凭据如实回答，素材读取为平台侧限制（凭据齐全仍不可读）。
 */
class KuaishouAdapterTest {

    private static final long CHANNEL_ID = 9301L;
    private static final String APP_KEY = "ks696650570360602063";
    private static final String SIGN_HEADER = "Ks-Sign";

    private final HttpHeaders headers = new HttpHeaders();

    private KuaishouAdapter adapter;

    @BeforeEach
    void setUp() {
        // 发送实现不参与回调路径：接口地址指向本机保留端口，误请求会以连接失败暴露
        adapter = new KuaishouAdapter(new KuaishouProtocol(),
            new KuaishouTextSender(RestClient.builder(), "http://127.0.0.1:9",
                (channelId, userId) -> null));
    }

    @Test
    void channelRegistersKuaishou() {
        assertThat(adapter.channel()).isEqualTo(ChannelEnum.KUAISHOU);
    }

    @Test
    void receiveWithoutRequiredCredentialsAnswersUnsupported() {
        // 必填键 appKey 缺失即凭据未配置，不模拟成功
        CompanyChannelDO incomplete = new CompanyChannelDO();
        incomplete.setCompanyChannelId(CHANNEL_ID);
        incomplete.setChannel(ChannelEnum.KUAISHOU);
        incomplete.setChannelInfo(Map.of("signSecret", "s"));
        assertThat(adapter.receive(incomplete, Map.of(), headers, "{}").response().status()).isEqualTo(501);
    }

    @Test
    void signedMessageBecomesInboundAndAnswersResultOne() {
        String body = buyerMessage();
        sign(body);

        ChannelReceiveResult result = adapter.receive(account(true), Map.of(), headers, body);
        assertThat(result.response()).isEqualTo(new ChannelCallbackResult(200, "{\"result\":1}"));
        assertThat(result.message()).isNotNull();
        assertThat(result.message().externalUserId()).isEqualTo("buyer-open-1");
        assertThat(result.message().externalMessageId()).isEqualTo("req-77");
    }

    @Test
    void heartbeatAndTransferEventsOnlyAcknowledge() {
        String heartbeat = "{\"test\":true}";
        sign(heartbeat);
        ChannelReceiveResult heart = adapter.receive(account(true), Map.of(), headers, heartbeat);
        assertThat(heart.response().status()).isEqualTo(200);
        assertThat(heart.message()).isNull();
    }

    @Test
    void signatureMismatchIsRejected() {
        String body = buyerMessage();
        sign(body);
        headers.set(SIGN_HEADER, "0".repeat(32));
        assertThat(adapter.receive(account(true), Map.of(), headers, body).response())
            .isEqualTo(ChannelCallbackResult.rejected());

        // 签名头缺失同样按拒绝处理
        headers.remove(SIGN_HEADER);
        assertThat(adapter.receive(account(true), Map.of(), headers, body).response())
            .isEqualTo(ChannelCallbackResult.rejected());
    }

    @Test
    void signedButUnparsableBodyIsBadRequest() {
        // 签名合法但报文不是合法 JSON 或缺必填身份 → 按参数错误
        sign("not-json");
        assertThat(adapter.receive(account(true), Map.of(), headers, "not-json").response().status())
            .isEqualTo(400);

        String identityMissing = "{\"requestId\":\"req-77\",\"type\":1,\"fromUser\":{\"role\":1}}";
        sign(identityMissing);
        assertThat(adapter.receive(account(true), Map.of(), headers, identityMissing).response().status())
            .isEqualTo(400);
    }

    @Test
    void restrictionsReflectConfiguredCredentialsAndPlatformMediaLimit() {
        // 无 appKey：收发凭据缺失如实说明
        CompanyChannelDO incomplete = new CompanyChannelDO();
        incomplete.setChannel(ChannelEnum.KUAISHOU);
        assertThat(adapter.sendRestriction(incomplete)).isEqualTo("渠道发送凭据未配置");

        // 仅 appKey（未配发送侧凭据）：发送限制分别指向签名密钥与授权令牌
        CompanyChannelDO receiveOnly = account(false);
        assertThat(adapter.sendRestriction(receiveOnly))
            .isEqualTo("快手发送未完成配置：channel_info 缺少 signSecret（发送签名密钥，平台分配）");
        receiveOnly.getChannelInfo().put("signSecret", "secret-value");
        assertThat(adapter.sendRestriction(receiveOnly))
            .isEqualTo("快手发送未完成授权：channel_info 缺少 accessToken（商家授权令牌，过期后需重新授权录入）");

        // 凭据齐全发送不限；素材读取是平台侧限制（凭据齐全仍不可读）
        assertThat(adapter.sendRestriction(account(true))).isNull();
        assertThat(adapter.mediaRestriction(account(true)))
            .isEqualTo("快手素材读取不可用：平台推送的图片素材标识已被抹除（uri 置空），无官方读取通道");
        assertThat(adapter.readMedia(account(true), "any").succeeded()).isFalse();
    }

    // ---- 夹具 ----

    // 凭据齐全账号（sendReady=false 时仅 appKey，缺发送侧凭据）
    private CompanyChannelDO account(boolean sendReady) {
        CompanyChannelDO account = new CompanyChannelDO();
        account.setCompanyChannelId(CHANNEL_ID);
        account.setChannel(ChannelEnum.KUAISHOU);
        account.setAccountName("旗舰店");
        Map<String, Object> info = new HashMap<>();
        info.put("appKey", APP_KEY);
        if (sendReady) {
            info.put("signSecret", "1a2b3c4d5e6f7a8b9c0d");
            info.put("accessToken", "KwaiAccessTokenSample");
        }
        account.setChannelInfo(info);
        return account;
    }

    // §6.5.3 字段表构造的买家文本消息
    private String buyerMessage() {
        return "{\"requestId\":\"req-77\",\"createTime\":1659079893622,\"generator\":1,\"type\":1,"
            + "\"fromUser\":{\"nickName\":\"快手用户1234\",\"role\":1,\"openId\":\"buyer-open-1\"},"
            + "\"toUser\":{\"nickName\":\"旗舰店\",\"role\":2,\"openId\":\"seller-open-1\"},"
            + "\"message\":{\"contentType\":1,\"content\":\"{\\\"text\\\":\\\"这个多少钱\\\"}\"},"
            + "\"context\":{\"sellerId\":90001,\"openId\":\"buyer-open-1\"}}";
    }

    // 按 §6.5.3 官方口径计算签名并写入 Ks-Sign：MD5(appKey + 原始 body) 小写 hex
    private void sign(String body) {
        try {
            MessageDigest digest = MessageDigest.getInstance("MD5");
            digest.update(APP_KEY.getBytes(StandardCharsets.UTF_8));
            digest.update(body.getBytes(StandardCharsets.UTF_8));
            headers.set(SIGN_HEADER, HexFormat.of().formatHex(digest.digest()));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
