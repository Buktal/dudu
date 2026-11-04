package com.dudu.duduserver.service.impl;

import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.dudu.duduserver.channel.douyin.DouyinRefreshTokenStore;
import com.dudu.duduserver.entity.CompanyChannelDO;
import com.dudu.duduserver.service.CompanyChannelService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 抖音 refreshToken 轮换产物持久化：读-改-写 channel_info 的 refreshToken 与
 * refreshTokenRenewedAt 两键（服务端续期时刻，epoch millis），其余键不动；
 * 更新带「库内 refreshToken 仍为本轮送审旧值」的条件（§9.6 轮换要求落库原子
 * 更新并防并发双刷——JSON 列内部键的等值条件无法用 Lambda 表达，用 MP 支持的
 * SQL 片段），未生效返回 false 促调用方放弃本次产物；账号不存在同此处理——
 * 轮换链路以库内最新值为准，放弃即可收敛，无须小红书回写失败的促重试语义。
 */
@Component
@RequiredArgsConstructor
public class DouyinRefreshTokenStorer implements DouyinRefreshTokenStore {

    private static final String INFO_REFRESH_TOKEN = "refreshToken";
    private static final String INFO_RENEWED_AT = "refreshTokenRenewedAt";

    private final CompanyChannelService accounts;

    @Override
    public boolean storeIfCurrent(Long companyChannelId, String expectedRefreshToken,
        String newRefreshToken, long renewedAtMillis) {
        CompanyChannelDO account = accounts.getById(companyChannelId);
        if (account == null) {
            return false;
        }
        Map<String, Object> info = new LinkedHashMap<>(
            account.getChannelInfo() == null ? Map.of() : account.getChannelInfo());
        // 快速短路：读到的已不是本轮送审的旧值（并发续期或重新录入），不再出 UPDATE
        if (!expectedRefreshToken.equals(info.get(INFO_REFRESH_TOKEN))) {
            return false;
        }
        info.put(INFO_REFRESH_TOKEN, newRefreshToken);
        info.put(INFO_RENEWED_AT, renewedAtMillis);
        CompanyChannelDO patch = new CompanyChannelDO();
        patch.setChannelInfo(info);
        // 条件更新兜底读-改-写窗口内的并发改写：库内 refreshToken 仍为旧值才落库
        return accounts.update(patch, new LambdaUpdateWrapper<CompanyChannelDO>()
            .eq(CompanyChannelDO::getCompanyChannelId, companyChannelId)
            .apply("JSON_UNQUOTE(JSON_EXTRACT(channel_info, '$.refreshToken')) = {0}", expectedRefreshToken));
    }
}
