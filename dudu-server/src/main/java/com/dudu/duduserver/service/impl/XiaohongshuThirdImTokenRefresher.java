package com.dudu.duduserver.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.dudu.duduserver.channel.support.TokenResult;
import com.dudu.duduserver.channel.xiaohongshuthirdim.XiaohongshuThirdImCredentials;
import com.dudu.duduserver.channel.xiaohongshuthirdim.XiaohongshuThirdImTokenClient;
import com.dudu.duduserver.constant.ChannelEnum;
import com.dudu.duduserver.entity.CompanyChannelDO;
import com.dudu.duduserver.service.CompanyChannelService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 小红书私信三方令牌轮换 job：refresh_token 30 天有效且每次刷新重置窗口
 * （docs/research/channels/xiaohongshu.md §13.4），每 12 小时轮换一次保持滚动有效，
 * access_token 一天寿命同时常新（轮换在过期前与窗口过半前完成）。凭据不全或刷新
 * 失败的账号留痕后继续处理其余账号；refresh_token 失效后只能重新人工授权录入。
 * 启动 5 分钟后先轮换一轮，尽早暴露重启后库内令牌已失效的情况。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class XiaohongshuThirdImTokenRefresher {

    // @Scheduled 注解值须为编译期常量：12 小时（43200000ms）与 5 分钟（300000ms）
    // access_token 一天寿命（示例 86399s）：12 小时轮换间隔下过期前必有一轮成功
    private static final long REFRESH_INTERVAL_MILLIS = 12L * 60 * 60 * 1000;
    private static final long INITIAL_DELAY_MILLIS = 5L * 60 * 1000;

    private final CompanyChannelService accounts;

    private final XiaohongshuThirdImTokenClient tokenClient;

    @Scheduled(fixedDelay = REFRESH_INTERVAL_MILLIS, initialDelay = INITIAL_DELAY_MILLIS)
    public void refreshAll() {
        for (CompanyChannelDO account : accounts.list(new LambdaQueryWrapper<CompanyChannelDO>()
            .eq(CompanyChannelDO::getChannel, ChannelEnum.XIAOHONGSHU_THIRD_IM))) {
            refresh(account);
        }
    }

    private void refresh(CompanyChannelDO account) {
        XiaohongshuThirdImCredentials credentials = XiaohongshuThirdImCredentials.of(account);
        if (credentials == null || credentials.refreshToken() == null) {
            log.info("[xiaohongshu-third-im] 跳过令牌轮换：未完成授权, companyChannelId={}",
                account.getCompanyChannelId());
            return;
        }
        TokenResult result = tokenClient.refresh(account, credentials);
        if (!result.succeeded()) {
            log.warn("[xiaohongshu-third-im] 令牌轮换失败, companyChannelId={}, reason={}",
                account.getCompanyChannelId(), result.failureReason());
            return;
        }
        log.info("[xiaohongshu-third-im] 令牌轮换完成, companyChannelId={}", account.getCompanyChannelId());
    }
}
