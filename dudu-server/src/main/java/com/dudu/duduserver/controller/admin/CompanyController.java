package com.dudu.duduserver.controller.admin;

import com.dudu.duduserver.config.auth.JwtUser;
import com.dudu.duduserver.config.auth.Me;
import com.dudu.duduserver.config.response.P;
import com.dudu.duduserver.config.response.R;
import com.dudu.duduserver.config.validate.Query;
import com.dudu.duduserver.config.validate.Save;
import com.dudu.duduserver.constant.EnableStatusEnum;
import com.dudu.duduserver.dto.*;
import com.dudu.duduserver.service.CompanyService;
import com.dudu.duduserver.service.OverviewService;
import com.dudu.duduserver.vo.*;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

/**
 * 企业开通与维护入口：ID 候选/检测、创建（含初始管理员）、查询、编辑、启停状态、
 * 管理员密码重置与企业资源汇总。所有端点要求平台管理员角色（AdminGuardInterceptor）。
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/admin/companies")
public class CompanyController {

    private final CompanyService companyService;
    private final OverviewService overviewService;

    @PostMapping
    public R<CompanyVO> create(@Validated(Save.class) @RequestBody CompanyCreateDTO request,
                               @Me JwtUser user) {
        return R.ok(companyService.save(request, user.userId()));
    }

    @GetMapping
    public P<CompanyVO> list(@Validated(Query.class) CompanyListQuery query) {
        return companyService.list(query);
    }

    @PostMapping("/id_candidates")
    public R<IdCandidateVO> generateIdCandidate() {
        return R.ok(new IdCandidateVO(companyService.generateIdCandidate()));
    }

    // 可用性是即时快照（检测不占号、不预留），显式禁止客户端与中间层缓存
    @GetMapping("/id_availability")
    public R<IdAvailabilityVO> checkIdAvailability(@RequestParam String companyId,
                                                   HttpServletResponse response) {
        response.setHeader(HttpHeaders.CACHE_CONTROL, "no-store");
        return R.ok(companyService.checkIdAvailability(companyId));
    }

    @GetMapping("/{companyId}")
    public R<CompanyDetailVO> detail(@PathVariable String companyId) {
        return R.ok(companyService.getDetail(companyId));
    }

    @PutMapping("/{companyId}")
    public R<CompanyVO> updateProfile(@PathVariable String companyId,
                                      @Validated(Save.class) @RequestBody CompanyUpdateDTO request, @Me JwtUser user) {
        return R.ok(companyService.updateProfile(companyId, request, user.userId()));
    }

    // 启停共用一个状态端点：0 停用（原因必填，服务层校验）、1 恢复（忽略并清空原因）
    @PutMapping("/{companyId}/status")
    public R<Void> updateStatus(@PathVariable String companyId,
                                @Validated(Save.class) @RequestBody CompanyStatusDTO request, @Me JwtUser user) {
        if (request.status() == EnableStatusEnum.DISABLED.code) {
            companyService.disable(companyId, request.disableReason(), user.userId());
        } else {
            companyService.enable(companyId, user.userId());
        }
        return R.ok();
    }

    // 重置目标是企业的初始管理员，设置其新密码
    @PutMapping("/{companyId}/admin_password")
    public R<Void> resetInitialAdminPassword(@PathVariable String companyId,
                                             @Validated(Save.class) @RequestBody AdminPasswordResetDTO request, @Me JwtUser user) {
        companyService.resetInitialAdminPassword(companyId, request, user.userId());
        return R.ok();
    }

    @GetMapping("/{companyId}/resource_summary")
    public R<ResourceSummaryVO> resourceSummary(@PathVariable String companyId) {
        return R.ok(overviewService.resourceSummary(companyId));
    }
}
