package com.dudu.duduserver.channel.meituan;

import com.dudu.duduserver.channel.ChannelMediaResult;
import com.dudu.duduserver.constant.ChannelEnum;
import com.dudu.duduserver.entity.CompanyChannelDO;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 美团素材读取验证（docs/research/channels/meituan.md §7 第 5/6 条、§8 第 7 条；票面渠道
 * 要点 4）：官方素材下载接口未实锤、不编造下载链路——未配置凭据按受限说明，凭据齐备也
 * 如实返回「接口未实锤」失败，均不发起任何渠道请求。
 */
class MeituanMediaReaderTest {

    private final MeituanMediaReader reader = new MeituanMediaReader();

    @Test
    void reportsMissingCredentialsHonestly() {
        ChannelMediaResult result = reader.read(meituanAccount(Map.of("app_id", "mt-app-1")), "media-1");

        assertThat(result.succeeded()).isFalse();
        assertThat(result.failureReason()).isEqualTo("渠道素材凭据未配置");
    }

    @Test
    void reportsTheUnconfirmedApiInsteadOfFabricatingBytes() {
        // 凭据齐备也如实说明边界：官方素材接口未实锤（§8 第 7 条），不返回伪装的字节
        ChannelMediaResult result = reader.read(meituanAccount(fullInfo()), "media-1");

        assertThat(result.succeeded()).isFalse();
        assertThat(result.failureReason()).isEqualTo("美团渠道素材接口未实锤，暂无法读取素材");
    }

    private Map<String, Object> fullInfo() {
        Map<String, Object> info = new HashMap<>();
        info.put("app_id", "mt-app-1");
        info.put("app_secret", "mt-secret-1");
        return info;
    }

    private CompanyChannelDO meituanAccount(Map<String, Object> channelInfo) {
        CompanyChannelDO account = new CompanyChannelDO();
        account.setCompanyChannelId(4101L);
        account.setChannel(ChannelEnum.MEITUAN);
        account.setChannelInfo(channelInfo);
        return account;
    }
}
