package com.dudu.duduserver.constant;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 渠道枚举验收：微信小程序按票面口径落码值与显示名，数据库与 JSON 均交换业务代码。
 */
class ChannelEnumTest {

    @Test
    void wechatMiniCarriesTheTicketCodeAndDisplayName() {
        assertThat(ChannelEnum.WECHAT_MINI.getCode()).isEqualTo("wechat-mini");
        assertThat(ChannelEnum.WECHAT_MINI.getDisplayName()).isEqualTo("微信小程序");
        assertThat(ChannelEnum.fromCode("wechat-mini")).isEqualTo(ChannelEnum.WECHAT_MINI);
    }
}
