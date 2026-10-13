package com.dudu.duduserver.service.impl;

import com.dudu.duduserver.channel.ChannelCallbackResult;
import com.dudu.duduserver.channel.ChannelInboundMessage;
import com.dudu.duduserver.channel.WechatMpProtocol;
import com.dudu.duduserver.constant.ChannelEnum;
import com.dudu.duduserver.entity.CompanyChannelDO;
import com.dudu.duduserver.service.ChannelCallbackService;
import com.dudu.duduserver.service.CompanyChannelService;
import com.dudu.duduserver.service.DeskInboundService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.Optional;

/**
 * 渠道回调实现：按账号现存渠道路由到已接入的协议——本票只接入微信公众号明文模式
 * （账号 channel_info.token 为回调验签 Token）；其他渠道、加密模式或未配置 Token
 * 一律返回不支持，不模拟成功。签名失败拒绝，报文无法解析按参数错误拒绝。
 */
@Service
@RequiredArgsConstructor
public class ChannelCallbackServiceImpl implements ChannelCallbackService {

    // 公众号服务器配置的 Token，用于三参签名比对
    private static final String INFO_TOKEN = "token";

    // 兼容/安全模式的标识参数；需要 EncodingAESKey 解密，本票未接入
    private static final String PARAM_ENCRYPT_TYPE = "encrypt_type";

    private final CompanyChannelService companyChannelService;
    private final WechatMpProtocol wechatMpProtocol;
    private final DeskInboundService deskInboundService;

    @Override
    public ChannelCallbackResult verifyUrl(String companyChannelId, Map<String, String> query) {
        CompanyChannelDO account = findAccount(companyChannelId);
        if (account == null) {
            return ChannelCallbackResult.notFound();
        }
        String token = wechatMpToken(account);
        if (token == null) {
            return ChannelCallbackResult.unsupported();
        }
        if (!wechatMpProtocol.verify(token, query.get("signature"), query.get("timestamp"), query.get("nonce"))) {
            return ChannelCallbackResult.rejected();
        }
        String echostr = query.get("echostr");
        if (echostr == null || echostr.isEmpty()) {
            return ChannelCallbackResult.badRequest();
        }
        return ChannelCallbackResult.echo(echostr);
    }

    @Override
    public ChannelCallbackResult receive(String companyChannelId, Map<String, String> query, String body) {
        CompanyChannelDO account = findAccount(companyChannelId);
        if (account == null) {
            return ChannelCallbackResult.notFound();
        }
        String token = wechatMpToken(account);
        if (token == null || query.containsKey(PARAM_ENCRYPT_TYPE)) {
            return ChannelCallbackResult.unsupported();
        }
        if (!wechatMpProtocol.verify(token, query.get("signature"), query.get("timestamp"), query.get("nonce"))) {
            return ChannelCallbackResult.rejected();
        }
        Optional<ChannelInboundMessage> inbound;
        try {
            inbound = wechatMpProtocol.parse(account.getCompanyChannelId(), body);
        } catch (IllegalArgumentException e) {
            return ChannelCallbackResult.badRequest();
        }
        if (inbound.isEmpty()) {
            // 事件推送不是访客消息：只按渠道要求应答，不产生访客与消息数据
            return ChannelCallbackResult.success();
        }
        deskInboundService.accept(account, inbound.get());
        return ChannelCallbackResult.success();
    }

    // 只接入微信公众号协议：其他渠道代码与未配置 Token 的账号都按不支持处理
    private String wechatMpToken(CompanyChannelDO account) {
        if (account.getChannel() != ChannelEnum.WECHAT_MP) {
            return null;
        }
        Map<String, Object> info = account.getChannelInfo();
        Object token = info == null ? null : info.get(INFO_TOKEN);
        return token instanceof String value && !value.isEmpty() ? value : null;
    }

    private CompanyChannelDO findAccount(String companyChannelId) {
        try {
            return companyChannelService.getById(Long.valueOf(companyChannelId));
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
