package com.dudu.duduserver.common;

import cn.hutool.core.util.ObjectUtil;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import lombok.Data;

/**
 * 分页查询：默认第 1 页、每页 20 条，单页最多 100 条。
 */
@Data
public class PageQuery {

    private static final long DEFAULT_PAGE = 1;
    private static final long DEFAULT_PAGE_SIZE = 20;
    private static final long MAX_PAGE_SIZE = 100;

    private Long page;
    private Long pageSize;

    // Hutool 补缺省值，MP 计算总页数；越界取末页，查询不重复计数
    public <T> Page<T> toPage(long total) {
        long size = ObjectUtil.defaultIfNull(pageSize, DEFAULT_PAGE_SIZE);
        Page<T> result = new Page<>(Math.max(ObjectUtil.defaultIfNull(page, DEFAULT_PAGE), DEFAULT_PAGE),
            size < 1 ? DEFAULT_PAGE_SIZE : Math.min(size, MAX_PAGE_SIZE), total, false);
        return result.setCurrent(Math.min(result.getCurrent(), Math.max(DEFAULT_PAGE, result.getPages())));
    }
}
