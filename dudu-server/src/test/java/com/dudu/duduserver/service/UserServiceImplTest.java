package com.dudu.duduserver.service;

import com.dudu.duduserver.config.exception.BizException;
import com.dudu.duduserver.constant.ApiEnum;
import com.dudu.duduserver.constant.UserRoleEnum;
import com.dudu.duduserver.dto.CompanyAdminInitDTO;
import com.dudu.duduserver.entity.UserDO;
import com.dudu.duduserver.mapper.UserMapper;
import com.dudu.duduserver.service.impl.UserServiceImpl;
import com.dudu.duduserver.util.PasswordCodec;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class UserServiceImplTest {

    private UserMapper userMapper;
    private UserServiceImpl userService;

    @BeforeEach
    void setUp() {
        userMapper = mock(UserMapper.class);
        userService = new UserServiceImpl();
        // ServiceImpl 的 baseMapper 由 Spring 字段注入，单测直接替换为 mock
        ReflectionTestUtils.setField(userService, "baseMapper", userMapper);
    }

    @Test
    void createInitialAdminDefaultsBlankNameToUsername() {
        userService.createInitialAdmin(100001L, new CompanyAdminInitDTO("boss", "secret123", " "));

        ArgumentCaptor<UserDO> captor = ArgumentCaptor.forClass(UserDO.class);
        verify(userMapper).insert(captor.capture());
        UserDO saved = captor.getValue();
        assertThat(saved.getName()).isEqualTo("boss");
        assertThat(saved.getCompanyId()).isEqualTo(100001L);
        assertThat(saved.getRole()).isEqualTo(UserRoleEnum.CONSOLE.code);
        assertThat(PasswordCodec.matches("secret123", saved.getPasswordHash())).isTrue();
    }

    @Test
    void createInitialAdminKeepsProvidedName() {
        userService.createInitialAdmin(100001L, new CompanyAdminInitDTO("boss", "secret123", "老板"));

        ArgumentCaptor<UserDO> captor = ArgumentCaptor.forClass(UserDO.class);
        verify(userMapper).insert(captor.capture());
        assertThat(captor.getValue().getName()).isEqualTo("老板");
    }

    @Test
    void createInitialAdminMapsDuplicateKeyToDataExist() {
        when(userMapper.insert(any(UserDO.class))).thenThrow(new DuplicateKeyException("uk_user_scope_username"));

        assertThatThrownBy(() -> userService.createInitialAdmin(100001L,
            new CompanyAdminInitDTO("boss", "secret123", null)))
            .isInstanceOf(BizException.class)
            .hasMessage("登录名已存在")
            .extracting(e -> ((BizException) e).apiEnum().code)
            .isEqualTo(ApiEnum.DATA_EXIST.code);
    }

    @Test
    void changePasswordPersistsHashedPatchOnly() {
        userService.updatePassword(9L, "new-secret");

        ArgumentCaptor<UserDO> captor = ArgumentCaptor.forClass(UserDO.class);
        verify(userMapper).updateById(captor.capture());
        UserDO patch = captor.getValue();
        assertThat(patch.getUserId()).isEqualTo(9L);
        assertThat(PasswordCodec.matches("new-secret", patch.getPasswordHash())).isTrue();
    }
}
