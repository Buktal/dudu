package com.dudu.duduserver.vo;

import com.dudu.duduserver.constant.ChannelEnum;

import java.util.List;

/**
 * 员工当前可接待范围：allGroups 仅企业初始管理员为 true，组与账号每次按持久数据实时读取，
 * 空数组只表示当前没有相应数据。
 */
public record DeskAccessVO(Boolean allGroups, List<Group> groups, List<Account> accounts) {

    // 当前有权访问的本企业用户组
    public record Group(String groupId, String groupName) {
    }

    // 当前授权组内的本企业渠道账号；channel 为平台代码，不代表已具备发送能力
    public record Account(String companyChannelId, String groupId, ChannelEnum channel, String accountName) {
    }

    // 契约将渠道账号 ID 定为十进制字符串；此处收拢 String/Long 比较口径
    public boolean containsAccount(Long companyChannelId) {
        return accounts().stream()
            .anyMatch(account -> account.companyChannelId().equals(String.valueOf(companyChannelId)));
    }
}
