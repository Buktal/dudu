package com.dudu.duduserver.controller.desk;

import com.dudu.duduserver.config.auth.JwtUser;
import com.dudu.duduserver.config.auth.Me;
import com.dudu.duduserver.service.DeskMediaService;
import com.dudu.duduserver.vo.DeskMediaVO;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Desk 消息媒体入口：成功直接返回渠道素材字节与内容类型（Desk 以认证请求取 Blob），
 * 索引不存在、鉴权与渠道错误沿用全局 R 错误语义；路径落在 /api/desk/** 企业员工守卫内。
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/desk/messages")
public class DeskMediaController {

    private final DeskMediaService deskMediaService;

    // index 缺省 0，语义见契约第 3 节；渠道给出无法使用的内容类型时按二进制流返回
    @GetMapping("/{messageId}/media")
    public ResponseEntity<byte[]> media(@Me JwtUser user,
                                        @PathVariable String messageId,
                                        @RequestParam(required = false) String index) {
        DeskMediaVO media = deskMediaService.media(user, messageId, index);
        return ResponseEntity.ok()
            .contentType(contentType(media.contentType()))
            .body(media.bytes());
    }

    private MediaType contentType(String value) {
        try {
            return MediaType.parseMediaType(value);
        } catch (IllegalArgumentException e) {
            return MediaType.APPLICATION_OCTET_STREAM;
        }
    }
}
