package com.dudu.duduserver.service.impl;

import com.baomidou.mybatisplus.spring.service.impl.ServiceImpl;
import com.dudu.duduserver.entity.UserGroupMemberDO;
import com.dudu.duduserver.mapper.UserGroupMemberMapper;
import com.dudu.duduserver.service.UserGroupMemberService;
import com.dudu.duduserver.socket.DeskAccessChangedEvent;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;

import java.io.Serializable;
import java.util.List;

/**
 * 成员关系的写入入口在提交后发布范围变更事件，由实时网关通知本企业已连接员工重查工作区；
 * 管理端操作本身沿用现有写方法，不新增管理接口。
 */
@Service
@RequiredArgsConstructor
public class UserGroupMemberServiceImpl extends ServiceImpl<UserGroupMemberMapper, UserGroupMemberDO>
    implements UserGroupMemberService {

    private final ApplicationEventPublisher eventPublisher;

    // 加入组成员后通知本企业：新增权限的员工要立即可见新范围
    @Override
    public boolean save(UserGroupMemberDO entity) {
        boolean saved = super.save(entity);
        if (saved) {
            publishAccessChanged(entity.getCompanyId());
        }
        return saved;
    }

    // 移出组成员（员工退组）后通知本企业：失去权限的员工也要收到，才能清理已无权数据
    @Override
    public boolean removeById(Serializable id) {
        UserGroupMemberDO member = getById(id);
        boolean removed = super.removeById(id);
        if (removed && member != null) {
            publishAccessChanged(member.getCompanyId());
        }
        return removed;
    }

    @Override
    public List<Long> listGroupIds(Long companyId, Long userId) {
        return lambdaQuery()
            .eq(UserGroupMemberDO::getCompanyId, companyId)
            .eq(UserGroupMemberDO::getUserId, userId)
            .orderByAsc(UserGroupMemberDO::getGroupId)
            .list().stream().map(UserGroupMemberDO::getGroupId).distinct().toList();
    }

    // 通知在事务提交后发布（无事务的自动提交写入按当前语义立即发布）；企业为空时不发布
    private void publishAccessChanged(Long companyId) {
        if (companyId != null) {
            eventPublisher.publishEvent(new DeskAccessChangedEvent(companyId));
        }
    }
}
