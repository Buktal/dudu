package com.dudu.duduserver.service.impl;

import com.baomidou.mybatisplus.spring.service.impl.ServiceImpl;
import com.dudu.duduserver.entity.CompanyChannelDO;
import com.dudu.duduserver.mapper.CompanyChannelMapper;
import com.dudu.duduserver.service.CompanyChannelService;
import com.dudu.duduserver.socket.DeskAccessChangedEvent;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;

import java.util.Collection;
import java.util.List;

/**
 * 渠道接入账号领域服务实现，SQL 全部经 MyBatis-Plus 通用能力与 Lambda 构造器表达。
 * 账号的归属写入（新增、换组）改变接待范围，写操作完成后发布范围变更事件，
 * 由实时网关通知本企业已连接员工重查工作区；管理端操作本身沿用现有写方法。
 */
@Service
@RequiredArgsConstructor
public class CompanyChannelServiceImpl extends ServiceImpl<CompanyChannelMapper, CompanyChannelDO>
    implements CompanyChannelService {

    private final ApplicationEventPublisher eventPublisher;

    @Override
    public List<CompanyChannelDO> listByCompanyGroups(Long companyId, Collection<Long> groupIds) {
        if (groupIds == null || groupIds.isEmpty()) {
            return List.of();
        }
        return lambdaQuery()
            .eq(CompanyChannelDO::getCompanyId, companyId)
            .in(CompanyChannelDO::getGroupId, groupIds)
            .orderByAsc(CompanyChannelDO::getCompanyChannelId)
            .list();
    }

    // 新增账号后通知本企业：账号所属组的成员立即可见
    @Override
    public boolean save(CompanyChannelDO entity) {
        boolean saved = super.save(entity);
        if (saved) {
            publishAccessChanged(entity.getCompanyId());
        }
        return saved;
    }

    // 账号换组是接待范围变化：按现有行确定企业（增量更新可不携带企业），更新成功后通知
    @Override
    public boolean updateById(CompanyChannelDO entity) {
        CompanyChannelDO existing = getById(entity.getCompanyChannelId());
        boolean updated = super.updateById(entity);
        if (updated && existing != null) {
            publishAccessChanged(existing.getCompanyId());
        }
        return updated;
    }

    // 当前管理端归属写入是单条写操作自动提交，通知在写操作返回后发布；企业为空时不发布
    private void publishAccessChanged(Long companyId) {
        if (companyId != null) {
            eventPublisher.publishEvent(new DeskAccessChangedEvent(companyId));
        }
    }
}
