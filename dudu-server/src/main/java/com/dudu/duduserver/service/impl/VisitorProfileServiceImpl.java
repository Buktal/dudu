package com.dudu.duduserver.service.impl;

import com.baomidou.mybatisplus.spring.service.impl.ServiceImpl;
import com.dudu.duduserver.entity.VisitorProfileDO;
import com.dudu.duduserver.mapper.VisitorProfileMapper;
import com.dudu.duduserver.service.VisitorProfileService;
import org.springframework.stereotype.Service;

/**
 * 访客名片持久化服务实现，当前只提供 IService 通用能力。
 */
@Service
public class VisitorProfileServiceImpl extends ServiceImpl<VisitorProfileMapper, VisitorProfileDO>
    implements VisitorProfileService {
}
