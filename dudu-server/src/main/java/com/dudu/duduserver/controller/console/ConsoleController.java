package com.dudu.duduserver.controller.console;

import com.dudu.duduserver.common.R;
import com.dudu.duduserver.config.auth.JwtUser;
import com.dudu.duduserver.config.auth.Me;
import com.dudu.duduserver.dto.ConsoleIdentityRequests;
import com.dudu.duduserver.service.ConsoleIdentityService;
import com.dudu.duduserver.vo.ConsoleLoginVO;
import com.dudu.duduserver.vo.ConsoleProfileVO;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 企业管理员认证与个人账号入口。
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/console")
public class ConsoleController {
    private final ConsoleIdentityService identity;

    @PostMapping("/login")
    public R<ConsoleLoginVO> login(@Valid @RequestBody ConsoleIdentityRequests.Login request,
                                  HttpServletResponse response) {
        response.setHeader(HttpHeaders.CACHE_CONTROL, "no-store");
        return R.ok(identity.login(request));
    }

    @GetMapping("/profile")
    public R<ConsoleProfileVO> profile(@Me JwtUser me) {
        return R.ok(identity.profile(me));
    }

    @PutMapping("/profile/password")
    public R<Void> password(@Me JwtUser me, @Valid @RequestBody ConsoleIdentityRequests.PasswordChange request) {
        identity.changePassword(me, request);
        return R.ok();
    }

    @PostMapping("/logout")
    public R<Void> logout() {
        return R.ok();
    }
}
