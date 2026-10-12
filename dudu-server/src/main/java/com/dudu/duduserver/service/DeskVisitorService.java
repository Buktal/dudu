package com.dudu.duduserver.service;

import com.dudu.duduserver.config.auth.JwtUser;
import com.dudu.duduserver.dto.DeskVisitorQueryDTO;
import com.dudu.duduserver.vo.DeskConversationVO;
import com.dudu.duduserver.vo.DeskVisitorPageVO;

/**
 * Desk 访客查询服务：先按当前授权账号范围筛选持久访客再做普通分页，
 * 计数与渠道来自数据库与现有账号关系，返回对象按最小对接契约第 4 节投影。
 */
public interface DeskVisitorService {

    // 授权范围内的访客摘要分页；counts 不受本次关键词、状态与渠道筛选影响
    DeskVisitorPageVO query(JwtUser me, DeskVisitorQueryDTO query);

    // 单访客当前快照：在库但不在当前权限内为 10106，不存在为 12100
    DeskConversationVO get(JwtUser me, String visitorId);
}
