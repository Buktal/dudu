package com.dudu.duduserver.controller.console;

import com.dudu.duduserver.channel.console.ConsoleCallbackUrls;
import com.dudu.duduserver.channel.console.ConsoleChannelDefinition;
import com.dudu.duduserver.common.P;
import com.dudu.duduserver.common.R;
import com.dudu.duduserver.config.auth.JwtUser;
import com.dudu.duduserver.config.auth.Me;
import com.dudu.duduserver.config.exception.BizException;
import com.dudu.duduserver.constant.ApiEnum;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.dudu.duduserver.dto.ConsoleChannelRequests;
import com.dudu.duduserver.service.ConsoleChannelService;
import com.dudu.duduserver.vo.ConsoleChannelVO;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.Validator;
import jakarta.validation.ConstraintViolationException;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.web.bind.annotation.*;
import java.util.List;
import java.util.Map;
import java.io.IOException;

/**
 * 企业内部渠道管理入口，回调根地址只从部署配置或服务端 origin 派生。
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/console")
public class ConsoleChannelController {
    private final ConsoleChannelService channels;
    private final ObjectMapper objectMapper;
    private final Validator validator;

    @GetMapping("/channels")
    public R<Map<String, List<ConsoleChannelDefinition>>> catalog(@Me JwtUser me, HttpServletRequest request) {
        return R.ok(Map.of("channels", channels.catalog(me, ConsoleCallbackUrls.originOf(request))));
    }

    @PostMapping("/company_channels/query")
    public P<ConsoleChannelVO.Account> query(@Me JwtUser me, @Valid @RequestBody ConsoleChannelRequests.Query query) {
        return channels.query(me, query);
    }

    @GetMapping("/company_channels/{id}")
    public R<ConsoleChannelVO.Detail> detail(@Me JwtUser me, @PathVariable String id,
                                            HttpServletRequest request, HttpServletResponse response) {
        response.setHeader(HttpHeaders.CACHE_CONTROL, "no-store");
        return R.ok(channels.detail(me, id, ConsoleCallbackUrls.originOf(request)));
    }

    @PostMapping("/company_channels")
    public R<ConsoleChannelVO.Detail> create(@Me JwtUser me, @RequestBody byte[] body,
                                            HttpServletRequest request) {
        return R.ok(channels.create(me, configurationBody(body, ConsoleChannelRequests.Create.class), ConsoleCallbackUrls.originOf(request)));
    }

    @PutMapping("/company_channels/{id}")
    public R<ConsoleChannelVO.Detail> update(@Me JwtUser me, @PathVariable String id,
                                            @RequestBody byte[] body, HttpServletRequest request) {
        return R.ok(channels.update(me, id, configurationBody(body, ConsoleChannelRequests.Update.class), ConsoleCallbackUrls.originOf(request)));
    }

    @PutMapping("/company_channels/{id}/group")
    public R<ConsoleChannelVO.Detail> move(@Me JwtUser me, @PathVariable String id,
                                          @Valid @RequestBody ConsoleChannelRequests.Move body, HttpServletRequest request) {
        return R.ok(channels.move(me, id, body, ConsoleCallbackUrls.originOf(request)));
    }

    private <T> T configurationBody(byte[] body, Class<T> type) {
        if (body.length > ConsoleChannelRequests.MAX_CONFIGURATION_BYTES) throw new BizException(ApiEnum.PARAM_EXCEED);
        T value;
        try {
            value = objectMapper.readValue(body, type);
        } catch (IOException exception) {
            throw new BizException(ApiEnum.PARAM_ERROR);
        }
        if (value == null) throw new BizException(ApiEnum.PARAM_MISSING);
        var violations = validator.validate(value);
        if (!violations.isEmpty()) throw new ConstraintViolationException(violations);
        return value;
    }
}
