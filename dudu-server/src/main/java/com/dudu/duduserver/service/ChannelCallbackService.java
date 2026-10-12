package com.dudu.duduserver.service;

import com.dudu.duduserver.channel.ChannelCallbackResult;

import java.util.Map;

/**
 * 渠道回调入口服务：路由 /api/channels/{companyChannelId}/callback，账号由路由指定，
 * 外部调用不得提交 companyId；执行渠道自身的签名校验，不使用 Desk JWT 代替渠道验证。
 */
public interface ChannelCallbackService {

    // GET 渠道验证：签名有效时原样回显渠道提交的 echostr
    ChannelCallbackResult verifyUrl(String companyChannelId, Map<String, String> query);

    // POST 渠道推送：验签并解析渠道原格式报文，交给消息业务保存后回 success
    ChannelCallbackResult receive(String companyChannelId, Map<String, String> query, String body);
}
