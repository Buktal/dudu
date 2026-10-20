package com.dudu.duduserver.controller.console;

import com.dudu.duduserver.common.P;
import com.dudu.duduserver.common.R;
import com.dudu.duduserver.config.auth.JwtUser;
import com.dudu.duduserver.config.auth.Me;
import com.dudu.duduserver.dto.ConsoleEmployeeQuery;
import com.dudu.duduserver.dto.ConsoleIdentityRequests;
import com.dudu.duduserver.service.ConsoleEmployeeService;
import com.dudu.duduserver.vo.ConsoleEmployeeVO;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 初始企业管理员的员工管理 HTTP 接口。
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/console/employees")
public class ConsoleEmployeeController {
    private final ConsoleEmployeeService employees;

    @PostMapping("/query")
    public P<ConsoleEmployeeVO> query(@Me JwtUser me, @Valid @RequestBody ConsoleEmployeeQuery query) {
        return employees.query(me, query);
    }

    @GetMapping("/{userId}")
    public R<ConsoleEmployeeVO> detail(@Me JwtUser me, @PathVariable String userId) {
        return R.ok(employees.detail(me, userId));
    }

    @PostMapping
    public R<ConsoleEmployeeVO> create(@Me JwtUser me, @Valid @RequestBody ConsoleIdentityRequests.CreateEmployee request) {
        return R.ok(employees.create(me, request));
    }

    @PutMapping("/{userId}")
    public R<ConsoleEmployeeVO> rename(@Me JwtUser me, @PathVariable String userId,
                                       @Valid @RequestBody ConsoleIdentityRequests.Name request) {
        return R.ok(employees.rename(me, userId, request));
    }

    @PutMapping("/{userId}/status")
    public R<ConsoleEmployeeVO> status(@Me JwtUser me, @PathVariable String userId,
                                       @Valid @RequestBody ConsoleIdentityRequests.Status request) {
        return R.ok(employees.status(me, userId, request));
    }

    @PutMapping("/{userId}/role")
    public R<ConsoleEmployeeVO> role(@Me JwtUser me, @PathVariable String userId,
                                     @Valid @RequestBody ConsoleIdentityRequests.Role request) {
        return R.ok(employees.role(me, userId, request));
    }

    @PutMapping("/{userId}/password")
    public R<Void> password(@Me JwtUser me, @PathVariable String userId,
                             @Valid @RequestBody ConsoleIdentityRequests.PasswordReset request) {
        employees.resetPassword(me, userId, request);
        return R.ok();
    }
}
