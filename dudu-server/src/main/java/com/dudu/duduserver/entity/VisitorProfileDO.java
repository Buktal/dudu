package com.dudu.duduserver.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * 访客名片实体：与访客一对一，固定访客 ID 即名片主键；channel_fields 保存渠道只读资料数组，
 * 创建访客时同事务写入空名片，取得渠道资料后再更新；标签与备注由名片票接通读写。
 */
@Data
@TableName(value = "visitor_profile", autoResultMap = true)
public class VisitorProfileDO {

    // 与 visitor 一对一，不另生成名片 ID
    @TableId(value = "visitor_id", type = IdType.INPUT)
    private Long visitorId;

    // 右侧只读资料数组，每项含 label 与 value；创建时显式写 []
    @TableField(typeHandler = JacksonTypeHandler.class)
    private List<Map<String, Object>> channelFields;

    // 字符串标签数组，创建时显式写 []
    @TableField(typeHandler = JacksonTypeHandler.class)
    private List<String> tags;

    // 共享备注
    private String note;

    // 对应现有 VisitorProfile.version
    private Integer version;

    // 创建时间
    @TableField(value = "create_time", fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    // 最后修改时间
    @TableField(value = "update_time", fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;
}
