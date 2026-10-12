package com.dudu.duduserver.service;

import com.dudu.duduserver.channel.ChannelInboundMessage;
import com.dudu.duduserver.entity.CompanyChannelDO;

/**
 * 渠道入站信件业务：按来源唯一键找到或创建访客与空名片，保存消息、分配会话内 sequence、
 * 更新最后消息与接待状态，事务提交后向有权员工推送完整消息与访客摘要。
 */
public interface DeskInboundService {

    // 保存一条入站信件；账号由回调路由解析，不信任渠道报文中的企业归属
    void accept(CompanyChannelDO account, ChannelInboundMessage inbound);
}
