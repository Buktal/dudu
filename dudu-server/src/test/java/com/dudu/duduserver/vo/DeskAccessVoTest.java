package com.dudu.duduserver.vo;

import com.dudu.duduserver.constant.ChannelEnum;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 直测 DeskAccessVO.containsAccount 的 String/Long 口径契约：
 * 渠道账号 ID 以十进制字符串承载，null 输入永不匹配。
 */
class DeskAccessVoTest {

    @Test
    void containsAccountMatchesDecimalStringAgainstLongId() {
        DeskAccessVO access = new DeskAccessVO(false, List.of(), List.of(account("51")));

        assertThat(access.containsAccount(51L)).isTrue();
    }

    @Test
    void containsAccountRejectsIdOutsideAuthorizedAccounts() {
        DeskAccessVO access = new DeskAccessVO(false, List.of(), List.of(account("51")));

        assertThat(access.containsAccount(52L)).isFalse();
    }

    @Test
    void containsAccountTreatsNullInputAsNoMatch() {
        DeskAccessVO access = new DeskAccessVO(false, List.of(), List.of(account("51")));

        assertThat(access.containsAccount(null)).isFalse();
    }

    // 与 DeskAccessServiceImpl 装配出的账号形态一致：十进制字符串 ID + 组 ID + 渠道 + 名称
    private DeskAccessVO.Account account(String companyChannelId) {
        return new DeskAccessVO.Account(companyChannelId, "7", ChannelEnum.WECHAT_MP, "公众号账号");
    }
}
