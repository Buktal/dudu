package com.dudu.duduserver.service.impl;

import com.baomidou.mybatisplus.spring.service.impl.ServiceImpl;
import com.dudu.duduserver.entity.ReceptionGroupDO;
import com.dudu.duduserver.mapper.ReceptionGroupMapper;
import com.dudu.duduserver.service.ReceptionGroupService;
import org.springframework.stereotype.Service;

/**
 * 接待组领域服务实现，SQL 全部经 MyBatis-Plus 通用能力与 Lambda 构造器表达。
 */
@Service
public class ReceptionGroupServiceImpl extends ServiceImpl<ReceptionGroupMapper, ReceptionGroupDO>
    implements ReceptionGroupService {
}
