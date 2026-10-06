package com.dudu.duduserver.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 企业内平级接待组。本轮仅支撑资源汇总的真实计数，管理能力由 Console 阶段补充。
 */
@Data
@TableName("reception_group")
public class ReceptionGroupDO {

    // 接待组标识，自增
    @TableId(value = "group_id", type = IdType.AUTO)
    private Long groupId;

    // 所属企业
    private Long companyId;

    // 组名
    private String groupName;

    // 创建时间    @TableField(value = "create_time", fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    // 最后修改时间    @TableField(value = "update_time", fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;
}
