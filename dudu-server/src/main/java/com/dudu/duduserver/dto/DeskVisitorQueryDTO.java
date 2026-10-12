package com.dudu.duduserver.dto;

import com.dudu.duduserver.constant.VisitorQueryOrderEnum;
import com.dudu.duduserver.constant.VisitorQueryStatusEnum;
import org.springframework.util.StringUtils;

/**
 * Desk 访客查询输入：缺省值与 search 去首尾空白在构造时归一（search=""、channelId="all"、
 * status=active、order=wait、page=1、pageSize=30）；范围校验按 11000/11200 语义在服务层给出，
 * 未知 status/order 在反序列化即被拒绝。
 */
public record DeskVisitorQueryDTO(
    String search,
    String channelId,
    VisitorQueryStatusEnum status,
    VisitorQueryOrderEnum order,
    Integer page,
    Integer pageSize) {

    public static final int DEFAULT_PAGE = 1;
    public static final int DEFAULT_PAGE_SIZE = 30;
    public static final int PAGE_SIZE_MAX = 100;
    public static final int SEARCH_MAX_LENGTH = 100;

    // 渠道筛选的“全部”取值：ChannelEnum 是平台枚举，不在此扩充非渠道值
    public static final String CHANNEL_ALL = "all";

    public DeskVisitorQueryDTO {
        search = search == null ? "" : search.trim();
        channelId = StringUtils.hasText(channelId) ? channelId : CHANNEL_ALL;
        status = status == null ? VisitorQueryStatusEnum.ACTIVE : status;
        order = order == null ? VisitorQueryOrderEnum.WAIT : order;
        page = page == null ? DEFAULT_PAGE : page;
        pageSize = pageSize == null ? DEFAULT_PAGE_SIZE : pageSize;
    }
}
