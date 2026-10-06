package com.dudu.duduserver.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.dudu.duduserver.constant.EnableStatusEnum;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 企业。主键为创建前选定的六位企业 ID，显式输入、不自增；创建后固定。
 */
@Data
@TableName("company")
public class CompanyDO {

    // 企业 ID：100000–999999，兼作登录输入与展示标识
    @TableId(value = "company_id", type = IdType.INPUT)
    private Long companyId;

    // 企业名称，允许同名
    private String companyName;

    // 联系人，未填写为 null
    private String contactName;

    // 联系方式，文本表达
    private String contactInfo;

    // 运营备注
    private String remark;

    // 启停状态，0/1，见 EnableStatusEnum
    private EnableStatusEnum status;

    // 最近一次停用原因，恢复时清空
    private String disableReason;

    // 创建事务写入的初始企业管理员（Console 账号）ID，稳定定位重置目标
    private Long initUserId;

    // 创建时间
    @TableField(value = "create_time", fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    // 最后修改时间
    @TableField(value = "update_time", fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;
}
