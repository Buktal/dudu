package com.dudu.duduserver.service;

import com.dudu.duduserver.config.auth.JwtUser;
import com.dudu.duduserver.dto.DeskSendDTO;
import com.dudu.duduserver.vo.DeskCapabilityVO;
import com.dudu.duduserver.vo.DeskMessageVO;

/**
 * Desk 文本回复服务：保存发送中消息后直接调用渠道发送，保存成功/失败结果再推送一次；
 * 权限复用访客守卫，能力投影与会话对象内的 capability 同源。
 */
public interface DeskReplyService {

    // 发送纯文本：HTTP 返回与推送共用同一条最终消息，渠道失败也返回已保存的 delivery.failed
    DeskMessageVO send(JwtUser me, String visitorId, DeskSendDTO request);

    // 当前访客的回复能力：可发时 allowed + text，未配置或不支持时 restricted 并说明原因
    DeskCapabilityVO capability(JwtUser me, String visitorId);
}
