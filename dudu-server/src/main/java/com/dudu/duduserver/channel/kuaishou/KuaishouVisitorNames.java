package com.dudu.duduserver.channel.kuaishou;

/**
 * 快手访客名称查询（事实见 docs/research/channels/kuaishou.md §6.5.2）：发送接口的
 * toUser/User 结构无 openId 字段，买家以 nickName 寻址（与推送侧 User 含 openId 不
 * 对称），发送时需按渠道访客标识取库中访客名称。业务侧实现（ADR-0014：业务表访问
 * 不进 channel 包），接口留在渠道 seam 由发送器注入。
 */
public interface KuaishouVisitorNames {

    // 查不到访客或名称空白返回 null，由发送侧如实失败
    String nameOf(Long companyChannelId, String externalUserId);
}
