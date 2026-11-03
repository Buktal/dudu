package com.dudu.duduserver.channel.xiaohongshuthirdim;

import com.dudu.duduserver.channel.ChannelCallbackResult;
import com.dudu.duduserver.channel.ChannelReceiveResult;
import com.dudu.duduserver.constant.ChannelEnum;
import com.dudu.duduserver.entity.CompanyChannelDO;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;

import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 小红书私信三方适配器骨架验收（事实见 docs/research/channels/xiaohongshu.md §14.7）：
 * 绑定凭据缺失按不支持应答；凭据齐全时收到推送不猜测解析（接收信封与验签规格未
 * 公开），warn 留痕后按成功应答避免平台整体三次重推；发送与素材读取是平台侧限制，
 * 凭据齐全与否都恒返回限制说明，Desk 据此禁用入口。
 */
class XiaohongshuThirdImAdapterTest {

    private final XiaohongshuThirdImAdapter adapter = new XiaohongshuThirdImAdapter();

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
    void boundAccountAnswersSuccessWithoutPersisting() {
        // 接收信封/验签/应答规格未公开（§14.1）：不落库，按成功应答防重推风暴
        ChannelReceiveResult result = adapter.receive(account(true), Map.of(), new HttpHeaders(),
            "{\"whatever\":\"push\"}");
        assertThat(result.response()).isEqualTo(ChannelCallbackResult.success());
        assertThat(result.message()).isNull();
    }

    @Test
    void restrictionsArePlatformLevelRegardlessOfCredentials() {
        // 发送与素材读取恒平台限制：凭据缺失与齐全同判，与凭据缺失限制区分
        assertThat(adapter.sendRestriction(account(false))).isNotBlank();
        assertThat(adapter.mediaRestriction(account(false))).isNotBlank();
        assertThat(adapter.sendRestriction(account(true)))
            .isEqualTo("小红书私信三方发送未开放：收发接口规格随平台开白下发"
                + "（docs/research/channels/xiaohongshu.md §14.7），规格到手前不实现");
        assertThat(adapter.mediaRestriction(account(true)))
            .isEqualTo("小红书私信三方素材读取未开放：媒体接口规格随平台开白下发"
                + "（docs/research/channels/xiaohongshu.md §14.7），规格到手前不实现");

        // 注册表拦截外的直呼（防御路径）同样如实失败
        assertThat(adapter.send(account(true), "u", "hi").succeeded()).isFalse();
        assertThat(adapter.readMedia(account(true), "m").succeeded()).isFalse();
    }

    // ---- 夹具 ----

    // bound=false 时仅缺绑定身份（appId），true 时绑定与令牌齐全
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
        } else {
            info.put("secret", "1234abc");
        }
        account.setChannelInfo(info);
        return account;
    }
}
