package com.dudu.duduserver.translation;

import com.baomidou.mybatisplus.spring.service.impl.ServiceImpl;
import com.dudu.duduserver.entity.TranslationPreferenceDO;
import com.dudu.duduserver.mapper.TranslationPreferenceMapper;
import org.springframework.stereotype.Service;

/**
 * 复用 MyBatis-Plus 持久化坐席阅读偏好。
 */
@Service
public class TranslationPreferences extends ServiceImpl<TranslationPreferenceMapper, TranslationPreferenceDO> { }
