package com.dudu.duduserver.dto;

/**
 * Desk 历史分页输入：beforeSequence 与 limit 以可选查询参数字符串到达，
 * 数字解析与范围校验按 11000/11200 语义在服务层给出；limit 缺省为最近一页大小。
 */
public record DeskHistoryQueryDTO(String beforeSequence, String limit) {

    public static final int DEFAULT_LIMIT = 30;
    public static final int LIMIT_MAX = 100;
}
