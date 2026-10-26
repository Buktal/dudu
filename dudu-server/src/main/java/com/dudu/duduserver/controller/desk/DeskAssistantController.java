package com.dudu.duduserver.controller.desk;

import com.dudu.duduserver.assistant.AssistantModels;
import com.dudu.duduserver.assistant.AssistantService;
import com.dudu.duduserver.common.R;
import com.dudu.duduserver.config.auth.JwtUser;
import com.dudu.duduserver.config.auth.Me;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 坐席内部 AI 助手入口，沿用企业身份和接待范围校验。
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/desk")
public class DeskAssistantController {
    private final AssistantService assistant;

    @GetMapping("/assistant")
    public R<AssistantModels.Availability> availability(@Me JwtUser me) {
        return R.ok(assistant.availability(me));
    }

    @PostMapping("/visitors/{visitorId}/assistant")
    public R<AssistantModels.Result> ask(@Me JwtUser me, @PathVariable String visitorId,
                                       @Valid @RequestBody AssistantModels.Request request) {
        return R.ok(assistant.ask(me, visitorId, request));
    }
}
