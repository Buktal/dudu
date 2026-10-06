package com.dudu.duduserver.controller.admin;

import com.dudu.duduserver.common.P;
import com.dudu.duduserver.common.Query;
import com.dudu.duduserver.dto.OperationLogQuery;
import com.dudu.duduserver.service.OperationLogService;
import com.dudu.duduserver.vo.OperationLogVO;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 平台操作记录查询入口：按目标企业、动作过滤，操作时间倒序分页。
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/admin/operation_logs")
public class OperationLogController {

    private final OperationLogService operationLogService;

    @PostMapping("/query")
    public P<OperationLogVO> list(@Validated(Query.class) @RequestBody OperationLogQuery query) {
        return operationLogService.list(query);
    }
}
