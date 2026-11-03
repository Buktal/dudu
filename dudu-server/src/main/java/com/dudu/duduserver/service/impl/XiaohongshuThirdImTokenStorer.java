package com.dudu.duduserver.service.impl;

import com.dudu.duduserver.channel.xiaohongshuthirdim.XiaohongshuThirdImTokenStore;
import com.dudu.duduserver.entity.CompanyChannelDO;
import com.dudu.duduserver.service.CompanyChannelService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 小红书私信三方令牌轮换产物持久化：读-改-写 channel_info 的 accessToken/refreshToken
 * 两键（键名与渠道凭据及 Console 定义一致），其余键不动。渠道账号表无乐观锁，Console
 * 凭据保存与轮换回写并发时后者覆盖前者，被覆盖一方待下次轮换或重新录入收敛，如实
 * 记录不做分布式协调（单实例自部署模型）。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class XiaohongshuThirdImTokenStorer implements XiaohongshuThirdImTokenStore {

    private static final String INFO_ACCESS_TOKEN = "accessToken";
    private static final String INFO_REFRESH_TOKEN = "refreshToken";

    private final CompanyChannelService accounts;

    @Override
    public void store(Long companyChannelId, String accessToken, String refreshToken) {
        CompanyChannelDO account = accounts.getById(companyChannelId);
        if (account == null) {
            log.warn("[xiaohongshu-third-im] 令牌回写失败：渠道账号不存在, companyChannelId={}", companyChannelId);
            return;
        }
        Map<String, Object> info = new LinkedHashMap<>(
            account.getChannelInfo() == null ? Map.of() : account.getChannelInfo());
        info.put(INFO_ACCESS_TOKEN, accessToken);
        info.put(INFO_REFRESH_TOKEN, refreshToken);
        account.setChannelInfo(info);
        accounts.updateById(account);
    }
}
