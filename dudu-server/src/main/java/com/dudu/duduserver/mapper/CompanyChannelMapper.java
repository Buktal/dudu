package com.dudu.duduserver.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.dudu.duduserver.entity.CompanyChannelDO;
import org.apache.ibatis.annotations.Mapper;

/**
 * 渠道接入账号表 Mapper，SQL 一律经 MyBatis-Plus 通用能力与 Lambda 构造器表达。
 */
@Mapper
public interface CompanyChannelMapper extends BaseMapper<CompanyChannelDO> {
}
