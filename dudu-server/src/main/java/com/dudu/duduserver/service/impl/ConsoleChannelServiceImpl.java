package com.dudu.duduserver.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.dudu.duduserver.channel.console.ConsoleCallbackUrls;
import com.dudu.duduserver.channel.console.ConsoleChannelCatalog;
import com.dudu.duduserver.channel.console.ConsoleChannelConfiguration;
import com.dudu.duduserver.channel.console.ConsoleChannelDefinition;
import com.dudu.duduserver.common.P;
import com.dudu.duduserver.config.auth.JwtUser;
import com.dudu.duduserver.config.exception.BizException;
import com.dudu.duduserver.constant.ApiEnum;
import com.dudu.duduserver.constant.ChannelEnum;
import com.dudu.duduserver.dto.ConsoleChannelRequests;
import com.dudu.duduserver.entity.CompanyChannelDO;
import com.dudu.duduserver.entity.UserGroupDO;
import com.dudu.duduserver.service.CompanyChannelService;
import com.dudu.duduserver.service.ConsoleAccess;
import com.dudu.duduserver.service.ConsoleAccessService;
import com.dudu.duduserver.service.ConsoleChannelService;
import com.dudu.duduserver.service.UserGroupService;
import com.dudu.duduserver.util.ConsoleIds;
import com.dudu.duduserver.util.LikeClauses;
import com.dudu.duduserver.vo.ConsoleChannelVO;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Console 渠道管理；复用账号领域写方法保留提交后 Desk 通知，所有查询在数据库应用企业与组范围。
 */
@Service
@RequiredArgsConstructor
public class ConsoleChannelServiceImpl implements ConsoleChannelService {
    private static final int MAX_ACCOUNT_NAME_LENGTH = 100;
    private final ConsoleAccessService accessService;
    private final CompanyChannelService accounts;
    private final UserGroupService groups;
    private final ConsoleChannelCatalog catalog;
    private final ConsoleChannelConfiguration configuration;
    private final ConsoleCallbackUrls callbackUrls;

    @Override
    public List<ConsoleChannelDefinition> catalog(JwtUser me, String origin) {
        accessService.require(me);
        return catalog.list(origin);
    }

    @Override
    public P<ConsoleChannelVO.Account> query(JwtUser me, ConsoleChannelRequests.Query query) {
        ConsoleAccess access = accessService.require(me);
        Long groupId = query.getGroupId() == null ? null : ConsoleIds.parse(query.getGroupId());
        if (groupId != null) accessService.requireGroup(access, groupId);
        Page<CompanyChannelDO> page = query.toPage(0);
        if (access.groupIds().isEmpty()) return P.ok(page, List.of());
        LambdaQueryWrapper<CompanyChannelDO> wrapper = new LambdaQueryWrapper<CompanyChannelDO>()
            .eq(CompanyChannelDO::getCompanyId, access.companyId()).in(CompanyChannelDO::getGroupId, access.groupIds())
            .eq(groupId != null, CompanyChannelDO::getGroupId, groupId)
            .eq(query.getChannel() != null, CompanyChannelDO::getChannel, query.getChannel());
        if (query.getKeyword() != null && !query.getKeyword().trim().isEmpty()) {
            // 关键词字面匹配（% _ ! 转义，口径同 Desk 访客搜索）；MP like 无法表达 ESCAPE，用受支持片段
            wrapper.apply("account_name LIKE {0}" + LikeClauses.ESCAPE,
                LikeClauses.pattern(query.getKeyword().trim()));
        }
        long total = accounts.count(wrapper);
        page = query.toPage(total);
        if (total == 0) return P.ok(page, List.of());
        accounts.page(page, wrapper.orderByDesc(CompanyChannelDO::getCreateTime, CompanyChannelDO::getCompanyChannelId));
        Map<Long, UserGroupDO> groupById = groups.listByIds(page.getRecords().stream().map(CompanyChannelDO::getGroupId).distinct().toList())
            .stream().collect(Collectors.toMap(UserGroupDO::getGroupId, Function.identity()));
        return P.ok(page, page.getRecords().stream().map(account -> listView(account, groupById.get(account.getGroupId()).getGroupName())).toList());
    }

    @Override
    public ConsoleChannelVO.Detail detail(JwtUser me, String id, String origin) {
        ConsoleAccess access = accessService.require(me);
        return detailView(requireAccount(access, id), access, origin);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public ConsoleChannelVO.Detail create(JwtUser me, ConsoleChannelRequests.Create request, String origin) {
        ConsoleAccess access = accessService.lock(me);
        Long groupId = ConsoleIds.parse(request.groupId());
        accessService.requireGroup(access, groupId);
        catalog.requireAvailable(request.channel(), origin);
        CompanyChannelDO account = new CompanyChannelDO();
        account.setCompanyId(access.companyId());
        account.setGroupId(groupId);
        account.setChannel(request.channel());
        account.setAccountName(name(request.accountName()));
        // 自增 ID 在插入后才可用；先校验整份输入，WhatsApp 的最终 url 在同一事务补齐后再返回。
        account.setChannelInfo(configuration.merge(request.channel(), Map.of(), request.fields(), List.of(),
            callbackUrls.callback(origin, 0L)));
        accounts.save(account);
        if (request.channel() == ChannelEnum.WHATSAPP) {
            account.setChannelInfo(configuration.merge(request.channel(), account.getChannelInfo(), Map.of(), List.of(),
                callbackUrls.callback(origin, account.getCompanyChannelId())));
            accounts.updateById(account);
        }
        return detailView(accounts.getById(account.getCompanyChannelId()), access, origin);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public ConsoleChannelVO.Detail update(JwtUser me, String id, ConsoleChannelRequests.Update request, String origin) {
        ConsoleAccess access = accessService.lock(me);
        CompanyChannelDO account = requireAccount(access, id);
        ConsoleChannelRequests.Changes changes = request.credentialChanges();
        account.setChannelInfo(configuration.merge(account.getChannel(), info(account), changes.set(), changes.clear(),
            callbackUrls.callback(origin, account.getCompanyChannelId())));
        account.setAccountName(name(request.accountName()));
        accounts.updateById(account);
        return detailView(accounts.getById(account.getCompanyChannelId()), access, origin);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public ConsoleChannelVO.Detail move(JwtUser me, String id, ConsoleChannelRequests.Move request, String origin) {
        ConsoleAccess access = accessService.lock(me);
        CompanyChannelDO account = requireAccount(access, id);
        Long targetId = ConsoleIds.parse(request.groupId());
        accessService.requireGroup(access, targetId);
        if (!targetId.equals(account.getGroupId())) {
            account.setGroupId(targetId);
            accounts.updateById(account);
        }
        return detailView(accounts.getById(account.getCompanyChannelId()), access, origin);
    }

    private CompanyChannelDO requireAccount(ConsoleAccess access, String id) {
        CompanyChannelDO account = accounts.getById(ConsoleIds.parse(id));
        if (account == null || !access.companyId().equals(account.getCompanyId())) throw new BizException(ApiEnum.DATA_NOT_EXIST);
        accessService.requireGroup(access, account.getGroupId());
        return account;
    }

    private ConsoleChannelVO.Account listView(CompanyChannelDO account, String groupName) {
        var status = configuration.describe(account.getChannel(), info(account));
        return new ConsoleChannelVO.Account(account.getCompanyChannelId().toString(), account.getGroupId().toString(),
            groupName, account.getChannel(), account.getAccountName(), status.receiveConfigured(), status.sendConfigured(),
            status.missingReceiveFields(), status.missingSendFields(), account.getCreateTime(), account.getUpdateTime());
    }

    private ConsoleChannelVO.Detail detailView(CompanyChannelDO account, ConsoleAccess access, String origin) {
        UserGroupDO group = accessService.requireGroup(access, account.getGroupId());
        var status = configuration.describe(account.getChannel(), info(account));
        List<String> notes = new ArrayList<>(status.notes());
        if (callbackUrls.localFallback()) notes.add("回调地址来自当前本机请求，未配置公开回调根地址，不代表公网可访问。");
        return new ConsoleChannelVO.Detail(account.getCompanyChannelId().toString(), account.getGroupId().toString(),
            group.getGroupName(), account.getChannel(), account.getAccountName(), status.receiveConfigured(), status.sendConfigured(),
            status.missingReceiveFields(), status.missingSendFields(), account.getCreateTime(), account.getUpdateTime(),
            callbackUrls.callback(origin, account.getCompanyChannelId()), status.fields(), status.configuredSecretFields(), List.copyOf(notes));
    }

    private Map<String, Object> info(CompanyChannelDO account) {
        return account.getChannelInfo() == null ? Map.of() : account.getChannelInfo();
    }

    private String name(String name) {
        if (name == null || name.trim().isEmpty()) throw new BizException(ApiEnum.PARAM_MISSING);
        if (name.trim().length() > MAX_ACCOUNT_NAME_LENGTH) throw new BizException(ApiEnum.PARAM_EXCEED);
        return name.trim();
    }
}
