package com.dudu.duduserver.service;

import com.baomidou.mybatisplus.spring.service.IService;
import com.dudu.duduserver.entity.CompanyChannelDO;

/**
 * 渠道接入账号领域服务；本轮仅支撑资源汇总计数，启停与授权由 Console 阶段补充。
 */
public interface CompanyChannelService extends IService<CompanyChannelDO> {
}
