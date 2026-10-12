package com.dudu.duduserver.controller.desk;

import com.dudu.duduserver.common.R;
import com.dudu.duduserver.config.auth.JwtUser;
import com.dudu.duduserver.config.auth.Me;
import com.dudu.duduserver.dto.DeskHistoryQueryDTO;
import com.dudu.duduserver.dto.DeskSendDTO;
import com.dudu.duduserver.dto.DeskStatusDTO;
import com.dudu.duduserver.dto.DeskVisitorQueryDTO;
import com.dudu.duduserver.service.DeskReplyService;
import com.dudu.duduserver.service.DeskVisitorService;
import com.dudu.duduserver.vo.DeskCapabilityVO;
import com.dudu.duduserver.vo.DeskConversationVO;
import com.dudu.duduserver.vo.DeskMessagePageVO;
import com.dudu.duduserver.vo.DeskMessageVO;
import com.dudu.duduserver.vo.DeskVisitorPageVO;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Desk 访客资源入口：授权范围内的摘要列表查询、单访客当前快照、按需历史分页、
 * 文本回复、回复能力与结束 / 继续接待；组合筛选与分页用 POST + JSON 请求体，
 * 状态变更用 PUT + JSON 请求体，历史与能力简单查询用 GET，响应元信息容纳在 R.data。
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/desk/visitors")
public class DeskVisitorController {

    private final DeskVisitorService deskVisitorService;
    private final DeskReplyService deskReplyService;

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

    // 两个查询参数都可省略：缺省读取最近一页；解析与范围校验在服务层按统一错误码给出
    @GetMapping("/{visitorId}/messages")
    public R<DeskMessagePageVO> messages(@Me JwtUser user,
                                         @PathVariable String visitorId,
                                         @RequestParam(required = false) String beforeSequence,
                                         @RequestParam(required = false) String limit) {
        return R.ok(deskVisitorService.history(user, visitorId, new DeskHistoryQueryDTO(beforeSequence, limit)));
    }

    // 提交纯文本回复：返回与推送共用同一条最终消息，渠道失败也返回已保存的 delivery.failed
    @PostMapping("/{visitorId}/messages")
    public R<DeskMessageVO> send(@Me JwtUser user,
                                 @PathVariable String visitorId,
                                 @RequestBody DeskSendDTO request) {
        return R.ok(deskReplyService.send(user, visitorId, request));
    }

    @GetMapping("/{visitorId}/capability")
    public R<DeskCapabilityVO> capability(@Me JwtUser user, @PathVariable String visitorId) {
        return R.ok(deskReplyService.capability(user, visitorId));
    }

    // 结束（closed）或继续（needs-reply）接待：HTTP 返回与 conversation 推送共用同一份会话对象
    @PutMapping("/{visitorId}/status")
    public R<DeskConversationVO> updateStatus(@Me JwtUser user,
                                              @PathVariable String visitorId,
                                              @RequestBody DeskStatusDTO request) {
        return R.ok(deskVisitorService.updateStatus(user, visitorId, request));
    }

    private DeskVisitorQueryDTO emptyQuery() {
        return new DeskVisitorQueryDTO(null, null, null, null, null, null);
    }
}
