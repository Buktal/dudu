package com.dudu.duduserver.service;

import com.baomidou.mybatisplus.spring.service.IService;
import com.dudu.duduserver.entity.VisitorProfileDO;

/**
 * 访客名片持久化服务，供入站信件创建空名片与更新渠道资料，后续名片读写票复用。
 */
public interface VisitorProfileService extends IService<VisitorProfileDO> {
}
