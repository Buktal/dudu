package com.dudu.duduserver.vo;

/**
 * 企业资源汇总：员工/接待组/渠道接入账号的真实计数，实时聚合、不落统计表。
 * 接待组与渠道接入账号的状态口径未定（Console 阶段补充），当前仅提供总数。
 */
public record ResourceSummaryVO(
    String companyId,
    Long employeeCount,
    Long enabledEmployeeCount,
    Long groupCount,
    Long channelAccountCount) {
}
