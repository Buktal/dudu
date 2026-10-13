package com.dudu.duduserver.channel;

import com.dudu.duduserver.channel.wechatmp.WechatMpAdapter;
import com.dudu.duduserver.channel.wechatmp.WechatMpMediaReader;
import com.dudu.duduserver.channel.wechatmp.WechatMpProtocol;
import com.dudu.duduserver.channel.wechatmp.WechatMpTextSender;
import com.dudu.duduserver.constant.ChannelEnum;
import com.dudu.duduserver.entity.CompanyChannelDO;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.web.client.RestClient;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 渠道适配器注册表单元验证：按 channel() 单点分派、未接入渠道与账号缺失的如实限制说明、
 * 凭据缺失账号不向渠道发起请求；无 GET 验证阶段的渠道走默认实现应答不支持。
 * 发送与素材读取的协议行为由 wechatmp 包内的替身验证覆盖。
 */
class ChannelAdapterRegistryTest {

    // 本机保留端口：注册表的拒绝路径不应发起任何请求，误请求会以连接失败暴露
    private static final String UNUSED_BASE = "http://127.0.0.1:9";

    private final WechatMpAdapter wechatMp = new WechatMpAdapter(new WechatMpProtocol(),
        new WechatMpTextSender(RestClient.builder(), UNUSED_BASE),
        new WechatMpMediaReader(RestClient.builder(), UNUSED_BASE));
    private final ChannelAdapterRegistry registry = new ChannelAdapterRegistry(List.of(wechatMp));

    @Test
    void dispatchesByChannelCodeToTheMatchingAdapter() {
        assertThat(registry.get(ChannelEnum.WECHAT_MP)).isSameAs(wechatMp);
        // 未接入渠道查不到适配器：回调入口据此应答不支持
        assertThat(registry.get(ChannelEnum.DOUYIN)).isNull();
    }

    @Test
    void sendAndMediaRestrictionsDescribeAccountChannelAndCredentialsHonestly() {
        assertThat(registry.sendRestriction(null)).isEqualTo("渠道账号不可用");
        assertThat(registry.mediaRestriction(null)).isEqualTo("渠道账号不可用");

        assertThat(registry.sendRestriction(account(ChannelEnum.DOUYIN, Map.of("appId", "x"))))
            .isEqualTo("当前渠道暂未接入发送");
        assertThat(registry.mediaRestriction(account(ChannelEnum.DOUYIN, Map.of("appId", "x"))))
            .isEqualTo("当前渠道暂未接入素材读取");

        assertThat(registry.sendRestriction(account(ChannelEnum.WECHAT_MP, Map.of("appId", "x"))))
            .isEqualTo("渠道发送凭据未配置");
        assertThat(registry.mediaRestriction(account(ChannelEnum.WECHAT_MP, Map.of("appId", "x"))))
            .isEqualTo("渠道素材凭据未配置");

        assertThat(registry.sendRestriction(account(ChannelEnum.WECHAT_MP,
            Map.of("appId", "x", "appSecret", "y")))).isNull();
        assertThat(registry.mediaRestriction(account(ChannelEnum.WECHAT_MP,
            Map.of("appId", "x", "appSecret", "y")))).isNull();
    }

    @Test
    void sendAndReadMediaRefuseUnroutableAccountsWithoutCallingTheChannel() {
        ChannelSendResult noAccount = registry.send(null, "openid-1", "在吗");
        ChannelSendResult notConnected = registry.send(
            account(ChannelEnum.DOUYIN, Map.of("appId", "x")), "openid-1", "在吗");
        ChannelSendResult noCredentials = registry.send(
            account(ChannelEnum.WECHAT_MP, Map.of("appId", "x")), "openid-1", "在吗");

        assertThat(noAccount.failureReason()).isEqualTo("渠道账号不可用");
        assertThat(notConnected.failureReason()).isEqualTo("当前渠道暂未接入发送");
        assertThat(noCredentials.failureReason()).isEqualTo("渠道发送凭据未配置");

        ChannelMediaResult unreadable = registry.readMedia(
            account(ChannelEnum.DOUYIN, Map.of("appId", "x")), "MEDIA_ID");
        assertThat(unreadable.failureReason()).isEqualTo("当前渠道暂未接入素材读取");
    }

    @Test
    void channelsWithoutUrlVerificationAnswerUnsupportedByDefault() {
        ChannelAdapter noVerifyHandshake = new ChannelAdapter() {
            @Override
            public ChannelEnum channel() {
                return ChannelEnum.XIAOHONGSHU;
            }

            @Override
            public ChannelReceiveResult receive(CompanyChannelDO account, Map<String, String> query,
                                                HttpHeaders headers, String body) {
                return ChannelReceiveResult.answer(ChannelCallbackResult.success());
            }

            @Override
            public ChannelSendResult send(CompanyChannelDO account, String externalUserId, String text) {
                return ChannelSendResult.sent(null);
            }

            @Override
            public ChannelMediaResult readMedia(CompanyChannelDO account, String externalMediaId) {
                return ChannelMediaResult.failed("未接入");
            }

            @Override
            public String sendRestriction(CompanyChannelDO account) {
                return "未接入";
            }

            @Override
            public String mediaRestriction(CompanyChannelDO account) {
                return "未接入";
            }
        };
        ChannelAdapterRegistry partial = new ChannelAdapterRegistry(List.of(wechatMp, noVerifyHandshake));

        assertThat(partial.get(ChannelEnum.XIAOHONGSHU).verifyUrl(
            account(ChannelEnum.XIAOHONGSHU, Map.of()), Map.of(), new HttpHeaders()))
            .isEqualTo(ChannelCallbackResult.unsupported());
    }

    private CompanyChannelDO account(ChannelEnum channel, Map<String, Object> channelInfo) {
        CompanyChannelDO account = new CompanyChannelDO();
        account.setChannel(channel);
        account.setChannelInfo(channelInfo);
        return account;
    }
}
