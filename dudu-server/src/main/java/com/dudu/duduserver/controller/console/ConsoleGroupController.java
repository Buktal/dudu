package com.dudu.duduserver.controller.console;

import com.dudu.duduserver.common.*;
import com.dudu.duduserver.config.auth.*;
import com.dudu.duduserver.dto.*;
import com.dudu.duduserver.service.ConsoleGroupService;
import com.dudu.duduserver.util.ConsoleIds;
import com.dudu.duduserver.vo.*;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

/**
 * 企业管理端用户组及真实成员接口。
 */
@RestController
@RequestMapping("/api/console/user_groups")
@RequiredArgsConstructor
public class ConsoleGroupController {
    private final ConsoleGroupService service;

    @PostMapping("/query")
    public P<ConsoleGroupVO> query(@Me JwtUser me, @RequestBody ConsoleGroupQuery query) {
        return service.query(me, query);
    }

    @PostMapping
    public R<ConsoleGroupVO> create(@Me JwtUser me, @Valid @RequestBody ConsoleGroupSaveDTO dto) {
        return R.ok(service.create(me, dto));
    }

    @GetMapping("/{groupId}")
    public R<ConsoleGroupVO> detail(@Me JwtUser me, @PathVariable String groupId) {
        return R.ok(service.detail(me, ConsoleIds.parse(groupId)));
    }

    @PutMapping("/{groupId}")
    public R<ConsoleGroupVO> rename(@Me JwtUser me, @PathVariable String groupId,
                                     @Valid @RequestBody ConsoleGroupSaveDTO dto) {
        return R.ok(service.rename(me, ConsoleIds.parse(groupId), dto));
    }

    @GetMapping("/{groupId}/members")
    public P<ConsoleGroupMemberVO> members(@Me JwtUser me, @PathVariable String groupId, PageQuery query) {
        return service.members(me, ConsoleIds.parse(groupId), query);
    }

    @GetMapping("/{groupId}/member_candidates")
    public P<ConsoleGroupCandidateVO> candidates(@Me JwtUser me, @PathVariable String groupId, ConsoleGroupQuery query) {
        return service.candidates(me, ConsoleIds.parse(groupId), query);
    }

    @PutMapping("/{groupId}/members/{userId}")
    public R<ConsoleGroupMembershipVO> add(@Me JwtUser me, @PathVariable String groupId, @PathVariable String userId) {
        return R.ok(service.membership(me, ConsoleIds.parse(groupId), ConsoleIds.parse(userId), true));
    }

    @DeleteMapping("/{groupId}/members/{userId}")
    public R<ConsoleGroupMembershipVO> remove(@Me JwtUser me, @PathVariable String groupId, @PathVariable String userId) {
        return R.ok(service.membership(me, ConsoleIds.parse(groupId), ConsoleIds.parse(userId), false));
    }
}
