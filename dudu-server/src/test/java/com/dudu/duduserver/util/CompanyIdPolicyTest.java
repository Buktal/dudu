package com.dudu.duduserver.util;

import com.dudu.duduserver.config.exception.BizException;
import com.dudu.duduserver.constant.ApiEnum;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class CompanyIdPolicyTest {

    @ParameterizedTest
    @ValueSource(strings = {"100000", "123456", "999999"})
    void acceptsSixDigitIdsWithinRange(String companyId) {
        assertThat(CompanyIdPolicy.isValid(companyId)).isTrue();
        assertThat(CompanyIdPolicy.parseCompanyId(companyId)).isEqualTo(Long.valueOf(companyId));
    }

    @ParameterizedTest
    @ValueSource(strings = {"99999", "1000000", "012345", "10000a", " 100000", "", "100000 "})
    void rejectsOutOfRangeOrMalformedIds(String companyId) {
        assertThat(CompanyIdPolicy.isValid(companyId)).isFalse();
        assertThatThrownBy(() -> CompanyIdPolicy.parseCompanyId(companyId))
            .isInstanceOf(BizException.class)
            .extracting(e -> ((BizException) e).apiEnum().code)
            .isEqualTo(ApiEnum.PARAM_ERROR.code);
    }

    @Test
    void rejectsNullId() {
        assertThat(CompanyIdPolicy.isValid(null)).isFalse();
        assertThatThrownBy(() -> CompanyIdPolicy.parseCompanyId(null))
            .isInstanceOf(BizException.class);
    }
}
