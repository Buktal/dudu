package com.dudu.duduserver.vo;

import java.util.List;

/**
 * 运营概览：企业总量、启停数量与近期开通情况（近 7 天开通数 + 最近创建的 10 家企业）。
 */
public record AdminOverviewVO(
    Long companyCount,
    Long companyEnabledCount,
    Long companyDisabledCount,
    Long companyCreatedLast7DaysCount,
    List<CompanyVO> recentCompanies) {
}
