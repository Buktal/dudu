package com.dudu.duduserver.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.dudu.duduserver.entity.OperationLogDO;
import org.apache.ibatis.annotations.Mapper;

/**
 * 操作记录表 Mapper，SQL 一律经 MyBatis-Plus 通用能力与 Lambda 构造器表达。
 */
@Mapper
public interface OperationLogMapper extends BaseMapper<OperationLogDO> {
}
