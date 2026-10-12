package com.dudu.duduserver.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.dudu.duduserver.entity.VisitorProfileDO;
import org.apache.ibatis.annotations.Mapper;

/**
 * 访客名片 Mapper，与访客一对一且共用固定访客 ID，无自定义 SQL。
 */
@Mapper
public interface VisitorProfileMapper extends BaseMapper<VisitorProfileDO> {
}
