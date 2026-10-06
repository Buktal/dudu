package com.dudu.duduserver.service;

import com.dudu.duduserver.config.auth.JwtManager;
import com.dudu.duduserver.config.auth.JwtProperties;
import com.dudu.duduserver.config.auth.JwtUser;
import com.dudu.duduserver.config.exception.BizException;
import com.dudu.duduserver.constant.*;
import com.dudu.duduserver.dto.AdminLoginDTO;
import com.dudu.duduserver.dto.AdminPasswordChangeDTO;
import com.dudu.duduserver.entity.UserDO;
import com.dudu.duduserver.service.impl.AuthServiceImpl;
import com.dudu.duduserver.util.PasswordHasher;
import com.dudu.duduserver.vo.AdminLoginVO;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

class AuthServiceTest {

    private static final String RAW_PASSWORD = "right-pass";

    private final UserService userService = mock(UserService.class);
    private final OperationLogService operationLogService = mock(OperationLogService.class);
    private final JwtManager jwtManager = new JwtManager(new JwtProperties("test-secret", null));
    private final AuthService authService = new AuthServiceImpl(userService, operationLogService,
        jwtManager, new JwtProperties("test-secret", 900L));

    private UserDO platformUser() {
        UserDO user = new UserDO();
        user.setUserId(1L);
        user.setUsername("Admin");
        user.setName("平台管理员");
        user.setPasswordHash(PasswordHasher.hash(RAW_PASSWORD));
        user.setRole(UserRoleEnum.ADMIN);
        user.setStatus(EnableStatusEnum.ENABLED);
        return user;
    }

    private void assertLoginFails(UserDO storedUser) {
        when(userService.findPlatformUser("Admin")).thenReturn(storedUser);

        assertThatThrownBy(() -> authService.login(new AdminLoginDTO("Admin", RAW_PASSWORD)))
            .isInstanceOf(BizException.class)
            .extracting(e -> ((BizException) e).apiEnum().code)
            .isEqualTo(ApiEnum.LOGIN_FAILED.code);
    }

    @BeforeEach
    void setUp() {
        when(userService.getById(1L)).thenReturn(platformUser());
    }

    @Test
    void loginFailsUniformlyForUnknownAccount() {
        assertLoginFails(null);
    }

    @Test
    void loginFailsUniformlyForWrongPassword() {
        UserDO stored = platformUser();
        stored.setPasswordHash(PasswordHasher.hash("another-pass"));
        assertLoginFails(stored);
    }

    @Test
    void loginFailsUniformlyForNonDuduRole() {
        UserDO stored = platformUser();
        stored.setRole(UserRoleEnum.CONSOLE);
        assertLoginFails(stored);
    }

    @Test
    void loginFailsUniformlyForDisabledAccount() {
        UserDO stored = platformUser();
        stored.setStatus(EnableStatusEnum.DISABLED);
        assertLoginFails(stored);
    }

    @Test
    void loginIssuesTokenCarryingPlatformIdentity() {
        when(userService.findPlatformUser("Admin")).thenReturn(platformUser());

        AdminLoginVO view = authService.login(new AdminLoginDTO("Admin", RAW_PASSWORD));

        assertThat(view.user().getUsername()).isEqualTo("Admin");
        assertThat(view.user().getUserId()).isEqualTo("1");
        // 签发的 token 可原样解析回平台身份，exp 与返回值一致
        JwtUser parsed = jwtManager.parseToken(view.token());
        assertThat(parsed.userId()).isEqualTo(1L);
        assertThat(parsed.role()).isEqualTo(UserRoleEnum.ADMIN);
        assertThat(parsed.companyId()).isNull();
        assertThat(view.exp()).isEqualTo(parsed.exp());
    }

    @Test
    void detailRejectsMissingUser() {
        when(userService.getById(1L)).thenReturn(null);

        assertThatThrownBy(() -> authService.getDetail(new JwtUser(null, 1L, UserRoleEnum.ADMIN, 0L)))
            .isInstanceOf(BizException.class)
            .hasMessage("账号不存在");
    }

    @Test
    void changePasswordRejectsWrongOldPassword() {
        assertThatThrownBy(() -> authService.updatePassword(new JwtUser(null, 1L, UserRoleEnum.ADMIN, 0L),
            new AdminPasswordChangeDTO("wrong-old", "brand-new-1")))
            .isInstanceOf(BizException.class)
            .hasMessage(ApiEnum.PASSWORD_WRONG.desc);

        verify(userService, never()).updatePassword(anyLong(), anyString());
    }

    @Test
    void changePasswordUpdatesHashAndLogsOperation() {
        authService.updatePassword(new JwtUser(null, 1L, UserRoleEnum.ADMIN, 0L),
            new AdminPasswordChangeDTO(RAW_PASSWORD, "brand-new-1"));

        verify(userService).updatePassword(1L, "brand-new-1");
        verify(operationLogService).appendSuccess(1L, null, OperationActionEnum.ADMIN_PASSWORD_CHANGE,
            1L, "修改自己的密码");
    }
}
