package com.dudu.duduserver.service;

import com.baomidou.mybatisplus.spring.service.IService;
import com.dudu.duduserver.dto.CompanyAdminInitDTO;
import com.dudu.duduserver.entity.UserDO;

/**
 * 用户领域服务：平台人员与企业员工共用一套凭据规则，供 Admin、后续 Console 与 Desk 复用。
 */
public interface UserService extends IService<UserDO> {

    // 按账号查找平台用户（企业归属为空的作用域）；不存在返回 null
    UserDO findPlatformUser(String username);

    // 在创建企业事务内初始化企业管理员；显示名未填时取登录名。返回带自增 ID 的实体
    UserDO createInitialAdmin(Long companyId, CompanyAdminInitDTO request);

    // 更新指定用户的密码哈希
    void updatePassword(Long userId, String newPassword);
}
