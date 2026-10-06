package com.dudu.duduserver.config.query;

import lombok.Data;

/**
 * 分页查询基类：携带 page/pageSize，缺省与上限的归一化规则集中在 P。
 */
@Data
public class PageQuery {

    // 页码，从 1 起；空或越界由 P.page 归一化
    protected Long page;

    // 每页条数；空或越界由 P.pageSize 归一化
    protected Long pageSize;
}
