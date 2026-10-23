package com.dudu.duduserver.service;

import com.dudu.duduserver.entity.CompanyChannelDO;
import com.dudu.duduserver.entity.UserGroupDO;
import com.dudu.duduserver.vo.DeskAccessVO;

import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 员工当前可接待范围（领域对象）：服务端权限判断与查询过滤走 Long 口径——账号标识
 * 集合 O(1) 判断、账号行直接过滤；契约输出经 {@link #toVO()} 投影为字符串 ID。每次
 * 按持久数据实时计算，不缓存。
 */
public record DeskAccess(boolean allGroups, List<UserGroupDO> groups, Set<Long> channelIds,
                         List<CompanyChannelDO> accounts) {

    // 组装入口：channelIds 由账号行派生，调用方不重复计算
    public static DeskAccess of(boolean allGroups, List<UserGroupDO> groups, List<CompanyChannelDO> accounts) {
        return new DeskAccess(allGroups, groups,
            accounts.stream().map(CompanyChannelDO::getCompanyChannelId).collect(Collectors.toSet()), accounts);
    }

    // 渠道账号是否在授权范围内：服务端权限判断统一入口
    public boolean containsChannel(Long companyChannelId) {
        return companyChannelId != null && channelIds.contains(companyChannelId);
    }

    // 契约投影：组与账号 ID 转十进制字符串（契约将组与账号 ID 定为字符串），空数组只表示当前没有相应数据
    public DeskAccessVO toVO() {
        return new DeskAccessVO(allGroups,
            groups.stream().map(group -> new DeskAccessVO.Group(String.valueOf(group.getGroupId()),
                group.getGroupName())).toList(),
            accounts.stream().map(account -> new DeskAccessVO.Account(
                String.valueOf(account.getCompanyChannelId()), String.valueOf(account.getGroupId()),
                account.getChannel(), account.getAccountName())).toList());
    }
}
