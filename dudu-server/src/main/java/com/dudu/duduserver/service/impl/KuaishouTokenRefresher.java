package com.dudu.duduserver.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.dudu.duduserver.channel.kuaishou.KuaishouCredentials;
import com.dudu.duduserver.channel.kuaishou.KuaishouOAuthClient;
import com.dudu.duduserver.constant.ChannelEnum;
import com.dudu.duduserver.entity.CompanyChannelDO;
import com.dudu.duduserver.service.CompanyChannelService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.ZoneId;

/**
 * 快手 accessToken 刷新 job（docs/research/channels/kuaishou.md §8）：access_token
 * 默认 86400s 寿命，refresh_token 每次刷新轮换（次数上限无官方记载，按平台常规
 * 每天一刷）。每 12 小时巡检，距上次刷新满 20 小时才刷（24h 寿命留 4h 缓冲，一轮
 * 失败 12h 后重试时 refresh_token 仍可轮换）；到期时刻优先取 channel_info 的
 * refreshTokenRenewedAt（上次刷新成功时刻），缺失时以账号最后修改时刻近似首次
 * 录入授权时刻。凭据不全或刷新失败的账号留痕后继续处理其余账号；803000/803001
 * （token 过期）只能人工重新授权，如实记录不重试。启动 5 分钟后先巡检一轮，尽早
 * 暴露重启后库内令牌已失效的情况。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class KuaishouTokenRefresher {

    // @Scheduled 注解值须为编译期常量：12 小时巡检（43200000ms）与 5 分钟（300000ms）
    private static final long CHECK_INTERVAL_MILLIS = 12L * 60 * 60 * 1000;
    private static final long INITIAL_DELAY_MILLIS = 5L * 60 * 1000;

    // 刷新间隔 20h：正常节奏下每天一刷（20h 到期 + 12h 巡检相位），轮换频度同平台常规
    private static final long REFRESH_INTERVAL_MILLIS = 20L * 60 * 60 * 1000;

    // channel_info 服务端键：上次刷新成功时刻（epoch millis），与凭据键同字典
    private static final String INFO_RENEWED_AT = "refreshTokenRenewedAt";

    private final CompanyChannelService accounts;

    private final KuaishouOAuthClient oauth;

    @Scheduled(fixedDelay = CHECK_INTERVAL_MILLIS, initialDelay = INITIAL_DELAY_MILLIS)
    public void refreshAll() {
        for (CompanyChannelDO account : accounts.list(new LambdaQueryWrapper<CompanyChannelDO>()
            .eq(CompanyChannelDO::getChannel, ChannelEnum.KUAISHOU))) {
            refresh(account);
        }
    }

    private void refresh(CompanyChannelDO account) {
        KuaishouCredentials credentials = KuaishouCredentials.of(account);
        if (credentials == null || credentials.refreshToken() == null) {
            log.info("[kuaishou] 跳过 accessToken 刷新：未完成授权, companyChannelId={}",
                account.getCompanyChannelId());
            return;
        }
        if (!due(account)) {
            return;
        }
        KuaishouOAuthClient.RefreshResult result = oauth.refresh(account, credentials);
        if (!result.succeeded()) {
            log.warn("[kuaishou] accessToken 刷新失败, companyChannelId={}, reason={}",
                account.getCompanyChannelId(), result.failureReason());
            return;
        }
        log.info("[kuaishou] accessToken 刷新完成, companyChannelId={}", account.getCompanyChannelId());
    }

    // 到期判断：上次刷新时刻（无记录时以账号最后修改时刻近似首录时刻）距今满 20h
    private boolean due(CompanyChannelDO account) {
        Object renewedAt = account.getChannelInfo() == null
            ? null : account.getChannelInfo().get(INFO_RENEWED_AT);
        long since = renewedAt instanceof Number number ? number.longValue()
            : account.getUpdateTime() == null ? 0L
            : account.getUpdateTime().atZone(ZoneId.systemDefault()).toInstant().toEpochMilli();
        return System.currentTimeMillis() - since >= REFRESH_INTERVAL_MILLIS;
    }
}
