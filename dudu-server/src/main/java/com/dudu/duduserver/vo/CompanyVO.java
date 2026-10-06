package com.dudu.duduserver.vo;

import cn.hutool.core.bean.BeanUtil;
import com.dudu.duduserver.constant.EnableStatusEnum;
import com.dudu.duduserver.entity.CompanyDO;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * 企业视图；选填资料未填写为 null，时间为 yyyy-MM-dd HH:mm:ss，状态为 0/1。
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class CompanyVO {

    private String companyId;

    private String companyName;

    private String contactName;

    private String contactInfo;

    private String remark;

    private EnableStatusEnum status;

    private String disableReason;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;

    // 仅映射此视图声明的公开字段，保留 ID 字符串与 null 语义
    public static CompanyVO of(CompanyDO source) {
        return BeanUtil.toBean(source, CompanyVO.class);
    }
}
