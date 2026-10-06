package com.dudu.duduserver.common;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.dudu.duduserver.common.PageQuery;
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
        assertThat(query.toPage(2000).getCurrent()).isEqualTo(1);
    }

    @Test
    void pageKeepsPositivePageWithinTotal() {
        PageQuery query = new PageQuery();
        query.setPage(7L);
        assertThat(query.toPage(2000).getCurrent()).isEqualTo(7);
    }

    @Test
    void pageClampsBeyondTotalPagesToLastPage() {
        PageQuery query = new PageQuery();
        query.setPage(7L);
        assertThat(query.toPage(35).getCurrent()).isEqualTo(2);
    }

    @Test
    void pageKeepsExactLastPage() {
        PageQuery query = new PageQuery();
        query.setPage(2L);
        assertThat(query.toPage(40).getCurrent()).isEqualTo(2);
    }

    @Test
    void pageClampsToFirstPageWhenTotalIsZero() {
        PageQuery query = new PageQuery();
        query.setPage(5L);
        assertThat(query.toPage(0).getCurrent()).isEqualTo(1);
    }

    @Test
    void pageClampsAfterPageSizeCap() {
        PageQuery query = new PageQuery();
        query.setPage(3L);
        query.setPageSize(1000L);
        assertThat(query.toPage(101).getCurrent()).isEqualTo(2);
    }

    @Test
    void pageDoesNotRepeatCount() {
        PageQuery query = new PageQuery();
        // 构造即关闭 searchCount，计数由调用方显式完成，分页查询不再重复计数
        assertThat(query.toPage(35).searchCount()).isFalse();
    }

    @Test
    void pageNormalizesNullOrOutOfRangePageSizeToDefault() {
        assertThat(queryWithPageSize(null).toPage(2000).getSize()).isEqualTo(20);
        assertThat(queryWithPageSize(0L).toPage(2000).getSize()).isEqualTo(20);
        assertThat(queryWithPageSize(-5L).toPage(2000).getSize()).isEqualTo(20);
    }

    @Test
    void pageKeepsPageSizeUpToCap() {
        assertThat(queryWithPageSize(50L).toPage(2000).getSize()).isEqualTo(50);
        assertThat(queryWithPageSize(100L).toPage(2000).getSize()).isEqualTo(100);
        assertThat(queryWithPageSize(1000L).toPage(2000).getSize()).isEqualTo(100);
    }

    // 构造仅设置页大小的分页查询
    private static PageQuery queryWithPageSize(Long pageSize) {
        PageQuery query = new PageQuery();
        query.setPageSize(pageSize);
        return query;
    }
}
