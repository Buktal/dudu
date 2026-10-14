package com.dudu.duduserver.constant;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 渠道枚举验收：各渠道按票面口径落码值与显示名，数据库与 JSON 均交换业务代码。
 */
class ChannelEnumTest {

    @Test
    void wechatMiniCarriesTheTicketCodeAndDisplayName() {
        assertThat(ChannelEnum.WECHAT_MINI.getCode()).isEqualTo("wechat-mini");
        assertThat(ChannelEnum.WECHAT_MINI.getDisplayName()).isEqualTo("微信小程序");
        assertThat(ChannelEnum.fromCode("wechat-mini")).isEqualTo(ChannelEnum.WECHAT_MINI);
    }

    @Test
    void xiaohongshuKeepsThePreexistingCodeAndDisplayNameUnchanged() {
        // #117 动工前枚举已存在：码值与显示名维持原样，接入不改值
        assertThat(ChannelEnum.XIAOHONGSHU.getCode()).isEqualTo("xiaohongshu");
        assertThat(ChannelEnum.XIAOHONGSHU.getDisplayName()).isEqualTo("小红书");
        assertThat(ChannelEnum.fromCode("xiaohongshu")).isEqualTo(ChannelEnum.XIAOHONGSHU);
    }

    @Test
    void weiboCarriesTheTicketCodeAndDisplayName() {
        assertThat(ChannelEnum.WEIBO.getCode()).isEqualTo("weibo");
        assertThat(ChannelEnum.WEIBO.getDisplayName()).isEqualTo("微博");
        assertThat(ChannelEnum.fromCode("weibo")).isEqualTo(ChannelEnum.WEIBO);
    }

    @Test
    void telegramCarriesTheTicketCodeAndDisplayName() {
        // #107：码值沿用 mock-pulse config.rs 的 serde 键 telegram
        assertThat(ChannelEnum.TELEGRAM.getCode()).isEqualTo("telegram");
        assertThat(ChannelEnum.TELEGRAM.getDisplayName()).isEqualTo("Telegram");
        assertThat(ChannelEnum.fromCode("telegram")).isEqualTo(ChannelEnum.TELEGRAM);
    }
}
