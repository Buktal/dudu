package com.dudu.duduserver.service.impl;

import com.baomidou.mybatisplus.spring.service.impl.ServiceImpl;
import com.dudu.duduserver.entity.UserGroupDO;
import com.dudu.duduserver.mapper.UserGroupMapper;
import com.dudu.duduserver.service.UserGroupService;
import org.springframework.stereotype.Service;

/**
 * 接待组领域服务实现，SQL 全部经 MyBatis-Plus 通用能力与 Lambda 构造器表达。
 */
@Service
public class UserGroupServiceImpl extends ServiceImpl<UserGroupMapper, UserGroupDO>
    implements UserGroupService {
}
