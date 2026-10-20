package com.dudu.duduserver.vo;

import com.dudu.duduserver.constant.ChannelEnum;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * 企业渠道账号安全视图，详情仅有白名单非秘密字段与秘密存在标记。
 */
public final class ConsoleChannelVO {
    private ConsoleChannelVO() {
    }

    public record Account(String companyChannelId, String groupId, String groupName, ChannelEnum channel,
                          String accountName, Boolean receiveConfigured, Boolean sendConfigured,
                          List<String> missingReceiveFields, List<String> missingSendFields,
                          LocalDateTime createTime, LocalDateTime updateTime) {
    }

    public record Detail(String companyChannelId, String groupId, String groupName, ChannelEnum channel,
                         String accountName, Boolean receiveConfigured, Boolean sendConfigured,
                         List<String> missingReceiveFields, List<String> missingSendFields,
                         LocalDateTime createTime, LocalDateTime updateTime, String callbackUrl,
                         Map<String, String> fields, List<String> configuredSecretFields, List<String> notes) {
    }
}
