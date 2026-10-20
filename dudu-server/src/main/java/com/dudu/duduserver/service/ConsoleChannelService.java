package com.dudu.duduserver.service;

import com.dudu.duduserver.channel.console.ConsoleChannelDefinition;
import com.dudu.duduserver.common.P;
import com.dudu.duduserver.config.auth.JwtUser;
import com.dudu.duduserver.dto.ConsoleChannelRequests;
import com.dudu.duduserver.vo.ConsoleChannelVO;
import java.util.List;

/**
 * 企业渠道账号管理接口；写命令在企业行锁后重新授权，视图不包含秘密。
 */
public interface ConsoleChannelService {
    List<ConsoleChannelDefinition> catalog(JwtUser me, String origin);
    P<ConsoleChannelVO.Account> query(JwtUser me, ConsoleChannelRequests.Query query);
    ConsoleChannelVO.Detail detail(JwtUser me, String id, String origin);
    ConsoleChannelVO.Detail create(JwtUser me, ConsoleChannelRequests.Create request, String origin);
    ConsoleChannelVO.Detail update(JwtUser me, String id, ConsoleChannelRequests.Update request, String origin);
    ConsoleChannelVO.Detail move(JwtUser me, String id, ConsoleChannelRequests.Move request, String origin);
}
