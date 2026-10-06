package com.dudu.duduserver.service;

import com.dudu.duduserver.config.exception.BizException;
import com.dudu.duduserver.constant.ApiEnum;
import com.dudu.duduserver.entity.CompanyDO;
import com.dudu.duduserver.mapper.CompanyMapper;
import com.dudu.duduserver.service.impl.CompanyServiceImpl;
import com.dudu.duduserver.util.CompanyIdPolicy;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.*;

class CompanyServiceIdCandidateTest {

    private CompanyMapper companyMapper;
    private CompanyServiceImpl companyService;

    @BeforeEach
    void setUp() {
        companyMapper = mock(CompanyMapper.class);
        companyService = new CompanyServiceImpl(mock(UserService.class), mock(OperationLogService.class));
        // ServiceImpl 的 baseMapper 由 Spring 字段注入，单测直接替换为 mock
        ReflectionTestUtils.setField(companyService, "baseMapper", companyMapper);
    }

    @Test
    void skipsOccupiedIdsAndReturnsFirstFreeCandidate() {
        when(companyMapper.selectById(anyLong()))
            .thenReturn(new CompanyDO())
            .thenReturn(null);

        String candidate = companyService.generateIdCandidate();

        assertThat(CompanyIdPolicy.isValid(candidate)).isTrue();
        verify(companyMapper, times(2)).selectById(anyLong());
    }

    @Test
    void throwsDataErrorAfterBoundedRetriesExhausted() {
        when(companyMapper.selectById(anyLong())).thenReturn(new CompanyDO());

        assertThatThrownBy(() -> companyService.generateIdCandidate())
            .isInstanceOf(BizException.class)
            .extracting(e -> ((BizException) e).apiEnum().code)
            .isEqualTo(ApiEnum.DATA_ERROR.code);
        // 有界重试上限 50 次，防止号段接近占满时无休止探测
        verify(companyMapper, times(50)).selectById(anyLong());
    }

    @Test
    void candidateAlwaysStaysWithinPolicyRange() {
        when(companyMapper.selectById(anyLong())).thenReturn(null);

        for (int i = 0; i < 100; i++) {
            String candidate = companyService.generateIdCandidate();
            long value = Long.parseLong(candidate);
            assertThat(value)
                .isGreaterThanOrEqualTo(CompanyIdPolicy.MIN)
                .isLessThanOrEqualTo(CompanyIdPolicy.MAX);
        }
        Mockito.verifyNoMoreInteractions(Mockito.ignoreStubs(companyMapper));
    }

    @Test
    void checkIdAvailabilityReportsOccupiedId() {
        when(companyMapper.selectById(888888L)).thenReturn(new CompanyDO());
        when(companyMapper.selectById(777777L)).thenReturn(null);

        assertThat(companyService.checkIdAvailability("888888").available()).isFalse();
        assertThat(companyService.checkIdAvailability("777777").available()).isTrue();
    }
}
