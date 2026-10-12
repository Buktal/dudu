package com.dudu.duduserver.controller.desk;

import com.dudu.duduserver.common.R;
import com.dudu.duduserver.config.auth.JwtUser;
import com.dudu.duduserver.config.auth.Me;
import com.dudu.duduserver.dto.DeskVisitorQueryDTO;
import com.dudu.duduserver.service.DeskVisitorService;
import com.dudu.duduserver.vo.DeskConversationVO;
import com.dudu.duduserver.vo.DeskVisitorPageVO;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Desk 访客资源入口：授权范围内的摘要列表查询与单访客当前快照；
 * 组合筛选与分页用 POST + JSON 请求体，响应元信息容纳在 R.data，不改通用 P。
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/desk/visitors")
public class DeskVisitorController {

    private final DeskVisitorService deskVisitorService;

    // 查询体可省略：全部字段都有契约缺省值，省略时按授权范围返回默认页
    @PostMapping("/query")
    public R<DeskVisitorPageVO> query(@Me JwtUser user,
                                      @RequestBody(required = false) DeskVisitorQueryDTO request) {
        return R.ok(deskVisitorService.query(user, request == null ? emptyQuery() : request));
    }

    @GetMapping("/{visitorId}")
    public R<DeskConversationVO> get(@Me JwtUser user, @PathVariable String visitorId) {
        return R.ok(deskVisitorService.get(user, visitorId));
    }

    private DeskVisitorQueryDTO emptyQuery() {
        return new DeskVisitorQueryDTO(null, null, null, null, null, null);
    }
}
