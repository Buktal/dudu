package com.dudu.duduserver.vo;

/**
 * 企业 ID 可用性检测结果；占用是正常查询结果，网络或数据库失败单独返回错误。
 */
public record IdAvailabilityVO(String companyId, Boolean available) {
}
