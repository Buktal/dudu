package com.dudu.duduserver.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 渠道接入账号，一个账号只归属一个接待组。本轮仅支撑资源汇总的真实计数，
 * 启停、授权与连接健康状态由 Console 阶段另行设计。
 */
@Data
@TableName("channel_account")
public class ChannelAccountDO {

    // 渠道接入账号标识，自增
    @TableId(value = "channel_account_id", type = IdType.AUTO)
    private Long channelAccountId;

    // 所属企业
    private Long companyId;

    // 唯一负责的接待组
    private Long groupId;

    // 渠道类型（微信/支付宝等）
    private String channel;

    // 账号展示名称
    private String accountName;

    // 渠道侧外部账号标识
    private String externalAccountId;

    // 创建时间    @TableField(value = "create_time", fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    // 最后修改时间    @TableField(value = "update_time", fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;
}
