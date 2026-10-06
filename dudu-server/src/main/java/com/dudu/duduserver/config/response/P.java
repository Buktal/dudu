package com.dudu.duduserver.config.response;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.dudu.duduserver.config.query.PageQuery;
import com.dudu.duduserver.constant.ApiEnum;

import java.util.List;

/**
 * 分页统一返回体，与 R 同构平铺不嵌套：list 为当页数据，total/page/pageSize 为分页元信息；
 * 同时集中维护分页参数的归一化规则与 MyBatis-Plus 分页对象的进出组装。
 */
public record P<T>(int code, String msg, List<T> list, long total, long page, long pageSize) {

    // 缺省页码与页大小，以及单页上限
    private static final long DEFAULT_PAGE = 1;
    private static final long DEFAULT_PAGE_SIZE = 20;
    private static final long MAX_PAGE_SIZE = 100;

    // 由 MyBatis-Plus 分页结果与已映射视图列表组装
    public static <T> P<T> ok(IPage<?> page, List<T> list) {
        return new P<>(ApiEnum.OK.code, ApiEnum.OK.desc, list, page.getTotal(), page.getCurrent(), page.getSize());
    }

    // 由分页查询与总条数构造 MyBatis-Plus 分页请求：页码空或小于 1 取缺省，页大小空或越界取缺省且不超上限；
    // 页码超过总页数时钳位到最后一页（总条数为 0 取第 1 页）。计数由调用方显式完成，分页对象不再重复计数
    public static <T> Page<T> page(PageQuery query, long total) {
        Long page = query.getPage();
        Long pageSize = query.getPageSize();
        long current = page == null || page < DEFAULT_PAGE ? DEFAULT_PAGE : page;
        long size = pageSize == null || pageSize < 1 ? DEFAULT_PAGE_SIZE : Math.min(pageSize, MAX_PAGE_SIZE);
        long pages = Math.max(DEFAULT_PAGE, (total + size - 1) / size);
        return new Page<>(Math.min(current, pages), size, false);
    }
}
