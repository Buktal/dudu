package com.dudu.duduserver.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.FieldStrategy;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.ToString;

/**
 * 企业翻译配置，凭据与配置整体加密，禁止日志输出。
 */
@Data
@ToString(exclude = "configuration")
@TableName("translation_setting")
public class TranslationSettingDO {
    @TableId(type = IdType.INPUT)
    private Long companyId;
    private Long revision;
    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private String defaultService;
    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private String assistantService;
    private String configuration;
}
