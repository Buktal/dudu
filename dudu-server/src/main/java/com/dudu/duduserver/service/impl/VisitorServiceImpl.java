package com.dudu.duduserver.service.impl;

import com.baomidou.mybatisplus.spring.service.impl.ServiceImpl;
import com.dudu.duduserver.entity.VisitorDO;
import com.dudu.duduserver.mapper.VisitorMapper;
import com.dudu.duduserver.service.VisitorService;
import org.springframework.stereotype.Service;

/**
 * 访客持久化服务实现，当前只提供 IService 通用能力。
 */
@Service
public class VisitorServiceImpl extends ServiceImpl<VisitorMapper, VisitorDO> implements VisitorService {
}
