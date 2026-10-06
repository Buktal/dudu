package com.dudu.duduserver.service.impl;

import com.baomidou.mybatisplus.spring.service.impl.ServiceImpl;
import com.dudu.duduserver.entity.ChannelAccountDO;
import com.dudu.duduserver.mapper.ChannelAccountMapper;
import com.dudu.duduserver.service.ChannelAccountService;
import org.springframework.stereotype.Service;

/**
 * 渠道接入账号领域服务实现，SQL 全部经 MyBatis-Plus 通用能力与 Lambda 构造器表达。
 */
@Service
public class ChannelAccountServiceImpl extends ServiceImpl<ChannelAccountMapper, ChannelAccountDO>
    implements ChannelAccountService {
}
