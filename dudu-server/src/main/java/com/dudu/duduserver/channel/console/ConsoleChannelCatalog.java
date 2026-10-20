package com.dudu.duduserver.channel.console;

import com.dudu.duduserver.channel.ChannelAdapterRegistry;
import com.dudu.duduserver.config.exception.BizException;
import com.dudu.duduserver.constant.ApiEnum;
import com.dudu.duduserver.constant.ChannelEnum;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import java.util.List;

/**
 * 配置定义与实际适配器的交集；部署限制只决定是否可新增，不伪造连接健康状态。
 */
@Component
@RequiredArgsConstructor
public class ConsoleChannelCatalog {
    private final ChannelAdapterRegistry adapters;
    private final ConsoleCallbackUrls callbackUrls;

    public List<ConsoleChannelDefinition> list(String requestOrigin) {
        return ConsoleChannelDefinitions.ALL.stream().filter(definition -> adapters.get(definition.channel()) != null)
            .map(definition -> {
                boolean available = definition.channel() != ChannelEnum.MEITUAN || callbackUrls.meituanAvailable(requestOrigin);
                return new ConsoleChannelDefinition(definition.channel(), definition.name(), available,
                    available ? "" : "当前部署未配置公开 HTTP 80/8080 回调入口，美团暂不可接入", definition.fields(), definition.notes());
            }).toList();
    }

    public void requireAvailable(ChannelEnum channel, String requestOrigin) {
        if (list(requestOrigin).stream().noneMatch(definition -> definition.channel() == channel && definition.available())) {
            throw new BizException(ApiEnum.DATA_NOT_ALLOW, "当前渠道或部署不支持新增账号");
        }
    }
}
