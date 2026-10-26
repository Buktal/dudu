package com.dudu.duduserver.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.dudu.duduserver.entity.TranslationSettingDO;
import org.apache.ibatis.annotations.Mapper;

/**
 * 企业翻译配置映射。
 */
@Mapper
public interface TranslationSettingMapper extends BaseMapper<TranslationSettingDO> { }
