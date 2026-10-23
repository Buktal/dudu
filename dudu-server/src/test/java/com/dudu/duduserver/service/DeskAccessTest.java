package com.dudu.duduserver.service;

import com.dudu.duduserver.constant.ChannelEnum;
import com.dudu.duduserver.entity.CompanyChannelDO;
import com.dudu.duduserver.entity.UserGroupDO;
import com.dudu.duduserver.vo.DeskAccessVO;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * DeskAccess 领域对象验证：权限判断走 Long 口径集合（null 永不匹配），契约投影
 * 把组与账号 ID 转为十进制字符串（契约将组与账号 ID 定为字符串）。
 */
class DeskAccessTest {

    @Test
    void containsChannelMatchesLongIdAgainstAuthorizedAccounts() {
        DeskAccess access = DeskAccess.of(false, List.of(group(31L)), List.of(account(51L, 31L)));

        assertThat(access.containsChannel(51L)).isTrue();
        assertThat(access.containsChannel(52L)).isFalse();
        assertThat(access.containsChannel(null)).isFalse();
    }

    @Test
    void toVOProjectsIdsAsDecimalStringsAndKeepsAccountFields() {
        DeskAccess access = DeskAccess.of(true, List.of(group(31L)), List.of(account(51L, 31L)));

        DeskAccessVO vo = access.toVO();

        assertThat(vo.allGroups()).isTrue();
        assertThat(vo.groups()).hasSize(1);
        assertThat(vo.groups().get(0).groupId()).isEqualTo("31");
        assertThat(vo.groups().get(0).groupName()).isEqualTo("售前");
        assertThat(vo.accounts()).hasSize(1);
        assertThat(vo.accounts().get(0).companyChannelId()).isEqualTo("51");
        assertThat(vo.accounts().get(0).groupId()).isEqualTo("31");
        assertThat(vo.accounts().get(0).channel()).isEqualTo(ChannelEnum.WECHAT_MP);
        assertThat(vo.accounts().get(0).accountName()).isEqualTo("公众号");
    }

    // 与 DeskAccessServiceImpl 装配出的行形态一致：Long 标识 + 组 + 渠道 + 名称
    private UserGroupDO group(Long groupId) {
        UserGroupDO group = new UserGroupDO();
        group.setGroupId(groupId);
        group.setGroupName("售前");
        return group;
    }

    private CompanyChannelDO account(Long companyChannelId, Long groupId) {
        CompanyChannelDO account = new CompanyChannelDO();
        account.setCompanyChannelId(companyChannelId);
        account.setGroupId(groupId);
        account.setChannel(ChannelEnum.WECHAT_MP);
        account.setAccountName("公众号");
        return account;
    }
}
