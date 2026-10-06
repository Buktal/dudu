package com.dudu.duduserver.controller.admin;

import com.dudu.duduserver.config.response.P;
import com.dudu.duduserver.config.validate.Query;
import com.dudu.duduserver.dto.OperationLogQuery;
import com.dudu.duduserver.service.OperationLogService;
import com.dudu.duduserver.vo.OperationLogVO;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 平台操作记录查询入口：按目标企业、动作与结果过滤，操作时间倒序分页。
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/admin/operation_logs")
public class OperationLogController {

    private final OperationLogService operationLogService;

    @GetMapping
    public P<OperationLogVO> list(@Validated(Query.class) OperationLogQuery query) {
        return operationLogService.list(query);
    }
}
