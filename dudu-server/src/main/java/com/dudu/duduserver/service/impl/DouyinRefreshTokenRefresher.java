package com.dudu.duduserver.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.dudu.duduserver.channel.douyin.DouyinCredentials;
import com.dudu.duduserver.channel.douyin.DouyinOAuthClient;
import com.dudu.duduserver.constant.ChannelEnum;
import com.dudu.duduserver.entity.CompanyChannelDO;
import com.dudu.duduserver.service.CompanyChannelService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.ZoneId;

/**
 * 抖音 refreshToken 续期 job（docs/research/channels/douyin.md §9.6）：refresh_token
 * 30 天轮换凭证至多续 5 次，每 25 天续一次（30 天窗口留 5 天缓冲，一轮巡检失败
 * 次日仍在窗口内），每天巡检一轮到期账号。到期时刻优先取 channel_info 的
 * refreshTokenRenewedAt（上次续期成功时刻），缺失时以账号最后修改时刻近似首次
 * 录入授权时刻。凭据不全或续期失败的账号留痕后继续处理其余账号；10004（未申请
 * 权限）/10010（已过期）/10020（次数用尽）只能人工处置，如实记录不重试。启动
 * 10 分钟后先巡检一轮，尽早暴露重启后库内凭证已失效的情况。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class DouyinRefreshTokenRefresher {

    // @Scheduled 注解值须为编译期常量：每天巡检（86400000ms）与 10 分钟（600000ms）
    private static final long CHECK_INTERVAL_MILLIS = 24L * 60 * 60 * 1000;
    private static final long INITIAL_DELAY_MILLIS = 10L * 60 * 1000;

    // 续期间隔 25 天：25 天节奏下 5 次配额在第 125 天用尽，链路寿命约 155 天
    //（§9.6 上限算式 195 天为极限利用，缓冲优先于配额利用）
    private static final long RENEW_INTERVAL_MILLIS = 25L * 24 * 60 * 60 * 1000;

    // channel_info 服务端键：上次续期成功时刻（epoch millis），与凭据键同字典
    private static final String INFO_RENEWED_AT = "refreshTokenRenewedAt";

    private final CompanyChannelService accounts;

    private final DouyinOAuthClient renewer;

    @Scheduled(fixedDelay = CHECK_INTERVAL_MILLIS, initialDelay = INITIAL_DELAY_MILLIS)
    public void renewAll() {
        for (CompanyChannelDO account : accounts.list(new LambdaQueryWrapper<CompanyChannelDO>()
            .eq(CompanyChannelDO::getChannel, ChannelEnum.DOUYIN))) {
            renew(account);
        }
    }

    private void renew(CompanyChannelDO account) {
        DouyinCredentials credentials = DouyinCredentials.of(account);
        if (credentials == null || credentials.refreshToken() == null) {
            log.info("[douyin] 跳过 refreshToken 续期：未完成授权, companyChannelId={}",
                account.getCompanyChannelId());
            return;
        }
        if (!due(account)) {
            return;
        }
        DouyinOAuthClient.RenewResult result = renewer.renew(account, credentials);
        if (!result.succeeded()) {
            log.warn("[douyin] refreshToken 续期失败, companyChannelId={}, reason={}",
                account.getCompanyChannelId(), result.failureReason());
            return;
        }
        log.info("[douyin] refreshToken 续期完成, companyChannelId={}", account.getCompanyChannelId());
    }

    // 到期判断：上次续期时刻（无记录时以账号最后修改时刻近似首录时刻）距今满 25 天
    private boolean due(CompanyChannelDO account) {
        Object renewedAt = account.getChannelInfo() == null
            ? null : account.getChannelInfo().get(INFO_RENEWED_AT);
        long since = renewedAt instanceof Number number ? number.longValue()
            : account.getUpdateTime() == null ? 0L
            : account.getUpdateTime().atZone(ZoneId.systemDefault()).toInstant().toEpochMilli();
        return System.currentTimeMillis() - since >= RENEW_INTERVAL_MILLIS;
    }
}
