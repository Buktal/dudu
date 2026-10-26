package com.dudu.duduserver.controller.console;

import com.dudu.duduserver.common.R;
import com.dudu.duduserver.config.auth.JwtUser;
import com.dudu.duduserver.config.auth.Me;
import com.dudu.duduserver.translation.TranslationModels.*;
import com.dudu.duduserver.translation.TranslationService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

/**
 * 企业管理员翻译服务配置入口，读取结果永不包含真实凭据。
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/console/translation")
public class ConsoleTranslationController {
    private final TranslationService translation;
    @GetMapping public R<View> get(@Me JwtUser me) { return R.ok(translation.configuration(me)); }
    @PutMapping public R<View> save(@Me JwtUser me, @Valid @RequestBody Save request) { return R.ok(translation.save(me, request)); }
    @PostMapping("/test") public R<Result> test(@Me JwtUser me, @Valid @RequestBody Test request) { return R.ok(translation.test(me, request)); }
}
