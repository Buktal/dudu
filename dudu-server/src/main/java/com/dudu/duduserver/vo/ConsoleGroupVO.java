package com.dudu.duduserver.vo;

import java.time.LocalDateTime;

/**
 * 用户组管理视图，统计仅含企业内有效关联。
 */
public record ConsoleGroupVO(String groupId, String groupName, Long memberCount, Long channelAccountCount,
                             LocalDateTime createTime, LocalDateTime updateTime) {
}
