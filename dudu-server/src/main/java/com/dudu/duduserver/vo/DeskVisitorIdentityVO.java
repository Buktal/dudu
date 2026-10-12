package com.dudu.duduserver.vo;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * 访客身份投影：id 与 Conversation.id 相同；渠道账户字段由现有 company_channel 派生；
 * name/avatarUrl 渠道缺失时省略，渠道与账号 ID 对外为十进制字符串。
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record DeskVisitorIdentityVO(
    String id,
    String externalUserId,
    String name,
    String avatarUrl,
    String channelId,
    String channelName,
    String accountId,
    String accountName) {
}
