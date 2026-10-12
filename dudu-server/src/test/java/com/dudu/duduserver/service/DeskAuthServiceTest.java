package com.dudu.duduserver.service;

import com.dudu.duduserver.config.auth.JwtManager;
import com.dudu.duduserver.config.auth.JwtProperties;
import com.dudu.duduserver.config.auth.JwtUser;
import com.dudu.duduserver.config.exception.BizException;
import com.dudu.duduserver.constant.ApiEnum;
import com.dudu.duduserver.constant.EnableStatusEnum;
import com.dudu.duduserver.constant.UserRoleEnum;
import com.dudu.duduserver.dto.DeskLoginDTO;
import com.dudu.duduserver.entity.CompanyDO;
import com.dudu.duduserver.entity.UserDO;
import com.dudu.duduserver.service.impl.DeskAuthServiceImpl;
import com.dudu.duduserver.util.PasswordHasher;
import com.dudu.duduserver.vo.DeskAccessVO;
import com.dudu.duduserver.vo.DeskLoginVO;
import com.dudu.duduserver.vo.DeskProfileVO;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class DeskAuthServiceTest {

    private static final String RAW_PASSWORD = "right-pass";
    private static final Long COMPANY_ID = 783101L;
    private static final Long USER_ID = 9L;

    private final UserService userService = mock(UserService.class);
    private final CompanyService companyService = mock(CompanyService.class);
    private final DeskAccessService deskAccessService = mock(DeskAccessService.class);
    private final JwtManager jwtManager = new JwtManager(new JwtProperties("test-secret", null));
    private final DeskAuthService deskAuthService = new DeskAuthServiceImpl(userService, companyService,
        deskAccessService, jwtManager, new JwtProperties("test-secret", 900L));

    @BeforeEach
    void setUp() {
        when(companyService.getById(COMPANY_ID)).thenReturn(company());
        when(deskAccessService.resolve(any(CompanyDO.class), any(UserDO.class))).thenReturn(access());
    }

    @Test
    void loginIssuesTokenCarryingCompanyIdentityAndCurrentAccess() {
        UserDO stored = agent();
        CompanyDO storedCompany = company();
        when(userService.findCompanyUser(COMPANY_ID, "boss")).thenReturn(stored);
        when(companyService.getById(COMPANY_ID)).thenReturn(storedCompany);

        DeskLoginVO view = deskAuthService.login(new DeskLoginDTO("783101", " boss ", RAW_PASSWORD));

        assertThat(view.user().userId()).isEqualTo("9");
        assertThat(view.user().username()).isEqualTo("boss");
        assertThat(view.user().role()).isEqualTo(UserRoleEnum.CONSOLE);
        assertThat(view.company().companyId()).isEqualTo("783101");
        assertThat(view.company().companyName()).isEqualTo("验收企业");
        assertThat(view.access().groups()).hasSize(1);
        // 签发的 token 可原样解析回企业身份，exp 与返回值一致
        JwtUser parsed = jwtManager.parseToken(view.token());
        assertThat(parsed.companyId()).isEqualTo(COMPANY_ID);
        assertThat(parsed.userId()).isEqualTo(USER_ID);
        assertThat(parsed.role()).isEqualTo(UserRoleEnum.CONSOLE);
        assertThat(view.exp()).isEqualTo(parsed.exp());
        verify(userService).findCompanyUser(COMPANY_ID, "boss");
        verify(deskAccessService).resolve(storedCompany, stored);
    }

    @Test
    void loginRejectsOverlongAccountBeforeQuerying() {
        assertThatThrownBy(() -> deskAuthService.login(
            new DeskLoginDTO("783101", "x".repeat(65), RAW_PASSWORD)))
            .isInstanceOf(BizException.class)
            .extracting(e -> ((BizException) e).apiEnum().code)
            .isEqualTo(ApiEnum.PARAM_EXCEED.code);

        verify(userService, never()).findCompanyUser(any(), any());
    }

    @Test
    void loginFailsUniformlyForUnknownDisabledOrWrongRoleIdentity() {
        assertLoginFails(null, company());
        assertLoginFails(agentWithWrongPassword(), company());
        assertLoginFails(agentWithStatus(EnableStatusEnum.DISABLED), company());
        assertLoginFails(agentWithRole(UserRoleEnum.ADMIN), company());
        assertLoginFails(agent(), null);
        assertLoginFails(agent(), companyWithStatus(EnableStatusEnum.DISABLED));
    }

    @Test
    void loginKeepsPasswordExactlyAndDoesNotTrimIt() {
        when(userService.findCompanyUser(COMPANY_ID, "boss")).thenReturn(agent());

        assertLoginFails(agent(), company(), " " + RAW_PASSWORD);
    }

    @Test
    void profileRequiresTokenCompanyToMatchPersistedEmployee() {
        UserDO stored = agent();
        CompanyDO storedCompany = company();
        when(userService.getById(USER_ID)).thenReturn(stored);
        when(companyService.getById(COMPANY_ID)).thenReturn(storedCompany);

        DeskProfileVO profile = deskAuthService.getProfile(new JwtUser(COMPANY_ID, USER_ID, UserRoleEnum.CONSOLE, 0L));

        assertThat(profile.user().userId()).isEqualTo("9");
        assertThat(profile.company().companyId()).isEqualTo("783101");
        assertThat(profile.access()).isEqualTo(access());
        verify(deskAccessService).resolve(storedCompany, stored);
    }

    @Test
    void profileRejectsMissingMismatchedDisabledOrWrongRoleIdentity() {
        assertProfileFails(null, COMPANY_ID);
        assertProfileFails(agent(), null);
        assertProfileFails(agent(), 783102L);
        assertProfileFails(agentWithStatus(EnableStatusEnum.DISABLED), COMPANY_ID);
        assertProfileFails(agentWithRole(UserRoleEnum.ADMIN), COMPANY_ID);
    }

    @Test
    void profileRejectsWhenCompanyIsMissingOrDisabled() {
        when(userService.getById(USER_ID)).thenReturn(agent());
        when(companyService.getById(COMPANY_ID)).thenReturn(null);

        assertProfileFails(agent(), COMPANY_ID);

        when(companyService.getById(COMPANY_ID)).thenReturn(companyWithStatus(EnableStatusEnum.DISABLED));

        assertProfileFails(agent(), COMPANY_ID);
    }

    private void assertLoginFails(UserDO user, CompanyDO company) {
        assertLoginFails(user, company, RAW_PASSWORD);
    }

    private void assertLoginFails(UserDO user, CompanyDO company, String password) {
        when(userService.findCompanyUser(COMPANY_ID, "boss")).thenReturn(user);
        when(companyService.getById(COMPANY_ID)).thenReturn(company);

        assertThatThrownBy(() -> deskAuthService.login(new DeskLoginDTO("783101", "boss", password)))
            .isInstanceOf(BizException.class)
            .extracting(e -> ((BizException) e).apiEnum().code)
            .isEqualTo(ApiEnum.LOGIN_FAILED.code);
    }

    private void assertProfileFails(UserDO user, Long tokenCompanyId) {
        when(userService.getById(USER_ID)).thenReturn(user);

        assertThatThrownBy(() -> deskAuthService.getProfile(
            new JwtUser(tokenCompanyId, USER_ID, UserRoleEnum.CONSOLE, 0L)))
            .isInstanceOf(BizException.class)
            .extracting(e -> ((BizException) e).apiEnum().code)
            .isEqualTo(ApiEnum.TOKEN_VERIFY.code);
    }

    private CompanyDO company() {
        return companyWithStatus(EnableStatusEnum.ENABLED);
    }

    private CompanyDO companyWithStatus(EnableStatusEnum status) {
        CompanyDO company = new CompanyDO();
        company.setCompanyId(COMPANY_ID);
        company.setCompanyName("验收企业");
        company.setStatus(status);
        company.setInitUserId(USER_ID);
        return company;
    }

    private UserDO agent() {
        UserDO user = new UserDO();
        user.setUserId(USER_ID);
        user.setCompanyId(COMPANY_ID);
        user.setUsername("boss");
        user.setName("老板");
        user.setPasswordHash(PasswordHasher.hash(RAW_PASSWORD));
        user.setRole(UserRoleEnum.CONSOLE);
        user.setStatus(EnableStatusEnum.ENABLED);
        return user;
    }

    private UserDO agentWithWrongPassword() {
        UserDO user = agent();
        user.setPasswordHash(PasswordHasher.hash("another-pass"));
        return user;
    }

    private UserDO agentWithStatus(EnableStatusEnum status) {
        UserDO user = agent();
        user.setStatus(status);
        return user;
    }

    private UserDO agentWithRole(UserRoleEnum role) {
        UserDO user = agent();
        user.setRole(role);
        return user;
    }

    private DeskAccessVO access() {
        return new DeskAccessVO(true, List.of(new DeskAccessVO.Group("31", "售前")), List.of());
    }
}
