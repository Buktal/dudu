package com.dudu.duduserver.translation;

import com.baomidou.mybatisplus.spring.service.impl.ServiceImpl;
import com.dudu.duduserver.entity.TranslationSettingDO;
import com.dudu.duduserver.mapper.TranslationSettingMapper;
import org.springframework.stereotype.Service;

/**
 * 复用 MyBatis-Plus 持久化企业翻译配置。
 */
@Service
public class TranslationSettings extends ServiceImpl<TranslationSettingMapper, TranslationSettingDO> { }
