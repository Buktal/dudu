package com.dudu.duduserver.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

/**
 * 企业内用户与组的成员关系；复合外键保证用户、组属于同一企业。
 */
@Data
@TableName("user_group_member")
public class UserGroupMemberDO {

    @TableId(type = IdType.AUTO)
    private Long memberId;

    private Long companyId;

    private Long userId;

    private Long groupId;
}
