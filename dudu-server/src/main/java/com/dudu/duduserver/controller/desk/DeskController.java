package com.dudu.duduserver.controller.desk;

import com.dudu.duduserver.common.R;
import com.dudu.duduserver.common.Save;
import com.dudu.duduserver.config.auth.JwtUser;
import com.dudu.duduserver.config.auth.Me;
import com.dudu.duduserver.dto.DeskLoginDTO;
import com.dudu.duduserver.service.DeskAuthService;
import com.dudu.duduserver.vo.DeskLoginVO;
import com.dudu.duduserver.vo.DeskProfileVO;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 企业接待入口：企业登录签发 token、按 token 恢复当前身份与接待范围、无状态退出；
 * 登录端点在 WebConfig 放行，其余路径由 DeskAuthInterceptor 校验企业员工身份。
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/desk")
public class DeskController {

    private final DeskAuthService deskAuthService;

    // 登录响应含即时签发的 token，不得被客户端或中间层缓存
    @PostMapping("/login")
    public R<DeskLoginVO> login(@Validated(Save.class) @RequestBody DeskLoginDTO request,
                                HttpServletResponse response) {
        response.setHeader(HttpHeaders.CACHE_CONTROL, "no-store");
        return R.ok(deskAuthService.login(request));
    }

    // 无状态退出：不写撤销记录，旧 token 有效至过期，由客户端清理本地凭据
    @PostMapping("/logout")
    public R<Void> logout() {
        return R.ok();
    }

    @GetMapping("/profile")
    public R<DeskProfileVO> profile(@Me JwtUser user) {
        return R.ok(deskAuthService.getProfile(user));
    }
}
