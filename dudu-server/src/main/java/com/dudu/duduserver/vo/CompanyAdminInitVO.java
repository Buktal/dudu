package com.dudu.duduserver.vo;

import cn.hutool.core.bean.BeanUtil;
import com.dudu.duduserver.constant.EnableStatusEnum;
import com.dudu.duduserver.entity.UserDO;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * 企业初始管理员的非敏感资料视图；不含密码、哈希或令牌，状态为 0/1。
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class CompanyAdminInitVO {

    private String userId;

    private String username;

    private String name;

    private EnableStatusEnum status;

    private LocalDateTime createTime;

    // 仅映射此视图声明的公开字段，保留 ID 字符串与 null 语义
    public static CompanyAdminInitVO of(UserDO source) {
        return BeanUtil.toBean(source, CompanyAdminInitVO.class);
    }
}
