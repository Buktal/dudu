package com.dudu.duduserver.service;

import com.dudu.duduserver.vo.OverviewVO;
import com.dudu.duduserver.vo.ResourceSummaryVO;

/**
 * 运营概览与企业资源汇总：全部实时聚合查询，不建统计表、不落冗余计数。
 */
public interface OverviewService {

    // 运营概览：企业总量、启停数量、近期开通数与最近创建的企业
    OverviewVO overview();

    // 企业资源汇总：员工（含启用数）、接待组、渠道接入账号的真实计数
    ResourceSummaryVO resourceSummary(String companyId);
}
