package com.dudu.duduserver.controller.desk;

import com.dudu.duduserver.common.R;
import com.dudu.duduserver.config.auth.JwtUser;
import com.dudu.duduserver.config.auth.Me;
import com.dudu.duduserver.translation.TranslationModels.*;
import com.dudu.duduserver.translation.TranslationService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

/**
 * 坐席阅读翻译入口，与消息发送协议分离。
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/desk")
public class DeskTranslationController {
    private final TranslationService translation;
    @GetMapping("/translation/preferences") public R<Preference> get(@Me JwtUser me) { return R.ok(translation.preference(me)); }
    @PutMapping("/translation/preferences") public R<Preference> save(@Me JwtUser me, @Valid @RequestBody Preference request) { return R.ok(translation.savePreference(me, request)); }
    @PostMapping("/messages/{messageId}/translation") public R<Result> translate(@Me JwtUser me, @PathVariable Long messageId, @Valid @RequestBody Request request) {
        return R.ok(translation.translate(me, messageId, request));
    }
}
