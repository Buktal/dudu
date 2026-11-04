package com.dudu.duduserver.service.impl;

import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.dudu.duduserver.channel.kuaishou.KuaishouTokenStore;
import com.dudu.duduserver.entity.CompanyChannelDO;
import com.dudu.duduserver.service.CompanyChannelService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 快手 oauth2 轮换产物持久化：读-改-写 channel_info 的 accessToken、refreshToken
 * 与 refreshTokenRenewedAt 三键（服务端刷新时刻，epoch millis，键名与抖音续期时刻
 * 同义复用——两渠道各自按 ChannelEnum 过滤互不干扰），其余键不动；更新带「库内
 * refreshToken 仍为本轮送审旧值」的条件（§8 轮换要求落库原子更新并防并发双刷——
 * JSON 列内部键的等值条件无法用 Lambda 表达，用 MP 支持的 SQL 片段），未生效返回
 * false 促调用方放弃本次产物；账号不存在同此处理——轮换链路以库内最新值为准，
 * 放弃即可收敛。
 */
@Component
@RequiredArgsConstructor
public class KuaishouTokenStorer implements KuaishouTokenStore {

    private static final String INFO_ACCESS_TOKEN = "accessToken";
    private static final String INFO_REFRESH_TOKEN = "refreshToken";
    private static final String INFO_RENEWED_AT = "refreshTokenRenewedAt";

    private final CompanyChannelService accounts;

    @Override
    public boolean storeIfCurrent(Long companyChannelId, String expectedRefreshToken,
        String newAccessToken, String newRefreshToken, long refreshedAtMillis) {
        CompanyChannelDO account = accounts.getById(companyChannelId);
        if (account == null) {
            return false;
        }
        Map<String, Object> info = new LinkedHashMap<>(
            account.getChannelInfo() == null ? Map.of() : account.getChannelInfo());
        // 快速短路：读到的已不是本轮送审的旧值（并发刷新或重新录入），不再出 UPDATE
        if (!expectedRefreshToken.equals(info.get(INFO_REFRESH_TOKEN))) {
            return false;
        }
        info.put(INFO_ACCESS_TOKEN, newAccessToken);
        info.put(INFO_REFRESH_TOKEN, newRefreshToken);
        info.put(INFO_RENEWED_AT, refreshedAtMillis);
        CompanyChannelDO patch = new CompanyChannelDO();
        patch.setChannelInfo(info);
        // 条件更新兜底读-改-写窗口内的并发改写：库内 refreshToken 仍为旧值才落库
        return accounts.update(patch, new LambdaUpdateWrapper<CompanyChannelDO>()
            .eq(CompanyChannelDO::getCompanyChannelId, companyChannelId)
            .apply("JSON_UNQUOTE(JSON_EXTRACT(channel_info, '$.refreshToken')) = {0}", expectedRefreshToken));
    }
}
