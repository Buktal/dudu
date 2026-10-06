package com.dudu.duduserver.service;

import com.dudu.duduserver.config.exception.BizException;
import com.dudu.duduserver.constant.ApiEnum;
import com.dudu.duduserver.constant.EnableStatusEnum;
import com.dudu.duduserver.constant.OperationActionEnum;
import com.dudu.duduserver.dto.AdminPasswordResetDTO;
import com.dudu.duduserver.dto.CompanyAdminInitDTO;
import com.dudu.duduserver.dto.CompanyCreateDTO;
import com.dudu.duduserver.entity.CompanyDO;
import com.dudu.duduserver.entity.UserDO;
import com.dudu.duduserver.mapper.CompanyMapper;
import com.dudu.duduserver.service.impl.CompanyServiceImpl;
import com.dudu.duduserver.vo.CompanyVO;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * 企业领域服务分支验证：创建三态（成功/预检占用/主键冲突）、停用恢复状态互斥、重置密码归属校验。
 * lambdaUpdate 链路（MP 3.5.17 需真 MapperProxy）与 SQL 真实行为由本地 MySQL 验收覆盖。
 */
class CompanyServiceImplTest {

    private CompanyMapper companyMapper;
    private UserService userService;
    private OperationLogService operationLogService;
    private CompanyServiceImpl companyService;

    @BeforeEach
    void setUp() {
        companyMapper = mock(CompanyMapper.class);
        userService = mock(UserService.class);
        operationLogService = mock(OperationLogService.class);
        companyService = new CompanyServiceImpl(userService, operationLogService);
        // ServiceImpl 的 baseMapper 由 Spring 字段注入，单测直接替换为 mock
        ReflectionTestUtils.setField(companyService, "baseMapper", companyMapper);
    }

    private CompanyDO persistedCompany() {
        CompanyDO company = new CompanyDO();
        company.setCompanyId(100001L);
        company.setCompanyName("测试企业");
        company.setStatus(EnableStatusEnum.ENABLED);
        return company;
    }

    private CompanyCreateDTO createRequest() {
        return new CompanyCreateDTO("100001", "测试企业", "张三", "13800000000",
            null, new CompanyAdminInitDTO("boss", "secret123", null));
    }

    @Test
    void createPersistsCompanyWithInitialAdminAndLogsOperation() {
        when(companyMapper.selectById(100001L)).thenReturn(null, persistedCompany());
        UserDO admin = new UserDO();
        admin.setUserId(9L);
        when(userService.createInitialAdmin(eq(100001L), any(CompanyAdminInitDTO.class))).thenReturn(admin);

        CompanyVO view = companyService.createCompany(createRequest(), 1L);

        assertThat(view.getCompanyId()).isEqualTo("100001");
        assertThat(view.getCompanyName()).isEqualTo("测试企业");
        // 初始管理员就位后回写企业定位列
        verify(companyMapper).updateById(any(CompanyDO.class));
        verify(operationLogService).appendSuccess(1L, 100001L, OperationActionEnum.COMPANY_CREATE,
            100001L, "创建企业「测试企业」，初始管理员 boss");
    }

    @Test
    void createRejectsWhenPrecheckFindsOccupiedId() {
        when(companyMapper.selectById(100001L)).thenReturn(persistedCompany());

        assertThatThrownBy(() -> companyService.createCompany(createRequest(), 1L))
            .isInstanceOf(BizException.class)
            .extracting(e -> ((BizException) e).apiEnum().code)
            .isEqualTo(ApiEnum.DATA_EXIST.code);
        verify(companyMapper, never()).insert(any(CompanyDO.class));
        verify(userService, never()).createInitialAdmin(anyLong(), any());
    }

    @Test
    void createRejectsWhenPrimaryKeyRaceLosesConcurrentInsert() {
        when(companyMapper.selectById(100001L)).thenReturn(null);
        when(companyMapper.insert(any(CompanyDO.class))).thenThrow(new DuplicateKeyException("PRIMARY"));

        assertThatThrownBy(() -> companyService.createCompany(createRequest(), 1L))
            .isInstanceOf(BizException.class)
            .hasMessage("企业 ID 已被占用，请重新选择");
        // 企业与初始管理员共同成功或共同失败
        verify(userService, never()).createInitialAdmin(anyLong(), any());
    }

    @Test
    void disableRejectsAlreadyDisabledCompany() {
        CompanyDO company = persistedCompany();
        company.setStatus(EnableStatusEnum.DISABLED);
        when(companyMapper.selectById(100001L)).thenReturn(company);

        assertThatThrownBy(() -> companyService.disable("100001", "长期不再使用", 1L))
            .isInstanceOf(BizException.class)
            .hasMessage("企业已停用");
    }

    @Test
    void disableRejectsBlankReason() {
        assertThatThrownBy(() -> companyService.disable("100001", "  ", 1L))
            .isInstanceOf(BizException.class)
            .hasMessage("停用原因不能为空");
    }

    @Test
    void enableRejectsAlreadyEnabledCompany() {
        when(companyMapper.selectById(100001L)).thenReturn(persistedCompany());

        assertThatThrownBy(() -> companyService.enable("100001", 1L))
            .isInstanceOf(BizException.class)
            .hasMessage("企业已启用");
    }

    @Test
    void resetPasswordRejectsCompanyWithoutInitialAdminLink() {
        when(companyMapper.selectById(100001L)).thenReturn(persistedCompany());

        assertThatThrownBy(() -> companyService.resetInitialAdminPassword("100001",
            new AdminPasswordResetDTO("new-secret"), 1L))
            .isInstanceOf(BizException.class)
            .hasMessage("企业未初始化管理员");
    }

    @Test
    void resetPasswordRejectsAdminFromOtherCompany() {
        CompanyDO company = persistedCompany();
        company.setInitUserId(9L);
        when(companyMapper.selectById(100001L)).thenReturn(company);
        UserDO foreignAdmin = new UserDO();
        foreignAdmin.setUserId(9L);
        foreignAdmin.setCompanyId(999999L);
        when(userService.getById(9L)).thenReturn(foreignAdmin);

        assertThatThrownBy(() -> companyService.resetInitialAdminPassword("100001",
            new AdminPasswordResetDTO("new-secret"), 1L))
            .isInstanceOf(BizException.class)
            .hasMessage("管理员不属于该企业");
        verify(userService, never()).updatePassword(anyLong(), any());
    }

    @Test
    void resetPasswordUpdatesAdminAndLogsOperation() {
        CompanyDO company = persistedCompany();
        company.setInitUserId(9L);
        when(companyMapper.selectById(100001L)).thenReturn(company);
        UserDO admin = new UserDO();
        admin.setUserId(9L);
        admin.setCompanyId(100001L);
        admin.setUsername("boss");
        when(userService.getById(9L)).thenReturn(admin);

        companyService.resetInitialAdminPassword("100001", new AdminPasswordResetDTO("new-secret"), 1L);

        verify(userService).updatePassword(9L, "new-secret");
        verify(operationLogService).appendSuccess(1L, 100001L, OperationActionEnum.ADMIN_PASSWORD_RESET,
            9L, "重置企业「测试企业」初始管理员 boss 的密码");
    }

    @Test
    void detailMapsLinkedInitialAdminWithoutSensitiveFields() {
        CompanyDO company = persistedCompany();
        company.setInitUserId(9L);
        when(companyMapper.selectById(100001L)).thenReturn(company);
        UserDO admin = new UserDO();
        admin.setUserId(9L);
        admin.setCompanyId(100001L);
        admin.setUsername("boss");
        admin.setName("老板");
        admin.setPasswordHash("$2a$10$secret");
        admin.setStatus(EnableStatusEnum.ENABLED);
        when(userService.getById(9L)).thenReturn(admin);

        var detail = companyService.getDetail("100001");

        assertThat(detail.company().getCompanyId()).isEqualTo("100001");
        assertThat(detail.adminInit().getUserId()).isEqualTo("9");
        assertThat(detail.adminInit().getUsername()).isEqualTo("boss");
        assertThat(detail.adminInit().getName()).isEqualTo("老板");
    }

    @Test
    void detailRejectsUnknownCompany() {
        when(companyMapper.selectById(100001L)).thenReturn(null);

        assertThatThrownBy(() -> companyService.getDetail("100001"))
            .isInstanceOf(BizException.class)
            .hasMessage("企业不存在");
    }
}
