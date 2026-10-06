package com.dudu.duduserver.vo;

/**
 * 随机生成的企业 ID 候选；后端已查重但不预留，创建以事务提交为准。
 */
public record IdCandidateVO(String companyId) {
}
