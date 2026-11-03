package com.dudu.duduserver.service.impl;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.dudu.duduserver.channel.kuaishou.KuaishouVisitorNames;
import com.dudu.duduserver.channel.support.Texts;
import com.dudu.duduserver.entity.VisitorDO;
import com.dudu.duduserver.service.VisitorService;
import org.springframework.stereotype.Component;

/**
 * 快手访客名称查询的生产实现：按渠道账号与外部用户标识取访客名称（入站时留存的
 * fromUser.nickName）。只读查询，不新增表与列。
 */
@Component
public class KuaishouVisitorNameFinder implements KuaishouVisitorNames {

    private final VisitorService visitorService;

    public KuaishouVisitorNameFinder(VisitorService visitorService) {
        this.visitorService = visitorService;
    }

    @Override
    public String nameOf(Long companyChannelId, String externalUserId) {
        VisitorDO visitor = visitorService.getOne(Wrappers.<VisitorDO>lambdaQuery()
            .eq(VisitorDO::getCompanyChannelId, companyChannelId)
            .eq(VisitorDO::getExternalUserId, externalUserId));
        return visitor == null ? null : Texts.blankToNull(visitor.getName());
    }
}
