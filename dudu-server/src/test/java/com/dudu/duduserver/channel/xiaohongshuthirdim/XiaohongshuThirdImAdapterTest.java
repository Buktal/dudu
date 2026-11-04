package com.dudu.duduserver.channel.xiaohongshuthirdim;

import com.dudu.duduserver.channel.ChannelCallbackResult;
import com.dudu.duduserver.channel.ChannelInboundMessage;
import com.dudu.duduserver.channel.ChannelReceiveResult;
import com.dudu.duduserver.channel.support.Digests;
import com.dudu.duduserver.constant.ChannelEnum;
import com.dudu.duduserver.entity.CompanyChannelDO;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;

import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 小红书三方私信适配器验收（事实见 docs/research/channels/xiaohongshu-third-im-spec.md）：
 * 线索推送按联调代码规格接收（§1.4）——验签可选（§1.2，齐备才核验、失败拒绝）、线索
 * 信封解析落库、200 应答（§1.3 唯一要求）；判型不符的推送是未公开的消息级信封（§1.5），
 * warn 留痕按成功应答防平台整体三次重推。发送与素材读取是平台侧限制（§2.2），凭据
 * 齐全与否都恒返回限制说明，Desk 据此禁用入口。
 */
class XiaohongshuThirdImAdapterTest {

    private static final String PUSH_TOKEN = "push-token-value";
    private static final String LEAD_BODY = "{\"data\":{\"leads_id\":\"lead-1\",\"keyword\":\"家具\","
        + "\"data\":[{\"label\":\"电话号码\",\"value\":\"13800000000\"}]},"
        + "\"timestamp\":1721796000000,\"source\":\"xx\"}";

    private final XiaohongshuThirdImAdapter adapter = new XiaohongshuThirdImAdapter(new XiaohongshuThirdImProtocol());

    @Test
    void channelRegistersXiaohongshuThirdIm() {
        assertThat(adapter.channel()).isEqualTo(ChannelEnum.XIAOHONGSHU_THIRD_IM);
    }

    @Test
    void receiveWithoutBindingCredentialsAnswersUnsupported() {
        // 绑定骨架身份（appId/secret）缺失即未配置，不模拟成功
        CompanyChannelDO incomplete = new CompanyChannelDO();
        incomplete.setCompanyChannelId(9401L);
        incomplete.setChannel(ChannelEnum.XIAOHONGSHU_THIRD_IM);
        incomplete.setChannelInfo(Map.of("secret", "1234abc"));
        assertThat(adapter.receive(incomplete, Map.of(), new HttpHeaders(), "{}").response().status()).isEqualTo(501);
    }

    @Test
    void leadPushWithoutSignatureHeaderIsAccepted() {
        // 官方验签可选（§1.2）：无验签头时跳过验签直接解析，线索落库按成功应答
        ChannelReceiveResult result = adapter.receive(account(true), Map.of(), new HttpHeaders(), LEAD_BODY);
        assertThat(result.response()).isEqualTo(ChannelCallbackResult.success());
        assertThat(result.message()).isNotNull();
        assertThat(result.message().externalUserId()).isEqualTo("lead-1");
        assertThat(result.message().externalMessageId()).isEqualTo("lead-1:1721796000000");
    }

    @Test
    void leadPushWithConcatenatedSha1SignatureIsAccepted() {
        // 拼接算法（SHA1(token+body)）兜底命中也放行：双算法矛盾未决，联调阶段实测裁决
        HttpHeaders headers = signedHeaders(concatenatedSha1());
        ChannelReceiveResult result = adapter.receive(account(true), Map.of(), headers, LEAD_BODY);
        assertThat(result.response()).isEqualTo(ChannelCallbackResult.success());
        assertThat(result.message()).isNotNull();
    }

    @Test
    void leadPushWithBadSignatureIsRejected() {
        // pushToken 与验签头齐备但双算法都不中：token 配错或非平台推送，拒绝且不落库
        HttpHeaders headers = signedHeaders("sha1=deadbeef");
        ChannelReceiveResult result = adapter.receive(account(true), Map.of(), headers, LEAD_BODY);
        assertThat(result.response()).isEqualTo(ChannelCallbackResult.rejected());
        assertThat(result.message()).isNull();
    }

    @Test
    void unknownEnvelopeStillAnswersSuccessWithoutPersisting() {
        // 判型不符即未公开的消息级推送（§1.5）：不落库，按成功应答防重推风暴
        ChannelReceiveResult result = adapter.receive(account(true), Map.of(), new HttpHeaders(),
            "{\"whatever\":\"push\"}");
        assertThat(result.response()).isEqualTo(ChannelCallbackResult.success());
        assertThat(result.message()).isNull();
    }

    @Test
    void leadFieldsMapToChannelProfile() {
        ChannelReceiveResult result = adapter.receive(account(true), Map.of(), new HttpHeaders(), LEAD_BODY);
        ChannelInboundMessage message = result.message();
        assertThat(message.content()).isEqualTo(Map.of("type", "text", "text", "收到小红书私信线索"));
        // 结构化字段与线索标签键值对都进渠道资料项：标签数组 value 缺失按未提供保留标签
        assertThat(message.channelFields()).containsExactly(
            new ChannelInboundMessage.ChannelField("线索 ID", "lead-1"),
            new ChannelInboundMessage.ChannelField("关键词", "家具"),
            new ChannelInboundMessage.ChannelField("电话号码", "13800000000"));
    }

    @Test
    void restrictionsArePlatformLevelRegardlessOfCredentials() {
        // 发送与素材读取恒平台限制：凭据缺失与齐全同判，与凭据缺失限制区分
        assertThat(adapter.sendRestriction(account(false))).isNotBlank();
        assertThat(adapter.mediaRestriction(account(false))).isNotBlank();
        assertThat(adapter.sendRestriction(account(true)))
            .isEqualTo("小红书私信三方发送未开放：发送端点与报文规格随平台开白下发"
                + "（docs/research/channels/xiaohongshu-third-im-spec.md §2.2），规格到手前不实现");
        assertThat(adapter.mediaRestriction(account(true)))
            .isEqualTo("小红书私信三方素材读取未开放：媒体接口规格随平台开白下发"
                + "（docs/research/channels/xiaohongshu-third-im-spec.md §2.2），规格到手前不实现");

        // 注册表拦截外的直呼（防御路径）同样如实失败
        assertThat(adapter.send(account(true), "u", "hi").succeeded()).isFalse();
        assertThat(adapter.readMedia(account(true), "m").succeeded()).isFalse();
    }

    // ---- 夹具 ----

    // 拼接算法期望签名：SHA1(pushToken + body) 小写 hex
    private String concatenatedSha1() {
        return Digests.sha1Hex((PUSH_TOKEN + LEAD_BODY).getBytes(StandardCharsets.UTF_8));
    }

    private HttpHeaders signedHeaders(String signature) {
        HttpHeaders headers = new HttpHeaders();
        headers.set(XiaohongshuThirdImProtocol.SIGNATURE_HEADER, signature);
        return headers;
    }

    // bound=false 时仅缺绑定身份（appId），true 时绑定、令牌与推送验签 token 齐全
    private CompanyChannelDO account(boolean bound) {
        CompanyChannelDO account = new CompanyChannelDO();
        account.setCompanyChannelId(9401L);
        account.setChannel(ChannelEnum.XIAOHONGSHU_THIRD_IM);
        Map<String, Object> info = new HashMap<>();
        if (bound) {
            info.put("appId", "234");
            info.put("secret", "1234abc");
            info.put("refreshToken", "used-refresh-token");
            info.put("accessToken", "stale-access-token");
            info.put("pushToken", PUSH_TOKEN);
        } else {
            info.put("secret", "1234abc");
        }
        account.setChannelInfo(info);
        return account;
    }
}
