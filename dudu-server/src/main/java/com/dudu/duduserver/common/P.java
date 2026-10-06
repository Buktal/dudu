package com.dudu.duduserver.common;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.dudu.duduserver.constant.ApiEnum;

import java.util.List;

/**
 * 分页统一返回体，与 R 同构平铺不嵌套：list 为当页数据，total/page/pageSize 为分页元信息；
 * 仅负责响应组装，分页参数归一化由 PageQuery 负责。
 */
public record P<T>(Integer code, String msg, List<T> list, Long total, Long page, Long pageSize) {

    // 由 MyBatis-Plus 分页结果与已映射视图列表组装
    public static <T> P<T> ok(IPage<?> page, List<T> list) {
        return new P<>(ApiEnum.OK.code, ApiEnum.OK.desc, list, page.getTotal(), page.getCurrent(), page.getSize());
    }

}
