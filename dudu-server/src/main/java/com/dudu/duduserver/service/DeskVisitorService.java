package com.dudu.duduserver.service;

import com.dudu.duduserver.config.auth.JwtUser;
import com.dudu.duduserver.dto.DeskHistoryQueryDTO;
import com.dudu.duduserver.dto.DeskStatusDTO;
import com.dudu.duduserver.dto.DeskVisitorQueryDTO;
import com.dudu.duduserver.entity.VisitorDO;
import com.dudu.duduserver.vo.DeskConversationVO;
import com.dudu.duduserver.vo.DeskMessagePageVO;
import com.dudu.duduserver.vo.DeskVisitorPageVO;

/**
 * Desk 访客资源服务：先按当前授权账号范围筛选持久访客再做普通分页，计数与渠道来自数据库与
 * 现有账号关系；单访客快照、按需历史与接待状态变更共用同一份契约第 4 节投影；授权访客守卫
 * 公开为 Reply / Profile / Media 共用的读取 seam（归属本服务而非独立守卫类：授权判定依赖
 * 实时权限解析与访客查询，就近暴露避免消费方经 VO 契约回读）。
 */
public interface DeskVisitorService {

    // 授权访客守卫（Reply / Profile / Media 共用）：ID 非法 11000；不存在 12100；在库但不在当前权限内统一 10106
    VisitorDO requireAuthorizedVisitor(JwtUser me, String visitorId);

    // 授权范围内的访客摘要分页；counts 不受本次关键词、状态与渠道筛选影响
    DeskVisitorPageVO query(JwtUser me, DeskVisitorQueryDTO query);

    // 单访客当前快照：在库但不在当前权限内为 10106，不存在为 12100
    DeskConversationVO get(JwtUser me, String visitorId);

    // 按需历史：最近一页或 beforeSequence 之前的更早一页；权限与错误语义同单访客快照
    DeskMessagePageVO history(JwtUser me, String visitorId, DeskHistoryQueryDTO query);

    // 结束 / 继续接待：只改接待状态与等待计时，返回并推送后端保存的完整会话对象
    DeskConversationVO updateStatus(JwtUser me, String visitorId, DeskStatusDTO request);
}
