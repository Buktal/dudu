package com.dudu.duduserver.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 平台人员与企业员工共用的用户实体；登录名在企业内唯一，平台用户企业归属为空。
 * passwordHash 仅后端持有，任何响应与操作记录不得暴露。
 */
@Data
@TableName("user")
public class UserDO {

    // 用户稳定身份，自增
    @TableId(value = "user_id", type = IdType.AUTO)
    private Long userId;

    // 企业员工所属企业；平台用户为 null
    private Long companyId;

    // 登录名，大小写不敏感唯一（作用域：企业或平台）
    private String username;

    // 显示名称，未填写时取登录名
    private String name;

    // Bcrypt 哈希
    private String passwordHash;

    // 角色，见 UserRoleEnum
    private String role;

    // 启停状态，0/1，见 EnableStatusEnum
    private Integer status;

    // 创建时间    @TableField(value = "create_time", fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    // 最后修改时间    @TableField(value = "update_time", fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;
}
