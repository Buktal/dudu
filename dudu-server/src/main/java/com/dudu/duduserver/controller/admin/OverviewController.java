package com.dudu.duduserver.controller.admin;

import com.dudu.duduserver.config.response.R;
import com.dudu.duduserver.service.OverviewService;
import com.dudu.duduserver.vo.OverviewVO;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 运营概览入口：企业总量、启停数量与近期开通情况，全部来自实时聚合。
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/admin")
public class OverviewController {

    private final OverviewService overviewService;

    @GetMapping("/overview")
    public R<OverviewVO> overview() {
        return R.ok(overviewService.overview());
    }
}
