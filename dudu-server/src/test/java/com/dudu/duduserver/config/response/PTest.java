package com.dudu.duduserver.config.response;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.dudu.duduserver.config.query.PageQuery;
import com.dudu.duduserver.constant.ApiEnum;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class PTest {

    @Test
    void okCarriesPageMetadataAndMappedList() {
        Page<?> page = new Page<>(2, 20);
        page.setTotal(35);
        List<String> list = List.of("a", "b");

        P<String> result = P.ok(page, list);

        assertThat(result.code()).isEqualTo(ApiEnum.OK.code);
        assertThat(result.msg()).isEqualTo(ApiEnum.OK.desc);
        assertThat(result.list()).isEqualTo(list);
        assertThat(result.total()).isEqualTo(35);
        assertThat(result.page()).isEqualTo(2);
        assertThat(result.pageSize()).isEqualTo(20);
    }

    @ParameterizedTest
    @ValueSource(longs = {0, -1})
    void pageNormalizesOutOfRangePageToDefault(long input) {
        PageQuery query = new PageQuery();
        query.setPage(input);
        assertThat(P.page(query, 2000).getCurrent()).isEqualTo(1);
    }

    @Test
    void pageKeepsPositivePageWithinTotal() {
        PageQuery query = new PageQuery();
        query.setPage(7L);
        assertThat(P.page(query, 2000).getCurrent()).isEqualTo(7);
    }

    @Test
    void pageClampsBeyondTotalPagesToLastPage() {
        PageQuery query = new PageQuery();
        query.setPage(7L);
        assertThat(P.page(query, 35).getCurrent()).isEqualTo(2);
    }

    @Test
    void pageKeepsExactLastPage() {
        PageQuery query = new PageQuery();
        query.setPage(2L);
        assertThat(P.page(query, 40).getCurrent()).isEqualTo(2);
    }

    @Test
    void pageClampsToFirstPageWhenTotalIsZero() {
        PageQuery query = new PageQuery();
        query.setPage(5L);
        assertThat(P.page(query, 0).getCurrent()).isEqualTo(1);
    }

    @Test
    void pageClampsAfterPageSizeCap() {
        PageQuery query = new PageQuery();
        query.setPage(3L);
        query.setPageSize(1000L);
        assertThat(P.page(query, 101).getCurrent()).isEqualTo(2);
    }

    @Test
    void pageDoesNotRepeatCount() {
        PageQuery query = new PageQuery();
        // 构造即关闭 searchCount，计数由调用方显式完成，分页查询不再重复计数
        assertThat(P.page(query, 35).searchCount()).isFalse();
    }

    @Test
    void pageNormalizesNullOrOutOfRangePageSizeToDefault() {
        assertThat(P.page(queryWithPageSize(null), 2000).getSize()).isEqualTo(20);
        assertThat(P.page(queryWithPageSize(0L), 2000).getSize()).isEqualTo(20);
        assertThat(P.page(queryWithPageSize(-5L), 2000).getSize()).isEqualTo(20);
    }

    @Test
    void pageKeepsPageSizeUpToCap() {
        assertThat(P.page(queryWithPageSize(50L), 2000).getSize()).isEqualTo(50);
        assertThat(P.page(queryWithPageSize(100L), 2000).getSize()).isEqualTo(100);
        assertThat(P.page(queryWithPageSize(1000L), 2000).getSize()).isEqualTo(100);
    }

    // 构造仅设置页大小的分页查询
    private static PageQuery queryWithPageSize(Long pageSize) {
        PageQuery query = new PageQuery();
        query.setPageSize(pageSize);
        return query;
    }
}
