package com.dudu.duduserver.vo;

import cn.hutool.core.bean.BeanUtil;
import com.dudu.duduserver.constant.UserRoleEnum;
import com.dudu.duduserver.entity.UserDO;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 平台管理员的非敏感详情视图。
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class AdminDetailVO {

    private String userId;

    private String username;

    private String name;

    private UserRoleEnum role;

    // 仅映射此视图声明的公开字段，保留 ID 字符串与 null 语义
    public static AdminDetailVO of(UserDO source) {
        return BeanUtil.toBean(source, AdminDetailVO.class);
    }
}
