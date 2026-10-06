package com.dudu.duduserver.constant;

import org.junit.jupiter.api.Test;

import java.util.Arrays;

import static org.assertj.core.api.Assertions.assertThat;

class ApiEnumTest {

    @Test
    void codesAreUnique() {
        long distinct = Arrays.stream(ApiEnum.values()).map(e -> e.code).distinct().count();

        assertThat(distinct).isEqualTo(ApiEnum.values().length);
    }

    @Test
    void okIsZeroAndUnknownIs10001() {
        assertThat(ApiEnum.OK.code).isZero();
        assertThat(ApiEnum.UNKNOWN.code).isEqualTo(10001);
    }

    @Test
    void errorCodesAreFiveDigit() {
        Arrays.stream(ApiEnum.values())
            .filter(e -> e != ApiEnum.OK)
            .forEach(e -> assertThat(e.code).isBetween(10000, 99999));
    }

    @Test
    void segmentsHoldTheirFamilies() {
        assertThat(ApiEnum.TOKEN_ERROR.code).isEqualTo(10100);
        assertThat(ApiEnum.PARAM_ERROR.code).isEqualTo(11000);
        assertThat(ApiEnum.DATA_ERROR.code).isEqualTo(12000);
        assertThat(ApiEnum.THIRD_ERROR.code).isEqualTo(13000);
    }
}
