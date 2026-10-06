package com.dudu.duduserver.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.dudu.duduserver.entity.UserGroupMemberDO;
import org.apache.ibatis.annotations.Mapper;

/**
 * 企业用户分组成员映射。
 */
@Mapper
public interface UserGroupMemberMapper extends BaseMapper<UserGroupMemberDO> {
}
