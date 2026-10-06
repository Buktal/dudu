package com.dudu.duduserver.vo;

import com.dudu.duduserver.entity.CompanyDO;

import java.time.LocalDateTime;

/**
 * 企业视图；选填资料未填写为 null，时间为 yyyy-MM-dd HH:mm:ss，状态为 0/1。
 */
public record CompanyVO(
    String companyId,
    String companyName,
    String contactName,
    String contactInfo,
    String remark,
    Integer status,
    String disableReason,
    LocalDateTime createTime,
    LocalDateTime updateTime) {

    // 由企业实体映射，企业 ID 统一十进制字符串
    public static CompanyVO of(CompanyDO company) {
        return new CompanyVO(
            String.valueOf(company.getCompanyId()),
            company.getCompanyName(),
            company.getContactName(),
            company.getContactInfo(),
            company.getRemark(),
            company.getStatus(),
            company.getDisableReason(),
            company.getCreateTime(),
            company.getUpdateTime());
    }
}
