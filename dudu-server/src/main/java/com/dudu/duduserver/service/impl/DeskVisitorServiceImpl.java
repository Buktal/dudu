package com.dudu.duduserver.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.dudu.duduserver.config.auth.JwtUser;
import com.dudu.duduserver.config.exception.BizException;
import com.dudu.duduserver.constant.ApiEnum;
import com.dudu.duduserver.constant.ChannelEnum;
import com.dudu.duduserver.constant.MessageDirectionEnum;
import com.dudu.duduserver.constant.VisitorQueryOrderEnum;
import com.dudu.duduserver.constant.VisitorStatusEnum;
import com.dudu.duduserver.dto.DeskHistoryQueryDTO;
import com.dudu.duduserver.dto.DeskStatusDTO;
import com.dudu.duduserver.dto.DeskVisitorQueryDTO;
import com.dudu.duduserver.entity.CompanyChannelDO;
import com.dudu.duduserver.entity.MessageDO;
import com.dudu.duduserver.entity.UserDO;
import com.dudu.duduserver.entity.VisitorDO;
import com.dudu.duduserver.service.CompanyChannelService;
import com.dudu.duduserver.service.DeskAuthService;
import com.dudu.duduserver.service.DeskVisitorService;
import com.dudu.duduserver.service.MessageService;
import com.dudu.duduserver.service.UserService;
import com.dudu.duduserver.service.VisitorService;
import com.dudu.duduserver.socket.DeskSocketGateway;
import com.dudu.duduserver.util.DeskConversationViews;
import com.dudu.duduserver.vo.DeskAccessVO;
import com.dudu.duduserver.vo.DeskConversationVO;
import com.dudu.duduserver.vo.DeskMessagePageVO;
import com.dudu.duduserver.vo.DeskMessageVO;
import com.dudu.duduserver.vo.DeskVisitorPageVO;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
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
 * 访客资源实现：授权范围经 DeskAuthService.requireAccess 实时解析，访客始终由
 * 企业 + 授权账号集合过滤；排序与计数按契约固定规则表达，名片保存不影响消息排序。
 * 排序里的布尔表达式与空值回落无法用 Lambda 构造器表达，作为受支持的固定 SQL 片段追加。
 * 按需历史复用同一授权读取，按会话内 sequence 分页投影为契约第 4 节的消息对象。
 * 结束 / 继续只改接待状态与等待计时，HTTP 返回与 conversation 推送共用同一份会话对象。
 */
@Slf4j
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

    // 搜索词的通配符转义子句：转义字符显式指定为 !，字面匹配语义固定，不随连接的默认转义字符、
    // sql_mode 变化（片段见 applySearch）
    private static final String LIKE_ESCAPE = " ESCAPE '!'";

    private final DeskAuthService deskAuthService;
    private final VisitorService visitorService;
    private final MessageService messageService;
    private final UserService userService;
    private final CompanyChannelService companyChannelService;
    private final DeskSocketGateway deskSocketGateway;
    private final DeskConversationViews deskConversationViews;

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
        long total = visitorService.count(filters(me.companyId(), query, scoped));
        List<DeskConversationVO> items = List.of();
        if (total > 0) {
            // 计数已单独完成，分页查询不重复计数；排序固定片段在分页 LIMIT 之前生效
            Page<VisitorDO> page = new Page<>(query.page(), query.pageSize(), false);
            List<VisitorDO> rows = visitorService
                .page(page, filters(me.companyId(), query, scoped).last(orderSql(query)))
                .getRecords();
            // 账号详情用于会话对象的真实回复能力，只在确有本页访客时读取
            Map<Long, CompanyChannelDO> accountById = companyChannelService
                .listByIds(scoped.stream().map(account -> Long.valueOf(account.companyChannelId())).toList())
                .stream()
                .collect(Collectors.toMap(CompanyChannelDO::getCompanyChannelId, Function.identity(),
                    (existing, replacement) -> existing));
            items = rows.stream()
                .map(row -> toConversation(row, accountById.get(row.getCompanyChannelId())))
                .toList();
        }
        return new DeskVisitorPageVO(items, total, query.page(), query.pageSize(), counts, channels);
    }

    @Override
    public DeskConversationVO get(JwtUser me, String visitorId) {
        AuthorizedVisitor authorized = requireAuthorizedVisitor(me, parseVisitorId(visitorId));
        return toConversation(authorized.visitor(),
            companyChannelService.getById(authorized.visitor().getCompanyChannelId()));
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

    @Override
    public DeskConversationVO updateStatus(JwtUser me, String visitorId, DeskStatusDTO request) {
        VisitorStatusEnum target = requireStatus(request.status());
        AuthorizedVisitor authorized = requireAuthorizedVisitor(me, parseVisitorId(visitorId));
        VisitorDO visitor = authorized.visitor();
        LocalDateTime now = LocalDateTime.now();
        // 契约第 2 节：结束写 closed 并清空 waiting_since；继续在本轮计时未开始时重新计时，已待回复保留原值
        boolean awaiting = visitor.awaitingReply();
        boolean changed = target == VisitorStatusEnum.CLOSED
            ? visitor.getStatus() != VisitorStatusEnum.CLOSED || visitor.getWaitingSince() != null
            : !awaiting;
        if (changed) {
            LambdaUpdateWrapper<VisitorDO> update = Wrappers.<VisitorDO>lambdaUpdate()
                .eq(VisitorDO::getVisitorId, visitor.getVisitorId())
                .set(VisitorDO::getStatus, target)
                .setSql("version = version + 1")
                .set(VisitorDO::getUpdateTime, now);
            if (target == VisitorStatusEnum.CLOSED) {
                update.setSql("waiting_since = NULL");
            } else if (!awaiting) {
                update.set(VisitorDO::getWaitingSince, now);
            }
            visitorService.update(update);
            visitor = visitorService.getById(visitor.getVisitorId());
        }
        CompanyChannelDO account = companyChannelService.getById(visitor.getCompanyChannelId());
        DeskConversationVO conversation = toConversation(visitor, account);
        if (changed) {
            pushStatusChange(account, conversation);
        }
        return conversation;
    }

    // 状态只接受 closed 与 needs-reply：缺失 11100，其他取值 11000，不写库
    private VisitorStatusEnum requireStatus(String status) {
        if (status == null) {
            throw new BizException(ApiEnum.PARAM_MISSING, "缺少接待状态");
        }
        if (VisitorStatusEnum.CLOSED.getCode().equals(status)) {
            return VisitorStatusEnum.CLOSED;
        }
        if (VisitorStatusEnum.NEEDS_REPLY.getCode().equals(status)) {
            return VisitorStatusEnum.NEEDS_REPLY;
        }
        throw new BizException(ApiEnum.PARAM_ERROR, "接待状态只接受 closed 或 needs-reply");
    }

    // 状态保存后推送一次 conversation 报文（含操作者本人）；推送失败只记录，不影响已保存的状态
    private void pushStatusChange(CompanyChannelDO account, DeskConversationVO conversation) {
        if (account == null) {
            return;
        }
        try {
            deskSocketGateway.pushConversation(account.getCompanyId(), account.getCompanyChannelId(), conversation);
        } catch (RuntimeException e) {
            log.error("[desk-reception] 推送接待状态失败, visitorId={}", conversation.id(), e);
        }
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
            .collect(Collectors.toMap(UserDO::getUserId, UserDO::getName, (existing, replacement) -> existing));
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

    private void applySearch(LambdaQueryWrapper<VisitorDO> wrapper, String term, List<DeskAccessVO.Account> scoped) {
        List<Long> matchedAccountIds = scoped.stream()
            .filter(account -> matchesAccountText(account, term))
            .map(account -> Long.valueOf(account.companyChannelId()))
            .toList();
        String pattern = "%" + escapeLike(term) + "%";
        wrapper.and(w -> {
            // 姓名、外部用户 ID 与最后摘要走数据库 LIKE；Lambda 的 like 无法表达 ESCAPE，
            // 用受支持的固定 SQL 片段追加，转义字符显式指定为 !、不随连接默认值变化，
            // 词条仍走占位符参数绑定
            w.apply("name LIKE {0}" + LIKE_ESCAPE, pattern)
                .or().apply("external_user_id LIKE {0}" + LIKE_ESCAPE, pattern)
                .or().apply("last_message_preview LIKE {0}" + LIKE_ESCAPE, pattern);
            if (!matchedAccountIds.isEmpty()) {
                w.or().in(VisitorDO::getCompanyChannelId, matchedAccountIds);
            }
            // 标签为 JSON 数组，Lambda 构造器无法表达 JSON 函数；exists 片段的词条同样参数绑定，
            // LIKE 与 JSON_SEARCH 共用同一显式转义字符 !（JSON_SEARCH 的 escape_char 与 pattern 一致）
            w.or().exists("SELECT 1 FROM visitor_profile vp WHERE vp.visitor_id = visitor.visitor_id"
                    + " AND (vp.note LIKE {0}" + LIKE_ESCAPE
                    + " OR JSON_SEARCH(vp.tags, 'one', {0}, '!', '$[*]') IS NOT NULL)",
                pattern);
        });
    }

    // 通配符转义：! 自身先转义（后两步替换会引入 !），% 与 _ 变为字面量；与 SQL 中显式
    // ESCAPE '!' 及 JSON_SEARCH 的 escape_char 一致，字面匹配不随连接默认转义字符、sql_mode 变化
    private String escapeLike(String term) {
        return term.replace("!", "!!").replace("%", "!%").replace("_", "!_");
    }

    // 账号名与渠道名的包含匹配（契约第 3 节：账号名、渠道名，不含渠道代码）：
    // 授权账号已在本企业范围内，按数据库 ai_ci 语义近似处理
    private boolean matchesAccountText(DeskAccessVO.Account account, String term) {
        String lower = term.toLowerCase(Locale.ROOT);
        ChannelEnum channel = account.channel();
        return account.accountName().toLowerCase(Locale.ROOT).contains(lower)
            || channel != null && channel.getDisplayName().toLowerCase(Locale.ROOT).contains(lower);
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

    private DeskConversationVO toConversation(VisitorDO visitor, CompanyChannelDO account) {
        return deskConversationViews.conversation(visitor, account);
    }

    private Long parseVisitorId(String visitorId) {
        try {
            return Long.valueOf(visitorId);
        } catch (NumberFormatException e) {
            throw new BizException(ApiEnum.PARAM_ERROR, "访客 ID 必须为十进制字符串");
        }
    }
}
