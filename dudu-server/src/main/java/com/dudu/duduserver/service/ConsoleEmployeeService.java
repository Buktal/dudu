package com.dudu.duduserver.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.dudu.duduserver.common.P;
import com.dudu.duduserver.config.auth.JwtUser;
import com.dudu.duduserver.config.exception.BizException;
import com.dudu.duduserver.constant.ApiEnum;
import com.dudu.duduserver.constant.EnableStatusEnum;
import com.dudu.duduserver.constant.UserRoleEnum;
import com.dudu.duduserver.dto.ConsoleEmployeeQuery;
import com.dudu.duduserver.dto.ConsoleIdentityRequests;
import com.dudu.duduserver.entity.UserDO;
import com.dudu.duduserver.entity.UserGroupDO;
import com.dudu.duduserver.entity.UserGroupMemberDO;
import com.dudu.duduserver.util.ConsoleIds;
import com.dudu.duduserver.util.LikeClauses;
import com.dudu.duduserver.util.PasswordHasher;
import com.dudu.duduserver.vo.ConsoleEmployeeVO;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.context.ApplicationEventPublisher;
import com.dudu.duduserver.socket.DeskAccessChangedEvent;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 初始企业管理员维护员工，所有写入先锁企业并重新授权。
 */
@Service
@RequiredArgsConstructor
public class ConsoleEmployeeService {
    private final ConsoleAccessService accessService;
    private final UserService users;
    private final UserGroupService groups;
    private final UserGroupMemberService members;
    private final ApplicationEventPublisher events;

    public P<ConsoleEmployeeVO> query(JwtUser me, ConsoleEmployeeQuery query) {
        ConsoleAccess access = accessService.require(me);
        access.requireInitialAdmin();
        if (query.getRole() == UserRoleEnum.ADMIN) throw new BizException(ApiEnum.PARAM_ERROR);
        LambdaQueryWrapper<UserDO> wrapper = new LambdaQueryWrapper<UserDO>()
            .eq(UserDO::getCompanyId, access.companyId())
            .in(UserDO::getRole, UserRoleEnum.USER, UserRoleEnum.CONSOLE);
        if (query.getKeyword() != null && !query.getKeyword().isBlank()) {
            String keyword = query.getKeyword().trim();
            // 关键词字面匹配（% _ ! 转义，口径同 Desk 访客搜索）；MP like 无法表达 ESCAPE，用受支持片段
            String pattern = LikeClauses.pattern(keyword);
            wrapper.and(w -> w.apply("username LIKE {0}" + LikeClauses.ESCAPE, pattern)
                .or().apply("name LIKE {0}" + LikeClauses.ESCAPE, pattern));
        }
        wrapper.eq(query.getRole() != null, UserDO::getRole, query.getRole());
        wrapper.eq(query.getStatus() != null, UserDO::getStatus, query.getStatus());
        wrapper.orderByDesc(UserDO::getCreateTime).orderByDesc(UserDO::getUserId);
        long total = users.count(wrapper);
        Page<UserDO> page = query.toPage(total);
        if (total > 0) page = users.page(page, wrapper);
        return P.ok(page, views(access, page.getRecords()));
    }

    public ConsoleEmployeeVO detail(JwtUser me, String userId) {
        ConsoleAccess access = accessService.require(me);
        access.requireInitialAdmin();
        return view(access, accessService.requireUser(access, ConsoleIds.parse(userId)));
    }

    @Transactional(rollbackFor = Exception.class)
    public ConsoleEmployeeVO create(JwtUser me, ConsoleIdentityRequests.CreateEmployee request) {
        ConsoleAccess access = accessService.lock(me);
        access.requireInitialAdmin();
        String username = request.username();
        String name = request.name();
        if (users.findCompanyUser(access.companyId(), username) != null) {
            throw new BizException(ApiEnum.DATA_EXIST, "登录名已存在");
        }
        UserDO user = new UserDO();
        user.setCompanyId(access.companyId());
        user.setUsername(username);
        user.setName(name);
        user.setRole(UserRoleEnum.USER);
        user.setStatus(EnableStatusEnum.ENABLED);
        user.setPasswordHash(PasswordHasher.hash(request.password()));
        try {
            users.save(user);
        } catch (DuplicateKeyException e) {
            throw new BizException(ApiEnum.DATA_EXIST, "登录名已存在");
        }
        return view(access, user);
    }

    @Transactional(rollbackFor = Exception.class)
    public ConsoleEmployeeVO rename(JwtUser me, String userId, ConsoleIdentityRequests.Name request) {
        ConsoleAccess access = accessService.lock(me);
        access.requireInitialAdmin();
        UserDO user = accessService.requireUser(access, ConsoleIds.parse(userId));
        UserDO patch = new UserDO();
        patch.setUserId(user.getUserId());
        patch.setName(request.name());
        users.updateById(patch);
        return view(access, users.getById(user.getUserId()));
    }

    @Transactional(rollbackFor = Exception.class)
    public ConsoleEmployeeVO status(JwtUser me, String userId, ConsoleIdentityRequests.Status request) {
        ConsoleAccess access = accessService.lock(me);
        access.requireInitialAdmin();
        UserDO user = accessService.requireUser(access, ConsoleIds.parse(userId));
        if (access.company().isInitialAdmin(user.getUserId()) && request.status() == EnableStatusEnum.DISABLED) {
            throw new BizException(ApiEnum.DATA_NOT_ALLOW, "初始管理员不能停用");
        }
        if (user.getStatus() != request.status()) {
            UserDO patch = new UserDO();
            patch.setUserId(user.getUserId());
            patch.setStatus(request.status());
            users.updateById(patch);
            events.publishEvent(new DeskAccessChangedEvent(access.companyId()));
        }
        return view(access, users.getById(user.getUserId()));
    }

    @Transactional(rollbackFor = Exception.class)
    public ConsoleEmployeeVO role(JwtUser me, String userId, ConsoleIdentityRequests.Role request) {
        ConsoleAccess access = accessService.lock(me);
        access.requireInitialAdmin();
        UserDO user = accessService.requireUser(access, ConsoleIds.parse(userId));
        if (request.role() == UserRoleEnum.ADMIN) throw new BizException(ApiEnum.PARAM_ERROR);
        if (access.company().isInitialAdmin(user.getUserId())) {
            throw new BizException(ApiEnum.DATA_NOT_ALLOW, "初始管理员角色不能修改");
        }
        if (user.getRole() != request.role()) {
            UserDO patch = new UserDO();
            patch.setUserId(user.getUserId());
            patch.setRole(request.role());
            users.updateById(patch);
            events.publishEvent(new DeskAccessChangedEvent(access.companyId()));
        }
        return view(access, users.getById(user.getUserId()));
    }

    @Transactional(rollbackFor = Exception.class)
    public void resetPassword(JwtUser me, String userId, ConsoleIdentityRequests.PasswordReset request) {
        ConsoleAccess access = accessService.lock(me);
        access.requireInitialAdmin();
        UserDO user = accessService.requireUser(access, ConsoleIds.parse(userId));
        if (access.company().isInitialAdmin(user.getUserId()) || user.getUserId().equals(access.user().getUserId())) {
            throw new BizException(ApiEnum.DATA_NOT_ALLOW, "自己的密码需验证原密码后修改");
        }
        users.updatePassword(user.getUserId(), request.newPassword());
    }

    // 列表页视图：组关系按页内员工一次批量查询，不逐员工往返（组 ID 升序去重，口径同 listGroupIds）
    private List<ConsoleEmployeeVO> views(ConsoleAccess access, List<UserDO> page) {
        if (page.isEmpty()) return List.of();
        Set<Long> companyGroups = groups.listByCompany(access.companyId()).stream()
            .map(UserGroupDO::getGroupId).collect(Collectors.toSet());
        Map<Long, List<Long>> memberGroupIds = members.lambdaQuery()
            .eq(UserGroupMemberDO::getCompanyId, access.companyId())
            .in(UserGroupMemberDO::getUserId, page.stream().map(UserDO::getUserId).toList())
            .orderByAsc(UserGroupMemberDO::getGroupId)
            .list().stream().collect(Collectors.groupingBy(UserGroupMemberDO::getUserId,
                Collectors.mapping(UserGroupMemberDO::getGroupId, Collectors.toList())));
        return page.stream().map(user -> ConsoleEmployeeVO.of(user,
            access.company().isInitialAdmin(user.getUserId()),
            memberGroupIds.getOrDefault(user.getUserId(), List.of()).stream()
                .distinct().filter(companyGroups::contains).map(String::valueOf).toList())).toList();
    }

    private ConsoleEmployeeVO view(ConsoleAccess access, UserDO user) {
        return views(access, List.of(user)).getFirst();
    }

}
