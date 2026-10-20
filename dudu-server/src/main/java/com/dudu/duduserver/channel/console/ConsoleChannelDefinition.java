package com.dudu.duduserver.channel.console;

import com.dudu.duduserver.constant.ChannelEnum;
import java.util.List;

/**
 * Console 可编辑字段与渠道侧准备说明；字段来源为当前渠道适配器与已定配置契约。
 */
public record ConsoleChannelDefinition(ChannelEnum channel, String name, Boolean available, String restriction,
                                       List<Field> fields, List<String> notes) {
    public record Field(String key, String label, Boolean secret, Boolean requiredForReceive,
                        Boolean requiredForSend, Boolean immutableOnceConfigured, String control) {
    }
}
