package com.dudu.duduserver.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

/**
 * 员工跨设备阅读偏好，不修改共享消息。
 */
@Data
@TableName("translation_preference")
public class TranslationPreferenceDO {
    @TableId(type = IdType.INPUT)
    private Long userId;
    private Long companyId;
    private Boolean automatic;
    private String targetLanguage;
}
