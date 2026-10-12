package com.dudu.duduserver.channel;

import com.dudu.duduserver.entity.CompanyChannelDO;

/**
 * 出站渠道发送边界：把授权访客的纯文本发给账号对应的渠道，返回成功/失败说明及渠道
 * 给出的消息标识。实现负责把渠道协议与异常翻译成结果，不在此抛业务异常；发送结果的
 * 落库与推送由 Desk 发送流程负责。
 */
public interface ChannelOutboundSender {

    ChannelSendResult send(CompanyChannelDO account, String externalUserId, String text);
}
