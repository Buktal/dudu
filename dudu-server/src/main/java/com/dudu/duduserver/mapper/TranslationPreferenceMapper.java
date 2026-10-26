package com.dudu.duduserver.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.dudu.duduserver.entity.TranslationPreferenceDO;
import org.apache.ibatis.annotations.Mapper;

/**
 * 员工阅读偏好映射。
 */
@Mapper
public interface TranslationPreferenceMapper extends BaseMapper<TranslationPreferenceDO> { }
