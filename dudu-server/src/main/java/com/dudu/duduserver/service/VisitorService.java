package com.dudu.duduserver.service;

import com.baomidou.mybatisplus.spring.service.IService;
import com.dudu.duduserver.entity.VisitorDO;

/**
 * 访客持久化服务，供 Desk 查询与后续消息票读写复用。
 */
public interface VisitorService extends IService<VisitorDO> {
}
