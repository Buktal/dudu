package com.dudu.duduserver.controller.channel;

import com.dudu.duduserver.channel.ChannelCallbackResult;
import com.dudu.duduserver.service.ChannelCallbackService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 渠道回调入口：GET 供渠道验证 URL、POST 接收渠道原格式推送；只开放这一条路径，
 * 响应遵循渠道协议（原样回显 echostr 或回 success），错误用 HTTP 状态表达，不套 R 包装。
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/channels")
public class ChannelCallbackController {

    // 渠道回调报文只有签名校验，没有 Desk 身份
    private final ChannelCallbackService channelCallbackService;

    @GetMapping("/{companyChannelId}/callback")
    public ResponseEntity<String> verify(@PathVariable String companyChannelId,
                                         @RequestParam Map<String, String> query) {
        return respond(channelCallbackService.verifyUrl(companyChannelId, query));
    }

    @PostMapping("/{companyChannelId}/callback")
    public ResponseEntity<String> receive(@PathVariable String companyChannelId,
                                          @RequestParam Map<String, String> query,
                                          @RequestBody(required = false) String body) {
        return respond(channelCallbackService.receive(companyChannelId, query, body == null ? "" : body));
    }

    private ResponseEntity<String> respond(ChannelCallbackResult result) {
        return ResponseEntity.status(result.status())
            .contentType(MediaType.parseMediaType("text/plain;charset=UTF-8"))
            .body(result.body());
    }
}
