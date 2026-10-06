package com.dudu.duduserver.controller.admin;

import com.dudu.duduserver.common.R;
import com.dudu.duduserver.common.Save;
import com.dudu.duduserver.config.auth.JwtUser;
import com.dudu.duduserver.config.auth.Me;
import com.dudu.duduserver.dto.AdminLoginDTO;
import com.dudu.duduserver.dto.AdminPasswordChangeDTO;
import com.dudu.duduserver.service.AuthService;
import com.dudu.duduserver.service.OverviewService;
import com.dudu.duduserver.vo.AdminDetailVO;
import com.dudu.duduserver.vo.AdminLoginVO;
import com.dudu.duduserver.vo.AdminOverviewVO;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

/**
 * 平台管理入口：登录签发 token、退出由客户端清理 token、个人资料和运营概览。
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/admin")
public class AdminController {

    private final AuthService authService;
    private final OverviewService overviewService;

    // 登录响应含即时签发的 token，不得被客户端或中间层缓存
    @PostMapping("/login")
    public R<AdminLoginVO> login(@Validated(Save.class) @RequestBody AdminLoginDTO request,
                            HttpServletResponse response) {
        response.setHeader(HttpHeaders.CACHE_CONTROL, "no-store");
        return R.ok(authService.login(request));
    }

    // 无状态退出，客户端收到成功响应后清理本地 token
    @PostMapping("/logout")
    public R<Void> logout() {
        return R.ok();
    }

    @GetMapping("/profile")
    public R<AdminDetailVO> profile(@Me JwtUser user) {
        return R.ok(authService.getDetail(user));
    }

    @PutMapping("/profile/password")
    public R<Void> changePassword(@Validated(Save.class) @RequestBody AdminPasswordChangeDTO request,
                                  @Me JwtUser user) {
        authService.updatePassword(user, request);
        return R.ok();
    }

    @GetMapping("/overview")
    public R<AdminOverviewVO> overview() {
        return R.ok(overviewService.getOverview());
    }
}
