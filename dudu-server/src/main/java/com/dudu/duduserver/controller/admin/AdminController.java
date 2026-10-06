package com.dudu.duduserver.controller.admin;

import com.dudu.duduserver.config.auth.JwtUser;
import com.dudu.duduserver.config.auth.Me;
import com.dudu.duduserver.config.response.R;
import com.dudu.duduserver.config.validate.Save;
import com.dudu.duduserver.dto.AdminPasswordChangeDTO;
import com.dudu.duduserver.dto.AdminLoginDTO;
import com.dudu.duduserver.service.AuthService;
import com.dudu.duduserver.vo.AdminDetailVO;
import com.dudu.duduserver.vo.AdminLoginVO;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

/**
 * 平台管理员自身入口：登录校验凭据并签发 token，退出弃用 token；详情与改密要求已登录（AuthInterceptor），
 * 登录端点在 WebConfig 放行。首版无服务端撤销，退出由客户端弃用 token。
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/admin")
public class AdminController {

    private final AuthService authService;

    // 登录响应含即时签发的 token，不得被客户端或中间层缓存
    @PostMapping("/login")
    public R<AdminLoginVO> login(@Validated(Save.class) @RequestBody AdminLoginDTO request,
                            HttpServletResponse response) {
        response.setHeader(HttpHeaders.CACHE_CONTROL, "no-store");
        return R.ok(authService.login(request));
    }

    // 退出无服务端状态可清理；保留端点仅为客户端语义完整
    @PostMapping("/logout")
    public R<Void> logout() {
        return R.ok();
    }

    @GetMapping("/profile")
    public R<AdminDetailVO> profile(@Me JwtUser user) {
        return R.ok(authService.getDetail(user));
    }

    @PutMapping("/password")
    public R<Void> changePassword(@Validated(Save.class) @RequestBody AdminPasswordChangeDTO request,
                                  @Me JwtUser user) {
        authService.updatePassword(user, request);
        return R.ok();
    }
}
