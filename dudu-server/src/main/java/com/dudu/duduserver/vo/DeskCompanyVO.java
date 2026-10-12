package com.dudu.duduserver.vo;

import com.dudu.duduserver.entity.CompanyDO;

/**
 * 企业员工的所属企业视图：只暴露企业 ID 与名称，不接受客户端另指定工作区。
 */
public record DeskCompanyVO(String companyId, String companyName) {

    // 企业 ID 对外为十进制字符串
    public static DeskCompanyVO of(CompanyDO source) {
        return new DeskCompanyVO(String.valueOf(source.getCompanyId()), source.getCompanyName());
    }
}
