package com.dudu.duduserver.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.dudu.duduserver.config.auth.JwtUser;
import com.dudu.duduserver.config.exception.BizException;
import com.dudu.duduserver.constant.ApiEnum;
import com.dudu.duduserver.constant.ChannelEnum;
import com.dudu.duduserver.constant.MessageDirectionEnum;
import com.dudu.duduserver.constant.VisitorQueryOrderEnum;
import com.dudu.duduserver.constant.VisitorStatusEnum;
import com.dudu.duduserver.dto.DeskHistoryQueryDTO;
import com.dudu.duduserver.dto.DeskVisitorQueryDTO;
import com.dudu.duduserver.entity.MessageDO;
import com.dudu.duduserver.entity.UserDO;
import com.dudu.duduserver.entity.VisitorDO;
import com.dudu.duduserver.service.DeskAuthService;
import com.dudu.duduserver.service.DeskVisitorService;
import com.dudu.duduserver.service.MessageService;
import com.dudu.duduserver.service.UserService;
import com.dudu.duduserver.service.VisitorService;
import com.dudu.duduserver.vo.DeskAccessVO;
import com.dudu.duduserver.vo.DeskCapabilityVO;
import com.dudu.duduserver.vo.DeskConversationVO;
import com.dudu.duduserver.vo.DeskMessagePageVO;
import com.dudu.duduserver.vo.DeskMessageVO;
import com.dudu.duduserver.vo.DeskVisitorIdentityVO;
import com.dudu.duduserver.vo.DeskVisitorPageVO;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * 访客查询实现：授权范围经 DeskAuthService.requireAccess 实时解析，访客始终由
 * 企业 + 授权账号集合过滤；排序与计数按契约固定规则表达，名片保存不影响消息排序。
 * 排序里的布尔表达式与空值回落无法用 Lambda 构造器表达，作为受支持的固定 SQL 片段追加。
 * 按需历史复用同一授权读取，按会话内 sequence 分页投影为契约第 4 节的消息对象。
 */
@Service
@RequiredArgsConstructor
public class DeskVisitorServiceImpl implements DeskVisitorService {

    // wait：待回复优先，待回复按 waiting_since 升序，之后按最后消息时间降序、访客 ID 升序；无消息时间用创建时间
    private static final String ORDER_WAIT =
        "ORDER BY (status = 'needs-reply') DESC,"
            + " CASE WHEN status = 'needs-reply' THEN waiting_since END ASC,"
            + " IFNULL(last_message_time, create_time) DESC, visitor_id ASC";

    // messages：消息数降序，再按最后消息时间降序、访客 ID 升序
    private static final String ORDER_MESSAGES =
        "ORDER BY message_count DESC, IFNULL(last_message_time, create_time) DESC, visitor_id ASC";

    // 渠道发送能力由后续消息票接通；当前如实返回不可发送与原因，不编造可发能力
    private static final DeskCapabilityVO SEND_NOT_READY =
        new DeskCapabilityVO("restricted", List.of(), "渠道发送能力尚未接入");

    private final DeskAuthService deskAuthService;
    private final VisitorService visitorService;
    private final MessageService messageService;
    private final UserService userService;

    @Override
    public DeskVisitorPageVO query(JwtUser me, DeskVisitorQueryDTO query) {
        validate(query);
        DeskAccessVO access = deskAuthService.requireAccess(me);
        List<DeskAccessVO.Account> accounts = access.accounts();
        DeskVisitorPageVO.Counts counts = counts(me.companyId(), accounts);
        List<DeskVisitorPageVO.Channel> channels = channels(accounts);

        List<DeskAccessVO.Account> scoped = channelScopedAccounts(query.channelId(), accounts);
        if (scoped.isEmpty()) {
            return new DeskVisitorPageVO(List.of(), 0L, query.page(), query.pageSize(), counts, channels);
        }
        Map<Long, DeskAccessVO.Account> accountById = accounts.stream()
            .collect(Collectors.toMap(account -> Long.valueOf(account.companyChannelId()), Function.identity()));
        long total = visitorService.count(filters(me.companyId(), query, scoped));
        List<DeskConversationVO> items = List.of();
        if (total > 0) {
            // 计数已单独完成，分页查询不重复计数；排序固定片段在分页 LIMIT 之前生效
            Page<VisitorDO> page = new Page<>(query.page(), query.pageSize(), false);
            List<VisitorDO> rows = visitorService
                .page(page, filters(me.companyId(), query, scoped).last(orderSql(query)))
                .getRecords();
            items = rows.stream()
                .map(row -> toConversation(row, accountById.get(row.getCompanyChannelId())))
                .toList();
        }
        return new DeskVisitorPageVO(items, total, query.page(), query.pageSize(), counts, channels);
    }

    @Override
    public DeskConversationVO get(JwtUser me, String visitorId) {
        AuthorizedVisitor authorized = requireAuthorizedVisitor(me, parseVisitorId(visitorId));
        return toConversation(authorized.visitor(), authorized.account());
    }

    @Override
    public DeskMessagePageVO history(JwtUser me, String visitorId, DeskHistoryQueryDTO query) {
        Long id = parseVisitorId(visitorId);
        Long beforeSequence = parseBeforeSequence(query.beforeSequence());
        int limit = parseLimit(query.limit());
        requireAuthorizedVisitor(me, id);

        // 按 sequence 降序取 limit + 1 条；多出的一条只用于判断还有更早消息，不改变返回顺序
        LambdaQueryWrapper<MessageDO> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(MessageDO::getVisitorId, id)
            .lt(beforeSequence != null, MessageDO::getSequence, beforeSequence)
            .orderByDesc(MessageDO::getSequence);
        List<MessageDO> rows = messageService.page(new Page<>(1, limit + 1, false), wrapper).getRecords();
        boolean hasEarlier = rows.size() > limit;
        List<MessageDO> recentFirst = hasEarlier ? rows.subList(0, limit) : rows;
        String nextCursor = hasEarlier
            ? String.valueOf(recentFirst.get(recentFirst.size() - 1).getSequence())
            : null;
        Map<Long, String> senderNames = senderNames(recentFirst);
        List<DeskMessageVO> items = recentFirst.stream()
            .map(row -> DeskMessageVO.of(row,
                row.getSenderUserId() == null ? null : senderNames.get(row.getSenderUserId())))
            .toList()
            .reversed();
        return new DeskMessagePageVO(items, nextCursor);
    }

    // 访客资源共用的授权读取：不存在 12100；在库但不属于当前企业或当前授权账号统一 10106，不泄漏他人数据
    private AuthorizedVisitor requireAuthorizedVisitor(JwtUser me, Long visitorId) {
        DeskAccessVO access = deskAuthService.requireAccess(me);
        VisitorDO visitor = visitorService.getById(visitorId);
        if (visitor == null) {
            throw new BizException(ApiEnum.DATA_NOT_EXIST, "访客不存在");
        }
        DeskAccessVO.Account account = visitor.getCompanyId().equals(me.companyId())
            ? access.accounts().stream()
                .filter(item -> item.companyChannelId().equals(String.valueOf(visitor.getCompanyChannelId())))
                .findFirst().orElse(null)
            : null;
        if (account == null) {
            throw new BizException(ApiEnum.FORBIDDEN);
        }
        return new AuthorizedVisitor(visitor, account);
    }

    // 发送员工显示名按现有用户数据批量查询，不新增员工快照表；缺失时省略该字段
    private Map<Long, String> senderNames(List<MessageDO> rows) {
        List<Long> senderIds = rows.stream()
            .filter(row -> row.getDirection() == MessageDirectionEnum.OUTGOING && row.getSenderUserId() != null)
            .map(MessageDO::getSenderUserId)
            .distinct()
            .toList();
        if (senderIds.isEmpty()) {
            return Map.of();
        }
        return userService.listByIds(senderIds).stream()
            .filter(user -> user.getName() != null)
            .collect(Collectors.toMap(UserDO::getUserId, UserDO::getName));
    }

    // beforeSequence 只接受正整数的十进制字符串；缺省表示没有更早边界，取最近一页
    private Long parseBeforeSequence(String beforeSequence) {
        if (!StringUtils.hasText(beforeSequence)) {
            return null;
        }
        try {
            long value = Long.parseLong(beforeSequence);
            if (value <= 0) {
                throw new NumberFormatException();
            }
            return value;
        } catch (NumberFormatException e) {
            throw new BizException(ApiEnum.PARAM_ERROR, "起始消息序号必须为正整数");
        }
    }

    // limit 缺省 30，范围 1–100；越界语义与访客分页一致
    private int parseLimit(String limit) {
        if (!StringUtils.hasText(limit)) {
            return DeskHistoryQueryDTO.DEFAULT_LIMIT;
        }
        int value;
        try {
            value = Integer.parseInt(limit);
        } catch (NumberFormatException e) {
            throw new BizException(ApiEnum.PARAM_ERROR, "每页数量必须为整数");
        }
        if (value < 1) {
            throw new BizException(ApiEnum.PARAM_ERROR, "每页数量至少为 1");
        }
        if (value > DeskHistoryQueryDTO.LIMIT_MAX) {
            throw new BizException(ApiEnum.PARAM_EXCEED, "每页数量不能超过 100");
        }
        return value;
    }

    // 已授权的访客与其授权账号，只在本服务内流转
    private record AuthorizedVisitor(VisitorDO visitor, DeskAccessVO.Account account) {
    }

    // 输入范围校验：长度与分页上限用 11200 表达超限，非法取值用 11000
    private void validate(DeskVisitorQueryDTO query) {
        if (query.search().length() > DeskVisitorQueryDTO.SEARCH_MAX_LENGTH) {
            throw new BizException(ApiEnum.PARAM_EXCEED, "搜索关键词不能超过 100 字");
        }
        if (query.page() < 1) {
            throw new BizException(ApiEnum.PARAM_ERROR, "页码从 1 开始");
        }
        if (query.pageSize() < 1) {
            throw new BizException(ApiEnum.PARAM_ERROR, "每页数量至少为 1");
        }
        if (query.pageSize() > DeskVisitorQueryDTO.PAGE_SIZE_MAX) {
            throw new BizException(ApiEnum.PARAM_EXCEED, "每页数量不能超过 100");
        }
        if (!DeskVisitorQueryDTO.CHANNEL_ALL.equals(query.channelId())) {
            channelOf(query.channelId());
        }
    }

    // 渠道筛选只收窄授权账号集合：不在授权范围内的渠道值得到空结果，绝不放行
    private List<DeskAccessVO.Account> channelScopedAccounts(String channelId, List<DeskAccessVO.Account> accounts) {
        if (DeskVisitorQueryDTO.CHANNEL_ALL.equals(channelId)) {
            return accounts;
        }
        ChannelEnum channel = channelOf(channelId);
        return accounts.stream().filter(account -> account.channel() == channel).toList();
    }

    private ChannelEnum channelOf(String channelId) {
        try {
            return ChannelEnum.fromCode(channelId);
        } catch (IllegalArgumentException e) {
            throw new BizException(ApiEnum.PARAM_ERROR, "渠道筛选值无效");
        }
    }

    // 授权范围筛选：企业 + 授权账号集合 + 状态与关键词；搜索词经参数绑定，不拼接用户输入
    private LambdaQueryWrapper<VisitorDO> filters(Long companyId, DeskVisitorQueryDTO query,
                                                  List<DeskAccessVO.Account> scoped) {
        LambdaQueryWrapper<VisitorDO> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(VisitorDO::getCompanyId, companyId)
            .in(VisitorDO::getCompanyChannelId, scoped.stream()
                .map(account -> Long.valueOf(account.companyChannelId())).toList());
        switch (query.status()) {
            case NEEDS_REPLY -> wrapper.eq(VisitorDO::getStatus, VisitorStatusEnum.NEEDS_REPLY);
            case WAITING -> wrapper.eq(VisitorDO::getStatus, VisitorStatusEnum.WAITING);
            case CLOSED -> wrapper.eq(VisitorDO::getStatus, VisitorStatusEnum.CLOSED);
            case ACTIVE -> wrapper.in(VisitorDO::getStatus, VisitorStatusEnum.ACTIVE);
            case ALL -> { }
        }
        if (StringUtils.hasText(query.search())) {
            applySearch(wrapper, query.search(), scoped);
        }
        return wrapper;
    }

    // 搜索按包含关系匹配姓名、外部用户 ID、账号名、渠道名、最后摘要与共享标签/备注
    private void applySearch(LambdaQueryWrapper<VisitorDO> wrapper, String term, List<DeskAccessVO.Account> scoped) {
        List<Long> matchedAccountIds = scoped.stream()
            .filter(account -> matchesAccountText(account, term))
            .map(account -> Long.valueOf(account.companyChannelId()))
            .toList();
        String pattern = "%" + term + "%";
        wrapper.and(w -> {
            // 姓名、外部用户 ID 与最后摘要走数据库 LIKE，参数绑定
            w.like(VisitorDO::getName, term)
                .or().like(VisitorDO::getExternalUserId, term)
                .or().like(VisitorDO::getLastMessagePreview, term);
            if (!matchedAccountIds.isEmpty()) {
                w.or().in(VisitorDO::getCompanyChannelId, matchedAccountIds);
            }
            // 标签为 JSON 数组，Lambda 构造器无法表达 JSON 函数；exists 片段的词条同样参数绑定
            w.or().exists("SELECT 1 FROM visitor_profile vp WHERE vp.visitor_id = visitor.visitor_id"
                    + " AND (vp.note LIKE {0} OR JSON_SEARCH(vp.tags, 'one', {0}, NULL, '$[*]') IS NOT NULL)",
                pattern);
        });
    }

    // 账号名与渠道代码/显示名的包含匹配：授权账号已在本企业范围内，按数据库 ai_ci 语义近似处理
    private boolean matchesAccountText(DeskAccessVO.Account account, String term) {
        String lower = term.toLowerCase(Locale.ROOT);
        ChannelEnum channel = account.channel();
        return account.accountName().toLowerCase(Locale.ROOT).contains(lower)
            || channel != null && (channel.getCode().contains(lower)
            || channel.getDisplayName().toLowerCase(Locale.ROOT).contains(lower));
    }

    private String orderSql(DeskVisitorQueryDTO query) {
        return query.order() == VisitorQueryOrderEnum.MESSAGES ? ORDER_MESSAGES : ORDER_WAIT;
    }

    // 计数取全部授权账号范围，不受关键词、状态与渠道筛选影响；active = needsReply + waiting
    private DeskVisitorPageVO.Counts counts(Long companyId, List<DeskAccessVO.Account> accounts) {
        if (accounts.isEmpty()) {
            return new DeskVisitorPageVO.Counts(0, 0, 0, 0);
        }
        List<Long> scopeIds = accounts.stream().map(account -> Long.valueOf(account.companyChannelId())).toList();
        int needsReply = countStatus(companyId, scopeIds, VisitorStatusEnum.NEEDS_REPLY);
        int waiting = countStatus(companyId, scopeIds, VisitorStatusEnum.WAITING);
        int closed = countStatus(companyId, scopeIds, VisitorStatusEnum.CLOSED);
        return new DeskVisitorPageVO.Counts(needsReply + waiting, needsReply, waiting, closed);
    }

    private int countStatus(Long companyId, List<Long> scopeIds, VisitorStatusEnum status) {
        return Math.toIntExact(visitorService.count(new LambdaQueryWrapper<VisitorDO>()
            .eq(VisitorDO::getCompanyId, companyId)
            .in(VisitorDO::getCompanyChannelId, scopeIds)
            .eq(VisitorDO::getStatus, status)));
    }

    // 授权账号用到的渠道代码与显示名，按账号顺序去重
    private List<DeskVisitorPageVO.Channel> channels(List<DeskAccessVO.Account> accounts) {
        Map<String, String> byCode = new LinkedHashMap<>();
        for (DeskAccessVO.Account account : accounts) {
            ChannelEnum channel = account.channel();
            if (channel != null) {
                byCode.putIfAbsent(channel.getCode(), channel.getDisplayName());
            }
        }
        return byCode.entrySet().stream()
            .map(entry -> new DeskVisitorPageVO.Channel(entry.getKey(), entry.getValue()))
            .toList();
    }

    private DeskConversationVO toConversation(VisitorDO visitor, DeskAccessVO.Account account) {
        ChannelEnum channel = account.channel();
        DeskVisitorIdentityVO identity = new DeskVisitorIdentityVO(
            String.valueOf(visitor.getVisitorId()),
            visitor.getExternalUserId(),
            visitor.getName(),
            visitor.getAvatarUrl(),
            channel == null ? null : channel.getCode(),
            channel == null ? null : channel.getDisplayName(),
            account.companyChannelId(),
            account.accountName());
        return new DeskConversationVO(
            String.valueOf(visitor.getVisitorId()),
            identity,
            visitor.getStatus(),
            visitor.getLastMessagePreview(),
            visitor.getLastMessageTime() == null ? visitor.getCreateTime() : visitor.getLastMessageTime(),
            visitor.getStatus() == VisitorStatusEnum.NEEDS_REPLY ? visitor.getWaitingSince() : null,
            visitor.getMessageCount(),
            visitor.getVersion(),
            SEND_NOT_READY);
    }

    private Long parseVisitorId(String visitorId) {
        try {
            return Long.valueOf(visitorId);
        } catch (NumberFormatException e) {
            throw new BizException(ApiEnum.PARAM_ERROR, "访客 ID 必须为十进制字符串");
        }
    }
}
