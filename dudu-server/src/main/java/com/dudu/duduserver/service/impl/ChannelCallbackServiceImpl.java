package com.dudu.duduserver.service.impl;

import com.dudu.duduserver.channel.ChannelAdapter;
import com.dudu.duduserver.channel.ChannelAdapterRegistry;
import com.dudu.duduserver.channel.ChannelCallbackResult;
import com.dudu.duduserver.channel.ChannelReceiveResult;
import com.dudu.duduserver.entity.CompanyChannelDO;
import com.dudu.duduserver.service.ChannelCallbackService;
import com.dudu.duduserver.service.CompanyChannelService;
import com.dudu.duduserver.service.DeskInboundService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Service;

import java.util.Map;

/**
 * 渠道回调实现：按账号现存渠道查注册表分派，零渠道分支；未接入渠道的账号一律返回
 * 不支持，不模拟成功。query 与 headers 原样交给适配器，渠道差异全部住在实现内；入站
 * 落库保持业务层：适配器解析出访客消息后由 deskInboundService.accept 保存。
 * query 与 headers 的原样透传是渠道协议边界的务实处理，不是可推广的接口模式。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ChannelCallbackServiceImpl implements ChannelCallbackService {

    private final CompanyChannelService companyChannelService;
    private final ChannelAdapterRegistry channelAdapters;
    private final DeskInboundService deskInboundService;

    @Override
    public ChannelCallbackResult verifyUrl(String companyChannelId, Map<String, String> query, HttpHeaders headers) {
        CompanyChannelDO account = findAccount(companyChannelId);
        if (account == null) {
            return ChannelCallbackResult.notFound();
        }
        ChannelAdapter adapter = channelAdapters.get(account.getChannel());
        if (adapter == null) {
            return ChannelCallbackResult.unsupported();
        }
        try {
            return adapter.verifyUrl(account, query, headers);
        } catch (RuntimeException e) {
            // 验证阶段的意外解析异常（适配器只显式转换参数错误，hutool 取值类型不符等
            // RuntimeException 会漏出）：按参数错误应答 400，不外泄成 R 包装的 HTTP 200
            log.warn("[channel-callback] URL 验证处理异常, companyChannelId={}, channel={}",
                account.getCompanyChannelId(), account.getChannel(), e);
            return ChannelCallbackResult.badRequest();
        }
    }

    @Override
    public ChannelCallbackResult receive(String companyChannelId, Map<String, String> query, HttpHeaders headers,
                                         String body) {
        CompanyChannelDO account = findAccount(companyChannelId);
        if (account == null) {
            return ChannelCallbackResult.notFound();
        }
        ChannelAdapter adapter = channelAdapters.get(account.getChannel());
        if (adapter == null) {
            return ChannelCallbackResult.unsupported();
        }
        ChannelReceiveResult result;
        try {
            result = adapter.receive(account, query, headers, body);
        } catch (RuntimeException e) {
            // 解析/验签阶段的意外异常（适配器只显式转换参数错误，hutool 取值类型不符的
            // JSONException/ClassCastException 等会漏出）：报文内容所致、重推不可收敛，
            // 按参数错误应答 400 终止重推，不外泄成 R 包装的 HTTP 200
            log.warn("[channel-callback] 回调解析处理异常, companyChannelId={}, channel={}",
                account.getCompanyChannelId(), account.getChannel(), e);
            return ChannelCallbackResult.badRequest();
        }
        if (result.message() != null) {
            try {
                deskInboundService.accept(account, result.message());
            } catch (RuntimeException e) {
                // 落库未确认：按渠道协议以 5xx 应答触发重推，异常不外泄成 R 包装的 HTTP 200
                // （at-least-once 语义下重推由入站幂等判定收敛）
                log.error("[channel-callback] 来信落库失败, companyChannelId={}, externalMessageId={}",
                    account.getCompanyChannelId(), result.message().externalMessageId(), e);
                return ChannelCallbackResult.serverError();
            }
        }
        return result.response();
    }

    private CompanyChannelDO findAccount(String companyChannelId) {
        try {
            return companyChannelService.getById(Long.valueOf(companyChannelId));
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
