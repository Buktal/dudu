package com.dudu.duduserver.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.dudu.duduserver.common.P;
import com.dudu.duduserver.common.PageQuery;
import com.dudu.duduserver.config.auth.JwtUser;
import com.dudu.duduserver.config.exception.BizException;
import com.dudu.duduserver.constant.*;
import com.dudu.duduserver.dto.*;
import com.dudu.duduserver.entity.*;
import com.dudu.duduserver.util.LikeClauses;
import com.dudu.duduserver.vo.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Console 用户组边界，企业锁串行化管理范围与角色变更。
 */
@Service
@RequiredArgsConstructor
public class ConsoleGroupService {
    private final ConsoleAccessService accessService;
    private final UserGroupService groups;
    private final UserGroupMemberService members;
    private final UserService users;
    private final CompanyChannelService channels;

    public P<ConsoleGroupVO> query(JwtUser me, ConsoleGroupQuery query) {
        ConsoleAccess access = accessService.require(me);
        if (!access.initialAdmin() && access.groupIds().isEmpty()) {
            return P.ok(query.toPage(0), List.of());
        }
        LambdaQueryWrapper<UserGroupDO> filter = new LambdaQueryWrapper<UserGroupDO>()
            .eq(UserGroupDO::getCompanyId, access.companyId())
            .in(!access.initialAdmin(), UserGroupDO::getGroupId, access.groupIds())
            // 关键词字面匹配（% _ ! 转义，口径同 Desk 访客搜索）；MP like 无法表达 ESCAPE，用受支持片段
            .apply(!query.keyword().isEmpty(), "group_name LIKE {0}" + LikeClauses.ESCAPE,
                LikeClauses.pattern(query.keyword()))
            .orderByDesc(UserGroupDO::getCreateTime, UserGroupDO::getGroupId);
        Page<UserGroupDO> page = query.toPage(groups.count(filter));
        if (page.getTotal() > 0) {
            groups.page(page, filter);
        }
        return P.ok(page, views(page.getRecords()));
    }

    public ConsoleGroupVO detail(JwtUser me, Long groupId) {
        return view(accessService.requireGroup(accessService.require(me), groupId));
    }

    @Transactional(rollbackFor = Exception.class)
    public ConsoleGroupVO create(JwtUser me, ConsoleGroupSaveDTO dto) {
        ConsoleAccess access = accessService.lock(me);
        access.requireInitialAdmin();
        UserGroupDO group = new UserGroupDO();
        group.setCompanyId(access.companyId());
        group.setGroupName(dto.groupName());
        groups.save(group);
        return view(group);
    }

    @Transactional(rollbackFor = Exception.class)
    public ConsoleGroupVO rename(JwtUser me, Long groupId, ConsoleGroupSaveDTO dto) {
        ConsoleAccess access = accessService.lock(me);
        accessService.requireGroup(access, groupId);
        groups.lambdaUpdate().eq(UserGroupDO::getCompanyId, access.companyId())
            .eq(UserGroupDO::getGroupId, groupId).set(UserGroupDO::getGroupName, dto.groupName())
            .set(UserGroupDO::getUpdateTime, LocalDateTime.now()).update();
        return view(groups.getById(groupId));
    }

    public P<ConsoleGroupMemberVO> members(JwtUser me, Long groupId, PageQuery query) {
        ConsoleAccess access = accessService.require(me);
        accessService.requireGroup(access, groupId);
        LambdaQueryWrapper<UserDO> filter = employeeFilter(access)
            .inSql(UserDO::getUserId, membershipSql(access.companyId(), groupId));
        Page<UserDO> page = employeePage(filter, query);
        return P.ok(page, page.getRecords().stream().map(user -> new ConsoleGroupMemberVO(
            user.getUserId().toString(), user.getUsername(), user.getName(), user.getRole(), user.getStatus())).toList());
    }

    public P<ConsoleGroupCandidateVO> candidates(JwtUser me, Long groupId, ConsoleGroupQuery query) {
        ConsoleAccess access = accessService.require(me);
        accessService.requireGroup(access, groupId);
        LambdaQueryWrapper<UserDO> filter = employeeFilter(access)
            .eq(UserDO::getStatus, EnableStatusEnum.ENABLED)
            .ne(UserDO::getUserId, access.company().getInitUserId())
            .eq(!access.initialAdmin(), UserDO::getRole, UserRoleEnum.USER)
            .notInSql(UserDO::getUserId, membershipSql(access.companyId(), groupId));
        if (!query.keyword().isEmpty()) {
            String pattern = LikeClauses.pattern(query.keyword());
            filter.and(part -> part.apply("username LIKE {0}" + LikeClauses.ESCAPE, pattern)
                .or().apply("name LIKE {0}" + LikeClauses.ESCAPE, pattern));
        }
        Page<UserDO> page = employeePage(filter, query);
        return P.ok(page, page.getRecords().stream().map(user -> new ConsoleGroupCandidateVO(
            user.getUserId().toString(), user.getUsername(), user.getName(), user.getRole())).toList());
    }

    @Transactional(rollbackFor = Exception.class)
    public ConsoleGroupMembershipVO membership(JwtUser me, Long groupId, Long userId, boolean member) {
        ConsoleAccess access = accessService.lock(me);
        accessService.requireGroup(access, groupId);
        UserDO user = accessService.requireUser(access, userId);
        if (access.company().isInitialAdmin(userId)) {
            throw new BizException(ApiEnum.DATA_NOT_ALLOW);
        }
        if (user.getRole() == UserRoleEnum.ADMIN || (!access.initialAdmin() && user.getRole() != UserRoleEnum.USER)) {
            throw new BizException(ApiEnum.FORBIDDEN);
        }
        if (member && user.getStatus() != EnableStatusEnum.ENABLED) {
            throw new BizException(ApiEnum.DATA_NOT_ALLOW);
        }
        UserGroupMemberDO existing = members.lambdaQuery().eq(UserGroupMemberDO::getCompanyId, access.companyId())
            .eq(UserGroupMemberDO::getGroupId, groupId).eq(UserGroupMemberDO::getUserId, userId).one();
        if (member && existing == null) {
            UserGroupMemberDO relation = new UserGroupMemberDO();
            relation.setCompanyId(access.companyId());
            relation.setGroupId(groupId);
            relation.setUserId(userId);
            members.save(relation);
        } else if (!member && existing != null) {
            members.removeById(existing.getMemberId());
        }
        return new ConsoleGroupMembershipVO(groupId.toString(), userId.toString(), member);
    }

    private LambdaQueryWrapper<UserDO> employeeFilter(ConsoleAccess access) {
        return new LambdaQueryWrapper<UserDO>().eq(UserDO::getCompanyId, access.companyId())
            .in(UserDO::getRole, UserRoleEnum.USER, UserRoleEnum.CONSOLE).orderByAsc(UserDO::getUserId);
    }

    private Page<UserDO> employeePage(LambdaQueryWrapper<UserDO> filter, PageQuery query) {
        Page<UserDO> page = query.toPage(users.count(filter));
        if (page.getTotal() > 0) {
            users.page(page, filter);
        }
        return page;
    }

    // Lambda 不支持关联子查询；固定 SQL 仅拼接服务端验证后的 Long，确保过滤发生于分页前。
    private String membershipSql(Long companyId, Long groupId) {
        return "SELECT user_id FROM user_group_member WHERE company_id=" + companyId + " AND group_id=" + groupId;
    }

    // 统计口径的员工范围：本企业坐席角色（排除 ADMIN 与他企业脏关系）
    private String employeeSql(Long companyId) {
        return "SELECT user_id FROM `user` WHERE company_id=" + companyId + " AND role IN ('"
            + UserRoleEnum.USER.getCode() + "','" + UserRoleEnum.CONSOLE.getCode() + "')";
    }

    // 列表页视图：组内成员与账号各按页内组一次批量查询计数，不逐组 COUNT
    private List<ConsoleGroupVO> views(List<UserGroupDO> page) {
        if (page.isEmpty()) return List.of();
        Long companyId = page.getFirst().getCompanyId();
        List<Long> groupIds = page.stream().map(UserGroupDO::getGroupId).toList();
        // 关联无外键，统计必须排除指向其他企业员工的脏关系
        Map<Long, Long> memberCounts = members.lambdaQuery()
            .select(UserGroupMemberDO::getGroupId, UserGroupMemberDO::getUserId)
            .eq(UserGroupMemberDO::getCompanyId, companyId)
            .in(UserGroupMemberDO::getGroupId, groupIds)
            .inSql(UserGroupMemberDO::getUserId, employeeSql(companyId))
            .list().stream().collect(Collectors.groupingBy(UserGroupMemberDO::getGroupId, Collectors.counting()));
        Map<Long, Long> channelCounts = channels.lambdaQuery()
            .select(CompanyChannelDO::getGroupId)
            .eq(CompanyChannelDO::getCompanyId, companyId)
            .in(CompanyChannelDO::getGroupId, groupIds)
            .list().stream().collect(Collectors.groupingBy(CompanyChannelDO::getGroupId, Collectors.counting()));
        return page.stream().map(group -> new ConsoleGroupVO(group.getGroupId().toString(), group.getGroupName(),
            memberCounts.getOrDefault(group.getGroupId(), 0L), channelCounts.getOrDefault(group.getGroupId(), 0L),
            group.getCreateTime(), group.getUpdateTime())).toList();
    }

    private ConsoleGroupVO view(UserGroupDO group) {
        return views(List.of(group)).getFirst();
    }
}
